'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · Analytics MCP Server
// Exposes job metrics, performance data, and queue stats
// via a standardised MCP tool interface.
// ══════════════════════════════════════════════════════════

const registry = require('../mcp/mcp.registry');
const { buildToolDescriptor, SCHEMA_TYPES } = require('../mcp/mcp.schemas');
const queueService = require('../services/queue/queue.service');

function register() {
  // ── job_metrics ────────────────────────────────────────
  registry.registerTool(
    buildToolDescriptor({
      id:          'analytics.job_metrics',
      name:        'Job Metrics',
      description: 'Retrieve aggregated job success/failure/duration metrics for a user',
      version:     '1.0.0',
      category:    'analytics',
      inputSchema: {
        properties: {
          userId:    { type: SCHEMA_TYPES.STRING },
          startDate: { type: SCHEMA_TYPES.STRING },
          endDate:   { type: SCHEMA_TYPES.STRING },
        },
        required: [],
      },
      outputSchema: {
        properties: {
          metrics: { type: SCHEMA_TYPES.OBJECT },
        },
        required: ['metrics'],
      },
    }),
    async (_input, context) => {
      const metrics = {
        userId:        context.userId,
        totalJobs:     0,
        completedJobs: 0,
        failedJobs:    0,
        avgDurationMs: 0,
        generatedAt:   new Date().toISOString(),
        note:          'Connect to Firestore for real metrics',
      };
      return { metrics };
    }
  );

  // ── queue_health ───────────────────────────────────────
  registry.registerTool(
    buildToolDescriptor({
      id:          'analytics.queue_health',
      name:        'Queue Health',
      description: 'Get render queue depth, consumer lag, and throughput data',
      version:     '1.0.0',
      category:    'analytics',
      inputSchema: { properties: {}, required: [] },
      outputSchema: {
        properties: {
          health: { type: SCHEMA_TYPES.OBJECT },
        },
        required: ['health'],
      },
    }),
    async (_input, _context) => {
      let health = { status: 'unknown', queued: 0, processing: 0 };
      try {
        const ping  = await queueService.healthCheck();
        const depth = await queueService.getQueueDepth();
        health = { status: ping?.connected ? 'ok' : 'degraded', queued: depth || 0, ...ping };
      } catch {
        health.status = 'unavailable';
      }
      return { health };
    }
  );

  // ── performance_report ─────────────────────────────────
  registry.registerTool(
    buildToolDescriptor({
      id:          'analytics.performance_report',
      name:        'Performance Report',
      description: 'Generate a performance summary including P50/P95 latencies and error rates',
      version:     '1.0.0',
      category:    'analytics',
      inputSchema: {
        properties: {
          period: { type: SCHEMA_TYPES.STRING, enum: ['day', 'week', 'month'] },
        },
        required: [],
      },
      outputSchema: {
        properties: {
          report: { type: SCHEMA_TYPES.OBJECT },
        },
        required: ['report'],
      },
    }),
    async (input, _context) => {
      return {
        report: {
          period:      input.period || 'day',
          generatedAt: new Date().toISOString(),
          note:        'Connect to Prometheus/Grafana for full metrics in production',
        },
      };
    }
  );
}

module.exports = { register };
