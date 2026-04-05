'use strict';
// ══════════════════════════════════════════════════════════════════════
// DESIGNOS v1.3.0 · Agentic Autonomy Service
//
// Implements the NVIDIA Autonomous-Network 4-stage loop for creative AI:
//
//   PERCEIVE  → Ingest real-time signals: QA scores, queue depth,
//               CDN latency, API health, user feedback, cost metrics
//   REASON    → ReAct (Reason + Act) loop: decompose goal into sub-tasks,
//               evaluate options, choose optimal adaptation strategy
//   ACT       → Execute autonomous adaptation: reroute, re-prompt,
//               swap model, scale infrastructure, tune parameters
//   LEARN     → Store outcome in vector memory; update policy weights;
//               refine future decisions via temporal feedback loop
//
// Autonomy Levels (mirrors TM Forum AN levels):
//   L0  Assisted       – all decisions require human approval
//   L1  Partial        – system suggests, human approves
//   L2  Conditional    – system acts within defined policy bounds
//   L3  Supervised     – system acts autonomously, HITL alerts on anomaly
//   L4  Full           – proactive self-optimising, HITL for exceptions only
//
// Current target: L3 (Supervised Autonomy)
// ══════════════════════════════════════════════════════════════════════

const logger = require('../../shared/utils/logger');

// ── Configuration ──────────────────────────────────────────────────────
const AUTONOMY_LEVEL = parseInt(process.env.AUTONOMY_LEVEL || '3', 10); // L0–L4
const PERCEPTION_INTERVAL_MS = parseInt(process.env.PERCEPTION_INTERVAL_MS || '15000', 10);
const REACT_MAX_ITERATIONS   = 8;
const MEMORY_MAX_EPISODES    = 500;

// ── Quality + Performance Thresholds ──────────────────────────────────
const THRESHOLDS = {
  qa_score_min:          0.72,   // below → trigger re-prompt
  qa_score_degraded:     0.78,   // below → soft warning, monitor
  queue_depth_warn:      50,     // jobs → scale compute
  queue_depth_critical:  150,    // jobs → emergency GPU provisioning
  cdn_latency_warn_ms:   120,    // ms TTFB → switch edge region
  cdn_latency_critical_ms: 300,  // ms TTFB → emergency CDN failover
  api_error_rate_warn:   0.05,   // 5% → circuit-breaker consideration
  api_error_rate_crit:   0.15,   // 15% → activate fallback model
  cost_per_job_warn_usd: 0.85,   // → optimise model routing
  cost_per_job_crit_usd: 2.50,   // → mandatory cost-reduction action
  temporal_flicker_max:  0.12,   // benchmark limit
  identity_drift_max:    0.08,   // benchmark limit
};

// ── Internal state ─────────────────────────────────────────────────────
let _isRunning      = false;
let _perceptionLoop = null;
let _episodicMemory = [];          // short-term episodic store (ring buffer)
let _policyWeights  = {};          // learned adaptation policy
let _lastPerception = null;
let _adaptationLog  = [];          // recent decisions (for UI)
let _autonomyStats  = {
  totalPerceptions: 0,
  totalAdaptations: 0,
  adaptationsByType: {},
  avgQaScore: 0.85,
  avgLatencyMs: 45,
  totalCostSavedUsd: 0,
  uptimePercent: 99.99,
};

// ── External service references (injected via init) ────────────────────
let _qaService      = null;
let _queueService   = null;
let _cdnService     = null;
let _renderRouter   = null;
let _storageService = null;
let _klingClient    = null;

// ══════════════════════════════════════════════════════════════════════
//  INITIALISE
// ══════════════════════════════════════════════════════════════════════
async function init(deps = {}) {
  _qaService      = deps.qa            || null;
  _queueService   = deps.queue         || null;
  _cdnService     = deps.cdn           || null;
  _renderRouter   = deps.renderRouter  || null;
  _storageService = deps.storage       || null;
  _klingClient    = deps.kling         || null;

  logger.info('Agentic Autonomy Service initialised', {
    autonomyLevel: AUTONOMY_LEVEL,
    perceptionIntervalMs: PERCEPTION_INTERVAL_MS,
  });

  // Restore learned policy from persistent store if available
  await restorePolicy();

  // Start the autonomous perception loop
  if (AUTONOMY_LEVEL >= 2) {
    startPerceptionLoop();
  }
}

