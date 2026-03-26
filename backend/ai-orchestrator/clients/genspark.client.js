'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · Genspark AI Client
//
// Used for:
//  - Creative expansion (Exploration mode): generate N parallel
//    style/concept variations from a base prompt
//  - Style remix: take existing keyframe + style direction → new variations
//  - Rapid ideation: batch prompt enrichment
//
// Features:
//  - Circuit breaker (5 failures → 60s open window)
//  - Exponential backoff with jitter
//  - Request signing (HMAC-SHA256)
//  - Response normalisation
// ══════════════════════════════════════════════════════════

const axios  = require('axios');
const logger = require('../../shared/utils/logger');
const { hmacSign } = require('../../shared/crypto/encryption');

const BASE_URL    = process.env.GENSPARK_API_BASE || 'https://api.genspark.ai/v1';
const API_KEY     = () => process.env.GENSPARK_API_KEY;
const MAX_RETRIES = 3;
const TIMEOUT_MS  = 60_000;

// ── Circuit breaker ───────────────────────────────────────
let cbOpen        = false;
let cbFailures    = 0;
let cbLastFailure = null;
const CB_THRESHOLD = 5;
const CB_RESET_MS  = 60_000;

function checkCircuit() {
  if (!cbOpen) return;
  if (Date.now() - cbLastFailure > CB_RESET_MS) {
    cbOpen = false; cbFailures = 0;
    logger.info('Genspark circuit breaker reset');
    return;
  }
  throw Object.assign(new Error('Genspark API circuit breaker open'), {
    status: 503, code: 'CIRCUIT_OPEN',
  });
}

function recordFailure(err) {
  cbFailures++;
  cbLastFailure = Date.now();
  if (cbFailures >= CB_THRESHOLD) {
    cbOpen = true;
    logger.error('Genspark circuit breaker opened', { failures: cbFailures, error: err?.message });
  }
}

function recordSuccess() { cbFailures = Math.max(0, cbFailures - 1); }

// ── HTTP helpers ──────────────────────────────────────────
function buildHeaders(body = '') {
  const ts  = Date.now().toString();
  const sig = hmacSign(
    `${ts}:${typeof body === 'string' ? body : JSON.stringify(body)}`,
    API_KEY()
  );
  return {
    'Authorization': `Bearer ${API_KEY()}`,
    'X-Timestamp':   ts,
    'X-Signature':   sig,
    'Content-Type':  'application/json',
    'X-Client-ID':   'designos/1.1.0',
  };
}

async function requestWithRetry(fn, attempt = 0) {
  try {
    checkCircuit();
    const result = await fn();
    recordSuccess();
    return result;
  } catch (err) {
    const retryable = err.response?.status >= 500 ||
                      err.response?.status === 429 ||
                      err.code === 'ECONNRESET' ||
                      err.code === 'ETIMEDOUT';
    if (retryable && attempt < MAX_RETRIES) {
      const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 30000);
      logger.warn('Genspark retry', { attempt: attempt + 1, delay, status: err.response?.status });
      await new Promise(r => setTimeout(r, delay));
      return requestWithRetry(fn, attempt + 1);
    }
    recordFailure(err);
    throw err;
  }
}

// ── API functions ─────────────────────────────────────────

/**
 * generateVariations — core Exploration mode function.
 * Takes a prompt and returns N stylistically diverse variations.
 *
 * @param {object} params
 * @param {string} params.basePrompt       - seed prompt
 * @param {number} params.count            - number of variations (1-8)
 * @param {string} [params.styleDirection] - optional style anchor
 * @param {number} [params.diversityFactor]- 0.0 (similar) to 1.0 (diverse), default 0.8
 * @param {string} [params.industry]       - 'commercial_real_estate' | 'maritime' | 'luxury_branding'
 * @param {string[]} [params.referenceUrls]- optional reference image URLs
 * @returns {Promise<{ variations: Array<{id, prompt, previewDescription, tags}> }>}
 */
