'use strict';
// ══════════════════════════════════════════════════════════════
// DESIGNOS v1.2.0 · CDN & Global Scalability Service
//
// Manages global content distribution, edge caching, and
// high-throughput delivery of AI-generated cinematic outputs.
//
// Architecture:
//   CloudFront (Primary CDN) ── S3 Multi-Region (Origin)
//   Lambda@Edge              ── Auth / Token Validation
//   Redis Cluster            ── Edge URL Cache (5-min TTL)
//   Kafka Queue              ── Async CDN invalidation events
//
// Scalability targets:
//   - 10,000+ concurrent viewers (video streaming)
//   - 100 GB/day output volume
//   - <50ms TTFB from regional PoP
//   - 99.99% availability via multi-CDN fallback
// ══════════════════════════════════════════════════════════════

const logger = require('../../shared/utils/logger');

// ── Configuration ─────────────────────────────────────────────
const CDN_CONFIG = {
  primary: {
    provider:       'cloudfront',
    domain:         () => process.env.CLOUDFRONT_DOMAIN || null,
    distributionId: () => process.env.CLOUDFRONT_DISTRIBUTION_ID || null,
    keyPairId:      () => process.env.CLOUDFRONT_KEY_PAIR_ID || null,
    // CloudFront origin regions
    origins: [
      { region: 'us-east-1',  bucket: () => process.env.S3_BUCKET || 'designos-assets' },
      { region: 'eu-west-1',  bucket: () => process.env.S3_BUCKET_EU || null },
      { region: 'ap-east-1',  bucket: () => process.env.S3_BUCKET_APAC || null },
    ],
  },
  // Second CDN for failover (Fastly / Cloudflare)
  fallback: {
    provider:       'cloudflare',
    domain:         () => process.env.CLOUDFLARE_CDN_DOMAIN || null,
    accountId:      () => process.env.CLOUDFLARE_ACCOUNT_ID || null,
    apiToken:       () => process.env.CLOUDFLARE_API_TOKEN || null,
  },
  // Edge caching TTL by content type (seconds)
  ttl: {
    video:    86400,     // 24h — immutable content-addressed
    image:    3600,      // 1h
    audio:    3600,      // 1h
    manifest: 300,       // 5 min — HLS playlists
    lut:      604800,    // 7 days — rarely change
    api:      0,         // No CDN cache for API responses
  },
  // Geo-routing: direct users to nearest origin bucket
  geoRouting: {
    'US':  'us-east-1',
    'EU':  'eu-west-1',
    'CA':  'us-east-1',
    'AU':  'ap-east-1',
    'SG':  'ap-east-1',
    'JP':  'ap-east-1',
    'BR':  'us-east-1',
    '__default': 'us-east-1',
  },
};

// ── State ─────────────────────────────────────────────────────
let redisClient       = null;
let invalidationQueue = [];   // Batch invalidations
let invalidationTimer = null;

// ── Init ──────────────────────────────────────────────────────
function init(redisInstance = null) {
  if (redisInstance) {
    redisClient = redisInstance;
    logger.info('CDN: Redis edge-cache connected');
  }
  logger.info('CDN: service initialised', {
    primaryDomain:  CDN_CONFIG.primary.domain() || 'not configured',
    fallbackDomain: CDN_CONFIG.fallback.domain() || 'not configured',
  });
}

// ════════════════════════════════════════════════════════════
// DELIVERY URL RESOLUTION
// ════════════════════════════════════════════════════════════

/**
 * Resolve the optimal delivery URL for an asset.
 * Priority: CloudFront → Cloudflare → S3 direct → local
 *
 * @param {string} s3Key  - S3 object key (e.g. "v/2026-03-26/job_abc/scene_01.mp4")
 * @param {object} opts   - { assetType, countryCode, requireSigned, expirySeconds }
 */