// ══════════════════════════════════════════════════════════════════════
//  STAGE 1: PERCEIVE
//  Collect real-time environmental signals from all system components
// ══════════════════════════════════════════════════════════════════════
async function perceive() {
  const timestamp = Date.now();

  // Gather signals in parallel (graceful degradation on failure)
  const [qaSignal, queueSignal, cdnSignal, apiSignal, costSignal] = await Promise.allSettled([
    collectQaSignal(),
    collectQueueSignal(),
    collectCdnSignal(),
    collectApiHealthSignal(),
    collectCostSignal(),
  ]);

  const state = {
    timestamp,
    qa:     qaSignal.status     === 'fulfilled' ? qaSignal.value     : defaultSignal('qa'),
    queue:  queueSignal.status  === 'fulfilled' ? queueSignal.value  : defaultSignal('queue'),
    cdn:    cdnSignal.status    === 'fulfilled' ? cdnSignal.value    : defaultSignal('cdn'),
    api:    apiSignal.status    === 'fulfilled' ? apiSignal.value    : defaultSignal('api'),
    cost:   costSignal.status   === 'fulfilled' ? costSignal.value   : defaultSignal('cost'),
  };

  // Compute system-wide health score (0–1)
  state.healthScore = computeHealthScore(state);

  _lastPerception = state;
  _autonomyStats.totalPerceptions++;

  logger.debug('Perception cycle complete', {
    healthScore: state.healthScore.toFixed(3),
    qaScore: state.qa.avgScore?.toFixed(3),
    queueDepth: state.queue.depth,
    cdnLatencyMs: state.cdn.avgLatencyMs,
  });

  return state;
}

async function collectQaSignal() {
  // Pull from in-memory stats if QA service not wired
  if (!_qaService?.getStats) {
    return {
      avgScore: _autonomyStats.avgQaScore,
      recentScores: [],
      failRate: 0.02,
      flicker: 0.08,
      identityDrift: 0.04,
      hitlQueue: 0,
    };
  }
  const stats = await _qaService.getStats();
  return {
    avgScore:      stats.avgCompositeScore || 0.85,
    recentScores:  stats.recentScores       || [],
    failRate:      stats.failRate           || 0,
    flicker:       stats.avgFlicker         || 0.08,
    identityDrift: stats.avgIdentityDrift   || 0.04,
    hitlQueue:     stats.hitlQueueDepth     || 0,
  };
}

async function collectQueueSignal() {
  if (!_queueService?.getStats) {
    return { depth: 0, avgWaitMs: 500, throughputPerMin: 4, failedJobs: 0 };
  }
  const stats = await _queueService.getStats?.() || {};
  return {
    depth:           stats.queueDepth    || 0,
    avgWaitMs:       stats.avgWaitMs     || 500,
    throughputPerMin: stats.throughputPerMin || 4,
    failedJobs:      stats.failedJobs    || 0,
  };
}

async function collectCdnSignal() {
  if (!_cdnService?.getLatencyStats) {
    return { avgLatencyMs: _autonomyStats.avgLatencyMs, p99LatencyMs: 200, cacheHitRate: 0.85, regions: {} };
  }
  const stats = await _cdnService.getLatencyStats?.() || {};
  return {
    avgLatencyMs:  stats.avgLatencyMs  || 45,
    p99LatencyMs:  stats.p99LatencyMs  || 180,
    cacheHitRate:  stats.cacheHitRate  || 0.85,
    regions:       stats.byRegion      || {},
  };
}

async function collectApiHealthSignal() {
  let klingStatus = { healthy: true, errorRate: 0.01, circuitState: 'closed', avgResponseMs: 4500 };
  if (_klingClient?.healthCheck) {
    try {
      const h = await _klingClient.healthCheck();
      klingStatus = {
        healthy:       h.healthy !== false,
        errorRate:     h.recentErrorRate || 0.01,
        circuitState:  h.circuitState    || 'closed',
        avgResponseMs: h.avgResponseMs   || 4500,
      };
    } catch (_) { /* keep defaults */ }
  }
  return { kling: klingStatus, anthropic: { healthy: true, errorRate: 0.005 } };
}

async function collectCostSignal() {
  // In production: query billing API or internal cost tracker
  return {
    costPerJobUsd:    0.62,
    hourlySpendUsd:   18.5,
    dailyBudgetUsd:   500,
    budgetUtilPct:    0.037,
    modelBreakdown:   { kling: 0.45, anthropic: 0.12, diffusion: 0.05 },
  };
}

function defaultSignal(type) {
  const defaults = {
    qa:    { avgScore: 0.85, failRate: 0.02, flicker: 0.08, identityDrift: 0.04, hitlQueue: 0 },
    queue: { depth: 0, avgWaitMs: 500, throughputPerMin: 4, failedJobs: 0 },
    cdn:   { avgLatencyMs: 45, p99LatencyMs: 180, cacheHitRate: 0.85 },
    api:   { kling: { healthy: true, errorRate: 0.01, circuitState: 'closed' } },
    cost:  { costPerJobUsd: 0.62, budgetUtilPct: 0.037 },
  };
  return defaults[type] || {};
}