async function generateVariations({
  basePrompt, count = 4, styleDirection,
  diversityFactor = 0.8, industry, referenceUrls = [],
}) {
  const body = {
    task:       'creative_expansion',
    base_prompt: basePrompt.slice(0, 2000),
    count:       Math.min(count, 8),
    diversity:   diversityFactor,
    industry:    industry || 'general',
    style_anchor: styleDirection || null,
    reference_images: referenceUrls.slice(0, 4),
    output_format: 'structured',
    constraints: {
      maintain_subject:  true,
      allow_style_shift: true,
      no_watermarks:     true,
    },
  };

  logger.info('Genspark: variation generation', {
    count: body.count, diversity: body.diversity, industry: body.industry,
  });

  const resp = await requestWithRetry(() =>
    axios.post(`${BASE_URL}/creative/expand`, body, {
      headers: buildHeaders(body),
      timeout: TIMEOUT_MS,
    })
  );

  // Normalise response
  const rawVariations = resp.data?.variations || resp.data?.results || [];
  return {
    variations: rawVariations.map((v, i) => ({
      id:                 v.id || `var_${i}`,
      prompt:             v.expanded_prompt || v.prompt || '',
      previewDescription: v.description || v.preview_text || '',
      styleEmphasis:      v.style_emphasis || [],
      tags:               v.tags || [],
      diversityScore:     v.diversity_score || 0,
    })),
    totalGenerated: rawVariations.length,
  };
}

/**
 * remixStyle — take a completed keyframe image and restyle it.
 *
 * @param {object} params
 * @param {string} params.imageUrl       - source image URL
 * @param {string} params.targetStyle    - style description
 * @param {number} [params.strength]     - restyle strength 0.0–1.0, default 0.7
 * @param {boolean} [params.preserveStructure] - keep original composition
 */
async function remixStyle({ imageUrl, targetStyle, strength = 0.7, preserveStructure = true }) {
  const body = {
    task:               'style_remix',
    source_image_url:   imageUrl,
    target_style:       targetStyle.slice(0, 1000),
    remix_strength:     Math.min(1.0, Math.max(0.0, strength)),
    preserve_structure: preserveStructure,
    output_format:      'url',
    output_quality:     'high',
  };

  logger.info('Genspark: style remix', { strength: body.remix_strength });

  const resp = await requestWithRetry(() =>
    axios.post(`${BASE_URL}/creative/remix`, body, {
      headers: buildHeaders(body),
      timeout: TIMEOUT_MS,
    })
  );

  return {
    taskId:     resp.data?.task_id,
    imageUrl:   resp.data?.output?.url || resp.data?.url,
    status:     resp.data?.status || 'pending',
    style:      targetStyle,
  };
}

/**
 * enrichPrompt — use Genspark to expand and structure a raw user prompt
 * into a richer cinematic description.
 *
 * @param {object} params
 * @param {string} params.rawPrompt     - user's raw input
 * @param {string} [params.industry]    - context
 * @param {string} [params.mode]        - 'draft' | 'cinema' | 'exploration'
 */
async function enrichPrompt({ rawPrompt, industry, mode = 'cinema' }) {
  const body = {
    task:      'prompt_enrichment',
    raw_prompt: rawPrompt.slice(0, 1000),
    context: {
      industry: industry || 'general',
      mode,
      platform: 'designos',
    },
    enrichment_targets: [
      'lighting',
      'camera_motion',
      'atmosphere',
      'material_detail',
      'temporal_elements',
    ],
    output_format: 'json',
  };

  const resp = await requestWithRetry(() =>
    axios.post(`${BASE_URL}/creative/enrich`, body, {
      headers: buildHeaders(body),
      timeout: 30_000,
    })
  );

  return {
    enrichedPrompt:    resp.data?.enriched_prompt || rawPrompt,
    sceneDescription:  resp.data?.scene_description || {},
    suggestedSettings: resp.data?.suggested_settings || {},
    confidence:        resp.data?.confidence || 0,
  };
}

/**
 * getTaskStatus — poll async task (remix or expansion with async=true).
 */
async function getTaskStatus(taskId) {
  const resp = await requestWithRetry(() =>
    axios.get(`${BASE_URL}/tasks/${taskId}`, {
      headers: buildHeaders(),
      timeout: 15_000,
    })
  );

  return {
    taskId,
    status:   resp.data?.status,
    progress: resp.data?.progress || 0,
    output:   resp.data?.output || null,
    error:    resp.data?.error  || null,
  };
}

/**
 * healthCheck — verify Genspark API is reachable.
 */
async function healthCheck() {
  try {
    await axios.get(`${BASE_URL}/health`, { headers: buildHeaders(), timeout: 5000 });
    return { healthy: true, cbOpen, cbFailures };
  } catch {
    return { healthy: false, cbOpen, cbFailures };
  }
}

module.exports = {
  generateVariations,
  remixStyle,
  enrichPrompt,
  getTaskStatus,
  healthCheck,
};