function resolveDeliveryUrl(s3Key, opts = {}) {
  const {
    assetType    = _guessAssetType(s3Key),
    countryCode  = 'US',
    requireSigned = false,
  } = opts;

  const primaryDomain = CDN_CONFIG.primary.domain();
  if (primaryDomain) {
    return `https://${primaryDomain}/${s3Key}`;
  }

  const fallbackDomain = CDN_CONFIG.fallback.domain();
  if (fallbackDomain) {
    return `https://${fallbackDomain}/${s3Key}`;
  }

  // S3 direct
  const region = CDN_CONFIG.geoRouting[countryCode] || CDN_CONFIG.geoRouting.__default;
  const bucket  = CDN_CONFIG.primary.origins.find(o => o.region === region)?.bucket() ||
                  CDN_CONFIG.primary.origins[0].bucket();
  return `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`;
}

/**
 * Build the full CDN URL set for a job output (multiple resolutions / formats)
 */
function buildJobDeliveryManifest(job) {
  const outputs = job.outputs || [];
  return {
    jobId:    job.id,
    cdn: {
      primary:  CDN_CONFIG.primary.domain(),
      fallback: CDN_CONFIG.fallback.domain(),
    },
    assets: outputs.map(output => ({
      scene_id:     output.scene_id,
      type:         output.type || 'video',
      url:          resolveDeliveryUrl(output.s3Key, { assetType: output.type }),
      s3Key:        output.s3Key,
      duration_s:   output.duration_s,
      resolution:   output.resolution,
      ttl:          CDN_CONFIG.ttl[output.type] || CDN_CONFIG.ttl.video,
    })),
    total_scenes: outputs.length,
    delivery_at:  new Date().toISOString(),
  };
}

// ════════════════════════════════════════════════════════════
// CACHE MANAGEMENT
// ════════════════════════════════════════════════════════════

/**
 * Cache a resolved URL in Redis to reduce signing overhead.
 * Key: cdn:url:{s3key}  TTL: 80% of content TTL
 */
async function cacheUrl(s3Key, url, assetType = 'video') {
  if (!redisClient) return;
  const ttl = Math.floor((CDN_CONFIG.ttl[assetType] || 3600) * 0.8);
  const key  = `cdn:url:${s3Key}`;
  try {
    await redisClient.set(key, url, 'EX', ttl);
  } catch (err) {
    logger.warn('CDN: Redis cache set failed', { error: err.message });
  }
}

async function getCachedUrl(s3Key) {
  if (!redisClient) return null;
  try {
    return await redisClient.get(`cdn:url:${s3Key}`);
  } catch {
    return null;
  }
}

async function invalidateCachedUrl(s3Key) {
  if (!redisClient) return;
  try {
    await redisClient.del(`cdn:url:${s3Key}`);
  } catch { /* non-fatal */ }
}

/**
 * Cache job delivery manifest so repeated API calls don't re-resolve
 */
async function cacheJobManifest(jobId, manifest, ttlSeconds = 300) {
  if (!redisClient) return;
  try {
    await redisClient.set(`cdn:manifest:${jobId}`, JSON.stringify(manifest), 'EX', ttlSeconds);
  } catch { /* non-fatal */ }
}