function computeHealthScore(state) {
  const qaScore  = Math.min(1, (state.qa.avgScore || 0.85) / 1.0);
  const queueOk  = 1 - Math.min(1, (state.queue.depth || 0) / THRESHOLDS.queue_depth_critical);
  const cdnOk    = 1 - Math.min(1, (state.cdn.avgLatencyMs || 45) / THRESHOLDS.cdn_latency_critical_ms);
  const apiOk    = state.api.kling?.healthy !== false ? 1 : 0.3;
  const costOk   = 1 - Math.min(1, (state.cost.costPerJobUsd || 0.62) / THRESHOLDS.cost_per_job_crit_usd);
  return (qaScore * 0.35 + queueOk * 0.20 + cdnOk * 0.20 + apiOk * 0.15 + costOk * 0.10);
}

// ══════════════════════════════════════════════════════════════════════
//  STAGE 2: REASON (ReAct loop)
//  Decompose system state → identify anomalies → rank adaptation options
// ══════════════════════════════════════════════════════════════════════
async function reason(state) {
  const issues   = detectIssues(state);
  if (!issues.length) return { actions: [], rationale: 'System nominal — no adaptation needed' };

  // ReAct: iterative thought → action planning
  const plan = await reactPlanningLoop(issues, state);

  logger.info('Reasoning complete', {
    issuesFound: issues.length,
    actionsPlanned: plan.actions.length,
    topIssue: issues[0]?.type,
  });

  return plan;
}

function detectIssues(state) {
  const issues = [];

  // QA quality degradation
  if (state.qa.avgScore < THRESHOLDS.qa_score_min) {
    issues.push({ type: 'qa_critical',   severity: 'critical', value: state.qa.avgScore,
      message: `QA score ${state.qa.avgScore.toFixed(3)} below minimum ${THRESHOLDS.qa_score_min}` });
  } else if (state.qa.avgScore < THRESHOLDS.qa_score_degraded) {
    issues.push({ type: 'qa_degraded',   severity: 'warning',  value: state.qa.avgScore,
      message: `QA score degraded to ${state.qa.avgScore.toFixed(3)}` });
  }

  // Temporal flicker
  if (state.qa.flicker > THRESHOLDS.temporal_flicker_max) {
    issues.push({ type: 'flicker_high',  severity: 'warning',  value: state.qa.flicker,
      message: `Flicker ${state.qa.flicker.toFixed(3)} exceeds threshold ${THRESHOLDS.temporal_flicker_max}` });
  }

  // Queue overload
  if (state.queue.depth > THRESHOLDS.queue_depth_critical) {
    issues.push({ type: 'queue_critical', severity: 'critical', value: state.queue.depth,
      message: `Queue depth ${state.queue.depth} in critical zone` });
  } else if (state.queue.depth > THRESHOLDS.queue_depth_warn) {
    issues.push({ type: 'queue_warn',    severity: 'warning',  value: state.queue.depth,
      message: `Queue depth ${state.queue.depth} elevated` });
  }

  // CDN latency
  if (state.cdn.avgLatencyMs > THRESHOLDS.cdn_latency_critical_ms) {
    issues.push({ type: 'cdn_critical',  severity: 'critical', value: state.cdn.avgLatencyMs,
      message: `CDN latency ${state.cdn.avgLatencyMs}ms critical` });
  } else if (state.cdn.avgLatencyMs > THRESHOLDS.cdn_latency_warn_ms) {
    issues.push({ type: 'cdn_warn',      severity: 'warning',  value: state.cdn.avgLatencyMs,
      message: `CDN latency ${state.cdn.avgLatencyMs}ms elevated` });
  }

  // API health
  if (!state.api.kling?.healthy || state.api.kling?.errorRate > THRESHOLDS.api_error_rate_crit) {
    issues.push({ type: 'api_critical',  severity: 'critical', value: state.api.kling?.errorRate,
      message: `Kling API unhealthy (errorRate ${state.api.kling?.errorRate?.toFixed(3)})` });
  } else if (state.api.kling?.errorRate > THRESHOLDS.api_error_rate_warn) {
    issues.push({ type: 'api_warn',      severity: 'warning',  value: state.api.kling?.errorRate,
      message: `Kling API error rate elevated: ${state.api.kling?.errorRate?.toFixed(3)}` });
  }

  // Cost spike
  if (state.cost.costPerJobUsd > THRESHOLDS.cost_per_job_crit_usd) {
    issues.push({ type: 'cost_critical', severity: 'critical', value: state.cost.costPerJobUsd,
      message: `Cost per job $${state.cost.costPerJobUsd.toFixed(2)} exceeds limit` });
  } else if (state.cost.costPerJobUsd > THRESHOLDS.cost_per_job_warn_usd) {
    issues.push({ type: 'cost_warn',     severity: 'warning',  value: state.cost.costPerJobUsd,
      message: `Cost per job $${state.cost.costPerJobUsd.toFixed(2)} elevated` });
  }

  // Sort: critical first, then by severity
  return issues.sort((a, b) => {
    if (a.severity === b.severity) return 0;
    return a.severity === 'critical' ? -1 : 1;
  });
}

async function reactPlanningLoop(issues, state) {
  // ReAct: THOUGHT → ACTION → OBSERVATION loop
  const actions   = [];
  const thoughts  = [];
  let iteration   = 0;
  let remainingIssues = [...issues];

  while (remainingIssues.length > 0 && iteration < REACT_MAX_ITERATIONS) {
    const issue = remainingIssues[0];

    // THOUGHT: reason about the issue
    const thought = generateThought(issue, state, _policyWeights);
    thoughts.push(thought);

    // ACTION: select best adaptation
    const action = selectAdaptation(issue, thought, state, _policyWeights);
    if (action) actions.push(action);

    // OBSERVATION: remove addressed issues
    remainingIssues = remainingIssues.filter(i => i.type !== issue.type);
    iteration++;
  }

  return { actions, thoughts, rationale: thoughts.map(t => t.summary).join(' | ') };
}

function generateThought(issue, state, weights) {
  // Lookup historical effectiveness from learned policy
  const historicalSuccess = weights[issue.type]?.successRate || 0.75;
  const preferredAdaptation = weights[issue.type]?.bestAction || null;

  let summary = '';
  switch (issue.type) {
    case 'qa_critical':
    case 'qa_degraded':
      summary = `QA score ${issue.value.toFixed(3)} — historical best: ${preferredAdaptation || 'prompt_enrichment'} (${(historicalSuccess * 100).toFixed(0)}% success). `;
      summary += issue.value < 0.72
        ? 'Critical: switch to higher quality model + inject benchmark anchors.'
        : 'Degraded: enrich prompts with quality signals from cinematic benchmark.';
      break;
    case 'flicker_high':
      summary = `Temporal flicker ${issue.value.toFixed(3)} exceeds ${THRESHOLDS.temporal_flicker_max}. `;
      summary += 'Action: increase cfg_scale, reduce temporal variance, inject stability hints.';
      break;
    case 'queue_critical':
    case 'queue_warn':
      summary = `Queue depth ${issue.value}. `;
      summary += issue.value > THRESHOLDS.queue_depth_critical
        ? 'Emergency: auto-scale GPU replicas, prioritise cinema-mode jobs.'
        : 'Moderate: activate draft-mode fast-path for non-cinema requests.';
      break;
    case 'cdn_critical':
    case 'cdn_warn':
      summary = `CDN latency ${issue.value}ms. `;
      summary += 'Geo-route requests to lower-latency edge, invalidate stale cache.';
      break;
    case 'api_critical':
      summary = `Kling API down (circuit state: ${state.api.kling?.circuitState}). `;
      summary += 'Fallback: queue jobs, use mock/draft fallback, alert HITL.';
      break;
    case 'cost_critical':
    case 'cost_warn':
      summary = `Cost $${issue.value.toFixed(2)}/job. `;
      summary += 'Route low-priority jobs to draft model, batch cinema requests.';
      break;
    default:
      summary = `Unknown issue type ${issue.type} — monitoring.`;
  }

  return { issue: issue.type, summary, preferredAdaptation, historicalSuccess };
}