async function getCachedJobManifest(jobId) {
  if (!redisClient) return null;
  try {
    const raw = await redisClient.get(`cdn:manifest:${jobId}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// ════════════════════════════════════════════════════════════
// CDN INVALIDATION (BATCHED)
// ════════════════════════════════════════════════════════════

/**
 * Queue a CDN invalidation. Batches are flushed every 10s
 * to avoid CloudFront's 3,000 invalidation/month free tier limit.
 */
function queueInvalidation(s3Keys = []) {
  invalidationQueue.push(...s3Keys);

  if (!invalidationTimer) {
    invalidationTimer = setTimeout(async () => {
      await _flushInvalidations();
      invalidationTimer = null;
    }, 10_000);
  }
}

async function _flushInvalidations() {
  if (!invalidationQueue.length) return;
  const keys = [...new Set(invalidationQueue)]; // deduplicate
  invalidationQueue = [];

  const distributionId = CDN_CONFIG.primary.distributionId();
  if (!distributionId) {
    logger.info('CDN: invalidation skipped (no distributionId)', { count: keys.length });
    return;
  }

  try {
    const { CloudFrontClient, CreateInvalidationCommand } = require('@aws-sdk/client-cloudfront');
    const cf    = new CloudFrontClient({ region: 'us-east-1' });
    const paths = keys.map(k => `/${k}`);

    await cf.send(new CreateInvalidationCommand({
      DistributionId:    distributionId,
      InvalidationBatch: {
        CallerReference: `dos-${Date.now()}`,
        Paths: { Quantity: paths.length, Items: paths },
      },
    }));

    logger.info('CDN: batch invalidation created', { count: paths.length });
  } catch (err) {
    logger.error('CDN: batch invalidation failed', { error: err.message, count: keys.length });
    // Re-queue for next flush
    invalidationQueue.unshift(...keys.slice(0, 50));
  }
}

// ════════════════════════════════════════════════════════════
// VIDEO STREAMING OPTIMISATION
// ════════════════════════════════════════════════════════════

/**
 * Build streaming metadata for a generated video.
 * Clients use this to pick adaptive bitrate vs direct delivery.
 */
function buildStreamingMeta(videoKey, durationSec, resolutionStr = '1176x784') {
  const [width, height] = resolutionStr.split('x').map(Number);
  const domain = CDN_CONFIG.primary.domain() || CDN_CONFIG.fallback.domain();

  return {
    direct_url:   domain ? `https://${domain}/${videoKey}` : null,
    hls_url:      domain ? `https://${domain}/m/${videoKey.replace(/\.[^/.]+$/, '')}/playlist.m3u8` : null,
    duration_s:   durationSec,
    resolution:   { width, height },
    aspect_ratio: _computeAspectRatio(width, height),
    bitrate_kbps: _estimateBitrateKbps(width, height),
    // Embed/player hints
    autoplay:     false,
    loop:         false,
    controls:     true,
    // Poster frame (first frame extracted by pipeline)
    poster_url:   domain ? `https://${domain}/i/${videoKey.replace(/\.[^/.]+$/, '')}_poster.jpg` : null,
  };
}

/**
 * Generate embed code for a video (iframe + native player fallback)
 */
function buildEmbedCode(videoKey, durationSec, opts = {}) {
  const { width = 1176, height = 784, autoplay = false } = opts;
  const domain = CDN_CONFIG.primary.domain() || CDN_CONFIG.fallback.domain();

  if (!domain) return null;

  const videoUrl = `https://${domain}/${videoKey}`;
  return `<video width="${width}" height="${height}" ${autoplay ? 'autoplay' : ''} controls preload="metadata" style="max-width:100%"><source src="${videoUrl}" type="video/mp4"><p>Your browser does not support HTML5 video.</p></video>`;
}

// ════════════════════════════════════════════════════════════
// GLOBAL SCALABILITY HELPERS
// ════════════════════════════════════════════════════════════

/**
 * Determine the nearest S3 region for a user based on CountryCode header.
 * Used to route write-back of generated videos to closest bucket.
 */
function resolveNearestRegion(countryCode = 'US') {
  return CDN_CONFIG.geoRouting[countryCode?.toUpperCase()] || CDN_CONFIG.geoRouting.__default;
}

/**
 * Build the S3 key for a generated video, including regional prefix
 * for intelligent bucket routing.
 */
function buildRegionalKey(jobId, sceneId, region, ext = 'mp4') {
  const date = new Date().toISOString().slice(0, 10);
  const reg  = region.replace(/-/g, '');
  return `v/${date}/${reg}/${jobId}/${sceneId}.${ext}`;
}

/**
 * Estimate bandwidth cost for a job (used for credit calculation)
 */
function estimateDeliveryCostMB(outputs = []) {
  return outputs.reduce((total, output) => {
    const bitrateKbps = _estimateBitrateKbps(1176, 784);
    const sizeMB = (bitrateKbps * (output.duration_s || 5) * 1000) / (8 * 1024 * 1024);
    return total + sizeMB;
  }, 0);
}

/**
 * Health check — verifies CDN reachability via a HEAD request to known asset
 */
async function healthCheck() {
  const domain   = CDN_CONFIG.primary.domain();
  const status   = {
    primary:  { configured: !!domain, domain },
    fallback: { configured: !!CDN_CONFIG.fallback.domain(), domain: CDN_CONFIG.fallback.domain() },
    redis:    { connected: !!redisClient },
    geoRouting: Object.keys(CDN_CONFIG.geoRouting).length - 1, // exclude __default
  };

  if (domain) {
    try {
      const https = require('https');
      await new Promise((res, rej) => {
        const req = https.request({ hostname: domain, method: 'HEAD', path: '/health', timeout: 5000 }, r => {
          status.primary.reachable = r.statusCode < 500;
          res();
        });
        req.on('error', () => { status.primary.reachable = false; res(); });
        req.on('timeout', () => { status.primary.reachable = false; res(); });
        req.end();
      });
    } catch { status.primary.reachable = false; }
  }

  return status;
}

// ── Scalability recommendation engine ────────────────────────
function getScalabilityRecommendations(currentLoad = {}) {
  const { concurrentJobs = 0, queueDepth = 0, avgLatencyMs = 0 } = currentLoad;
  const recommendations = [];

  if (concurrentJobs > 50) {
    recommendations.push({ level: 'critical', message: 'Scale Kubernetes GPU pods — queue saturation detected', action: 'kubectl scale deployment kling-worker --replicas=10' });
  }
  if (queueDepth > 200) {
    recommendations.push({ level: 'warning', message: 'Kafka consumer lag — add Kafka partitions or consumer instances', action: 'kafka-topics --alter --partitions 12' });
  }
  if (avgLatencyMs > 5000) {
    recommendations.push({ level: 'warning', message: 'API latency elevated — check Redis connection pool and CloudFront edge behaviour', action: 'Review CloudFront cache hit ratio' });
  }
  if (!CDN_CONFIG.primary.domain()) {
    recommendations.push({ level: 'info', message: 'CloudFront CDN not configured — set CLOUDFRONT_DOMAIN for global delivery', action: 'Set env var CLOUDFRONT_DOMAIN' });
  }
  if (!CDN_CONFIG.fallback.domain()) {
    recommendations.push({ level: 'info', message: 'No CDN fallback configured — set CLOUDFLARE_CDN_DOMAIN for multi-CDN redundancy', action: 'Set env var CLOUDFLARE_CDN_DOMAIN' });
  }

  return recommendations;
}

// ── Internals ──────────────────────────────────────────────────
function _guessAssetType(key) {
  if (/\.(mp4|webm|mov)$/i.test(key)) return 'video';
  if (/\.(jpg|jpeg|png|webp|avif)$/i.test(key)) return 'image';
  if (/\.(mp3|wav|aac|m4a)$/i.test(key)) return 'audio';
  if (/\.(cube)$/i.test(key)) return 'lut';
  if (/\.(m3u8|mpd)$/i.test(key)) return 'manifest';
  return 'video';
}

function _computeAspectRatio(w, h) {
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  const g   = gcd(w, h);
  return `${w / g}:${h / g}`;
}

function _estimateBitrateKbps(w, h) {
  // Rough estimate: 1176×784 ≈ 6500 kbps (matches benchmark 6.46 Mbps)
  const pixels = w * h;
  return Math.round((pixels / (1176 * 784)) * 6500);
}

module.exports = {
  init,
  // URL resolution
  resolveDeliveryUrl, buildJobDeliveryManifest,
  // Cache
  cacheUrl, getCachedUrl, invalidateCachedUrl,
  cacheJobManifest, getCachedJobManifest,
  // Invalidation
  queueInvalidation,
  // Streaming
  buildStreamingMeta, buildEmbedCode,
  // Scalability
  resolveNearestRegion, buildRegionalKey,
  estimateDeliveryCostMB,
  getScalabilityRecommendations,
  // Health
  healthCheck,
  // Constants
  CDN_CONFIG,
};