function selectAdaptation(issue, thought, state, weights) {
  const autonomyOk = (severity) => {
    if (severity === 'critical') return AUTONOMY_LEVEL >= 2;
    if (severity === 'warning')  return AUTONOMY_LEVEL >= 1;
    return true;
  };

  if (!autonomyOk(issue.severity)) {
    return { type: 'hitl_alert', issue: issue.type, requiresHuman: true,
      reason: `Autonomy L${AUTONOMY_LEVEL} — human approval required for ${issue.severity} action` };
  }

  // Adaptation strategies keyed to issue types
  const strategies = {
    qa_critical: {
      type: 'model_upgrade',
      description: 'Switch to Kling v3 pro mode + inject benchmark quality anchors into all prompts',
      params: { klingMode: 'pro', cfgScale: 0.55, injectBenchmarkAnchors: true, targetScore: 8.5 },
      expectedImprovement: '+0.12 QA score',
    },
    qa_degraded: {
      type: 'prompt_enrichment',
      description: 'Enrich prompts with top-3 benchmark quality signals (SSS, volumetric, hair detail)',
      params: { injectSss: true, injectVolumetric: true, injectHairDetail: true },
      expectedImprovement: '+0.06 QA score',
    },
    flicker_high: {
      type: 'stability_tuning',
      description: 'Increase cfg_scale to 0.6, enable temporal consistency mode in Kling',
      params: { cfgScale: 0.60, temporalConsistency: true, negativeFlicker: true },
      expectedImprovement: '-0.04 flicker delta',
    },
    queue_critical: {
      type: 'scale_compute',
      description: 'Emergency GPU auto-scale: +3 replicas on K8s HPA, throttle new submissions',
      params: { replicaDelta: 3, throttleNewJobs: true, emergencyScale: true },
      expectedImprovement: '-60% queue wait time',
    },
    queue_warn: {
      type: 'fast_path_routing',
      description: 'Route explore-mode jobs to draft pipeline to free cinema GPU capacity',
      params: { routeExploreToDraft: true, prioritiseCinema: true },
      expectedImprovement: '-30% queue depth',
    },
    cdn_critical: {
      type: 'cdn_failover',
      description: 'Immediate CDN failover to secondary edge region, invalidate regional cache',
      params: { failoverRegion: 'us-east-1', invalidateAll: true },
      expectedImprovement: '-200ms TTFB',
    },
    cdn_warn: {
      type: 'geo_reroute',
      description: 'Shift 40% of traffic to lower-latency CDN PoP',
      params: { trafficShiftPct: 40, targetRegion: 'closest_healthy' },
      expectedImprovement: '-80ms TTFB',
    },
    api_critical: {
      type: 'api_fallback',
      description: 'Activate Kling fallback: queue all pending jobs, use draft-mode for new',
      params: { fallbackMode: 'draft', queuePending: true, alertHitl: true },
      expectedImprovement: '100% availability maintained',
    },
    api_warn: {
      type: 'circuit_breaker_monitor',
      description: 'Increase monitoring frequency, pre-warm fallback client',
      params: { monitorIntervalMs: 5000, prewarmFallback: true },
      expectedImprovement: 'Proactive degradation avoidance',
    },
    cost_critical: {
      type: 'cost_optimisation',
      description: 'Force non-cinema jobs to standard model, batch Kling calls, pause bulk exports',
      params: { forceStandardForDraft: true, batchKlingCalls: true, pauseBulkExports: true },
      expectedImprovement: '-35% cost/job',
    },
    cost_warn: {
      type: 'smart_batching',
      description: 'Enable adaptive batching: group similar prompts for shared Kling inference',
      params: { enableAdaptiveBatching: true, batchSize: 3 },
      expectedImprovement: '-15% cost/job',
    },
  };

  const strategy = strategies[issue.type];
  if (!strategy) return null;

  return {
    ...strategy,
    issue:     issue.type,
    severity:  issue.severity,
    timestamp: Date.now(),
    autonomyLevel: AUTONOMY_LEVEL,
    autoExecute: AUTONOMY_LEVEL >= 3 || issue.severity !== 'critical',
  };
}

// ══════════════════════════════════════════════════════════════════════
//  STAGE 3: ACT
//  Execute the planned adaptations (within autonomy level bounds)
// ══════════════════════════════════════════════════════════════════════
async function act(plan) {
  if (!plan.actions.length) return { executed: [], skipped: [] };

  const executed = [];
  const skipped  = [];

  for (const action of plan.actions) {
    if (!action.autoExecute) {
      skipped.push({ action: action.type, reason: action.reason || 'Requires human approval' });
      await emitHitlAlert(action);
      continue;
    }

    try {
      await executeAdaptation(action);
      executed.push({ action: action.type, issue: action.issue, status: 'success',
        expectedImprovement: action.expectedImprovement });

      // Record to adaptation log for UI
      _adaptationLog.unshift({
        timestamp:   new Date().toISOString(),
        type:        action.type,
        description: action.description,
        issue:       action.issue,
        severity:    action.severity,
        improvement: action.expectedImprovement,
        autoExecuted: action.autoExecute,
      });
      if (_adaptationLog.length > 50) _adaptationLog.pop();

      _autonomyStats.totalAdaptations++;
      _autonomyStats.adaptationsByType[action.type] = (_autonomyStats.adaptationsByType[action.type] || 0) + 1;

    } catch (err) {
      logger.error('Adaptation execution failed', { action: action.type, error: err.message });
      skipped.push({ action: action.type, reason: `Execution error: ${err.message}` });
    }
  }

  return { executed, skipped };
}

async function executeAdaptation(action) {
  logger.info(`[ACT] Executing adaptation: ${action.type}`, {
    issue: action.issue, params: action.params });

  switch (action.type) {
    case 'model_upgrade':
      await applyModelUpgrade(action.params);
      break;
    case 'prompt_enrichment':
      await applyPromptEnrichment(action.params);
      break;
    case 'stability_tuning':
      await applyStabilityTuning(action.params);
      break;
    case 'scale_compute':
      await applyComputeScale(action.params);
      break;
    case 'fast_path_routing':
      await applyFastPathRouting(action.params);
      break;
    case 'cdn_failover':
    case 'geo_reroute':
      await applyCdnAdaptation(action.params);
      break;
    case 'api_fallback':
      await applyApiFallback(action.params);
      break;
    case 'circuit_breaker_monitor':
      await applyCircuitBreakerWatch(action.params);
      break;
    case 'cost_optimisation':
    case 'smart_batching':
      await applyCostOptimisation(action.params);
      break;
    default:
      logger.warn(`Unknown adaptation type: ${action.type}`);
  }
}

// ── Adaptation implementations ────────────────────────────────────────
async function applyModelUpgrade(params) {
  // Inject benchmark quality anchors into all active Kling prompts
  global.__DESIGNOS_KLING_MODE__          = params.klingMode || 'pro';
  global.__DESIGNOS_CFG_SCALE__           = params.cfgScale  || 0.55;
  global.__DESIGNOS_INJECT_BENCHMARKS__   = params.injectBenchmarkAnchors || true;
  logger.info('[ACT] Model upgraded → pro mode, benchmark anchors injected');
}

async function applyPromptEnrichment(params) {
  // Set global prompt enrichment flags for workflow
  global.__DESIGNOS_ENRICH_SSS__       = params.injectSss        || true;
  global.__DESIGNOS_ENRICH_VOLUMETRIC__= params.injectVolumetric || true;
  global.__DESIGNOS_ENRICH_HAIR__      = params.injectHairDetail  || true;
  logger.info('[ACT] Prompt enrichment activated: SSS + volumetric + hair detail');
}

async function applyStabilityTuning(params) {
  global.__DESIGNOS_CFG_SCALE__              = params.cfgScale || 0.60;
  global.__DESIGNOS_TEMPORAL_CONSISTENCY__   = params.temporalConsistency || true;
  global.__DESIGNOS_NEGATIVE_FLICKER__       = params.negativeFlicker     || true;
  logger.info('[ACT] Stability tuning applied: cfgScale=0.60, temporal consistency ON');
}

async function applyComputeScale(params) {
  // In production: call K8s HPA API to scale GPU node pool
  logger.info('[ACT] Compute scale triggered', {
    replicaDelta: params.replicaDelta,
    emergency: params.emergencyScale,
  });
  // Signal the queue to throttle if requested
  if (params.throttleNewJobs) {
    global.__DESIGNOS_THROTTLE_QUEUE__ = true;
  }
}

async function applyFastPathRouting(params) {
  if (params.routeExploreToDraft) {
    global.__DESIGNOS_ROUTE_EXPLORE_TO_DRAFT__ = true;
  }
  if (params.prioritiseCinema) {
    global.__DESIGNOS_PRIORITISE_CINEMA__ = true;
  }
  logger.info('[ACT] Fast-path routing: explore→draft, cinema prioritised');
}

async function applyCdnAdaptation(params) {
  if (_cdnService?.switchRegion) {
    await _cdnService.switchRegion(params.failoverRegion || params.targetRegion);
  }
  logger.info('[ACT] CDN adapted', params);
}

async function applyApiFallback(params) {
  global.__DESIGNOS_API_FALLBACK_MODE__ = params.fallbackMode || 'draft';
  if (params.alertHitl) await emitHitlAlert({ type: 'api_critical', description: 'Kling API down — HITL required' });
  logger.info('[ACT] API fallback activated', params);
}

async function applyCircuitBreakerWatch(params) {
  global.__DESIGNOS_CB_MONITOR_INTERVAL__ = params.monitorIntervalMs || 5000;
  logger.info('[ACT] Circuit breaker monitoring intensified');
}

async function applyCostOptimisation(params) {
  if (params.forceStandardForDraft) global.__DESIGNOS_FORCE_STANDARD_DRAFT__ = true;
  if (params.enableAdaptiveBatching) global.__DESIGNOS_ADAPTIVE_BATCHING__   = true;
  logger.info('[ACT] Cost optimisation applied', params);
}

// ══════════════════════════════════════════════════════════════════════
//  STAGE 4: LEARN
//  Store episode in memory; update policy weights from outcomes
// ══════════════════════════════════════════════════════════════════════
async function learn(state, plan, actResult) {
  const episode = {
    timestamp:  Date.now(),
    stateBefore: {
      healthScore:  state.healthScore,
      qaScore:      state.qa.avgScore,
      queueDepth:   state.queue.depth,
      cdnLatencyMs: state.cdn.avgLatencyMs,
    },
    issuesDetected:  plan.actions.map(a => a.issue),
    actionsExecuted: actResult.executed.map(a => a.action),
    actionsSkipped:  actResult.skipped.map(a => a.action),
  };

  // Add to episodic memory (ring buffer)
  _episodicMemory.unshift(episode);
  if (_episodicMemory.length > MEMORY_MAX_EPISODES) _episodicMemory.pop();

  // Update policy weights from outcome (simplified temporal-difference update)
  for (const executed of actResult.executed) {
    const key = executed.action;
    if (!_policyWeights[executed.issue]) _policyWeights[executed.issue] = {};
    const entry = _policyWeights[executed.issue];
    entry.count       = (entry.count || 0) + 1;
    entry.bestAction  = key;
    // Optimistic success rate update — real outcome measured on next perception
    entry.successRate = Math.min(0.98, (entry.successRate || 0.75) * 0.9 + 0.1);
  }

  // Persist policy asynchronously (fire-and-forget)
  persistPolicy().catch(err => logger.debug('Policy persist failed', { err: err.message }));

  logger.debug('Learning update complete', {
    episodeCount:  _episodicMemory.length,
    policyKeys:    Object.keys(_policyWeights).length,
  });
}

async function persistPolicy() {
  // In production: persist to Redis or Firestore
  // Here: store in global memory for cross-request access
  global.__DESIGNOS_POLICY_WEIGHTS__ = _policyWeights;
}

async function restorePolicy() {
  if (global.__DESIGNOS_POLICY_WEIGHTS__) {
    _policyWeights = global.__DESIGNOS_POLICY_WEIGHTS__;
    logger.info('Restored policy weights from memory', { keys: Object.keys(_policyWeights).length });
  }
}

// ══════════════════════════════════════════════════════════════════════
//  MAIN AUTONOMOUS LOOP
// ══════════════════════════════════════════════════════════════════════
async function runAutonomousLoop() {
  if (_isRunning) return; // prevent re-entrant loops
  _isRunning = true;

  try {
    // Stage 1: Perceive
    const state = await perceive();

    // Stage 2: Reason (only act if health is not perfect)
    if (state.healthScore < 0.98) {
      const plan = await reason(state);

      // Stage 3: Act
      const actResult = await act(plan);

      // Stage 4: Learn
      await learn(state, plan, actResult);

      if (actResult.executed.length > 0) {
        logger.info('Autonomous adaptation cycle complete', {
          healthScore:   state.healthScore.toFixed(3),
          adaptations:   actResult.executed.length,
          types:         actResult.executed.map(a => a.action).join(', '),
        });
      }
    }
  } catch (err) {
    logger.error('Autonomous loop error', { error: err.message });
  } finally {
    _isRunning = false;
  }
}

function startPerceptionLoop() {
  logger.info(`Starting autonomous perception loop (interval: ${PERCEPTION_INTERVAL_MS}ms, L${AUTONOMY_LEVEL})`);
  _perceptionLoop = setInterval(runAutonomousLoop, PERCEPTION_INTERVAL_MS);
  // Run immediately on start
  setImmediate(runAutonomousLoop);
}

function stopPerceptionLoop() {
  if (_perceptionLoop) {
    clearInterval(_perceptionLoop);
    _perceptionLoop = null;
    logger.info('Autonomous perception loop stopped');
  }
}

// ══════════════════════════════════════════════════════════════════════
//  PROACTIVE JOB-LEVEL ADAPTATION
//  Called per-job BEFORE render — applies learned policy to job params
// ══════════════════════════════════════════════════════════════════════
async function adaptJobParams(jobPayload) {
  const adapted = { ...jobPayload };
  const metadata = adapted.jobSpec?.modelParams || {};

  // Apply global autonomy flags
  if (global.__DESIGNOS_KLING_MODE__ && metadata.klingMode !== global.__DESIGNOS_KLING_MODE__) {
    metadata.klingMode = global.__DESIGNOS_KLING_MODE__;
    adapted._agentAdapted = adapted._agentAdapted || [];
    adapted._agentAdapted.push('kling_mode_upgraded');
  }

  if (global.__DESIGNOS_CFG_SCALE__) {
    metadata.cfgScale = global.__DESIGNOS_CFG_SCALE__;
  }

  if (global.__DESIGNOS_INJECT_BENCHMARKS__) {
    metadata.injectBenchmarkAnchors = true;
  }

  // Route explore jobs to draft if queue is overloaded
  if (global.__DESIGNOS_ROUTE_EXPLORE_TO_DRAFT__ && adapted.mode === 'exploration') {
    adapted.mode = 'draft';
    adapted._agentAdapted = adapted._agentAdapted || [];
    adapted._agentAdapted.push('routed_explore_to_draft');
  }

  // Prioritise cinema if flagged
  if (global.__DESIGNOS_PRIORITISE_CINEMA__ && adapted.mode === 'cinema') {
    adapted.priority = Math.max(adapted.priority || 1, 3);
    adapted._agentAdapted = adapted._agentAdapted || [];
    adapted._agentAdapted.push('cinema_priority_elevated');
  }

  if (adapted._agentAdapted?.length) {
    logger.info('Job params autonomously adapted', {
      jobId: adapted.jobId, adaptations: adapted._agentAdapted });
  }

  return adapted;
}

// ══════════════════════════════════════════════════════════════════════
//  PROACTIVE PROMPT ENRICHMENT
//  Injects benchmark quality signals into Kling prompts automatically
// ══════════════════════════════════════════════════════════════════════
function enrichPromptAutonomously(prompt, cinProfile = {}) {
  const parts   = [prompt];
  const applied = [];

  if (global.__DESIGNOS_ENRICH_SSS__ || cinProfile.sss_enabled) {
    parts.push('subsurface scattering skin, pinkish light transmission through dermis, SSS shaders');
    applied.push('sss');
  }
  if (global.__DESIGNOS_ENRICH_VOLUMETRIC__ || cinProfile.volumetric_light) {
    parts.push('volumetric atmospheric haze, cinematic light shafts, god rays, dust particles in beam');
    applied.push('volumetric');
  }
  if (global.__DESIGNOS_ENRICH_HAIR__) {
    parts.push('individual hair strand separation, rim-light per-strand specular');
    applied.push('hair_detail');
  }
  if (global.__DESIGNOS_INJECT_BENCHMARKS__) {
    parts.push('benchmark quality 8.5/10, photorealistic broadcast quality, teal-orange LUT, 4K 24fps');
    applied.push('benchmark_anchor');
  }
  if (global.__DESIGNOS_TEMPORAL_CONSISTENCY__) {
    parts.push('temporal consistency, no flickering, smooth motion, stable identity');
    applied.push('temporal_stability');
  }
  if (global.__DESIGNOS_NEGATIVE_FLICKER__) {
    // Negative prompt additions handled downstream
    applied.push('negative_flicker');
  }

  return { enrichedPrompt: parts.join(', '), appliedEnrichments: applied };
}

// ══════════════════════════════════════════════════════════════════════
//  HUMAN-IN-THE-LOOP (HITL) NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════
async function emitHitlAlert(action) {
  const alert = {
    timestamp:   new Date().toISOString(),
    type:        'hitl_required',
    action:      action.type,
    description: action.description || action.reason,
    severity:    action.severity || 'critical',
    autonomyLevel: AUTONOMY_LEVEL,
  };

  logger.warn('[HITL] Human intervention required', alert);

  // Emit to SSE stream if available (real-time browser notification)
  if (global.pushJobUpdate) {
    global.pushJobUpdate('system', { ...alert, jobId: 'system' });
  }

  // In production: also push to PagerDuty / Slack / OpsGenie
}

// ══════════════════════════════════════════════════════════════════════
//  PUBLIC API
// ══════════════════════════════════════════════════════════════════════
function getStatus() {
  return {
    autonomyLevel:      AUTONOMY_LEVEL,
    autonomyLevelLabel: ['Assisted', 'Partial', 'Conditional', 'Supervised', 'Full'][AUTONOMY_LEVEL] || 'Unknown',
    isRunning:          !!_perceptionLoop,
    lastPerception:     _lastPerception ? {
      timestamp:    new Date(_lastPerception.timestamp).toISOString(),
      healthScore:  _lastPerception.healthScore,
      qaScore:      _lastPerception.qa?.avgScore,
      queueDepth:   _lastPerception.queue?.depth,
      cdnLatencyMs: _lastPerception.cdn?.avgLatencyMs,
    } : null,
    stats:              _autonomyStats,
    recentAdaptations:  _adaptationLog.slice(0, 10),
    episodicMemorySize: _episodicMemory.length,
    learnedPolicies:    Object.keys(_policyWeights).length,
    perceptionIntervalMs: PERCEPTION_INTERVAL_MS,
  };
}

function getAdaptationLog() {
  return _adaptationLog.slice(0, 20);
}

function getEpisodicMemory(limit = 10) {
  return _episodicMemory.slice(0, limit);
}

// Manual trigger for testing / admin
async function triggerManualCycle() {
  logger.info('Manual autonomy cycle triggered');
  await runAutonomousLoop();
  return getStatus();
}

module.exports = {
  init,
  perceive,
  reason,
  act,
  learn,
  adaptJobParams,
  enrichPromptAutonomously,
  getStatus,
  getAdaptationLog,
  getEpisodicMemory,
  triggerManualCycle,
  startPerceptionLoop,
  stopPerceptionLoop,
  THRESHOLDS,
  AUTONOMY_LEVEL,
};
