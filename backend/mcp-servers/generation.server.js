'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · Generation MCP Server
// Wraps the generation job submission and monitoring
// capabilities with a standardised MCP tool interface.
// ══════════════════════════════════════════════════════════

const registry = require('../mcp/mcp.registry');
const { buildToolDescriptor, SCHEMA_TYPES } = require('../mcp/mcp.schemas');
const projectService = require('../services/projects/projects.service');
const queueService   = require('../services/queue/queue.service');
const { RENDER_MODES } = require('../config/constants');

function register() {
  // ── submit_generation ──────────────────────────────────
  registry.registerTool(
    buildToolDescriptor({
      id:          'generation.submit',
      name:        'Submit Generation Job',
      description: 'Submit a new cinematic generation job to the pipeline',
      version:     '1.0.0',
      category:    'generation',
      inputSchema: {
        properties: {
          projectId:     { type: SCHEMA_TYPES.STRING },
          prompt:        { type: SCHEMA_TYPES.STRING, minLength: 10, maxLength: 2000 },
          mode:          { type: SCHEMA_TYPES.STRING, enum: Object.values(RENDER_MODES) },
          style_presets: { type: SCHEMA_TYPES.ARRAY },
          reference_images: { type: SCHEMA_TYPES.ARRAY },
          duration_seconds: { type: SCHEMA_TYPES.NUMBER, minimum: 1, maximum: 120 },
          resolution:    { type: SCHEMA_TYPES.STRING },
        },
        required: ['projectId', 'prompt', 'mode'],
      },
      outputSchema: {
        properties: {
          job: { type: SCHEMA_TYPES.OBJECT },
        },
        required: ['job'],
      },
    }),
    async (input, context) => {
      const job = await projectService.createGenerationJob({
        projectId:       input.projectId,
        userId:          context.userId,
        prompt:          input.prompt,
        mode:            input.mode,
        stylePresets:    input.style_presets    || [],
        referenceImages: input.reference_images || [],
        durationSeconds: input.duration_seconds || 8,
        resolution:      input.resolution       || '1920x1080',
      });
      return { job };
    }
  );

  // ── get_job_status ─────────────────────────────────────
  registry.registerTool(
    buildToolDescriptor({
      id:          'generation.status',
      name:        'Get Job Status',
      description: 'Get the current status and progress of a generation job',
      version:     '1.0.0',
      category:    'generation',
      inputSchema: {
        properties: {
          jobId: { type: SCHEMA_TYPES.STRING },
        },
        required: ['jobId'],
      },
      outputSchema: {
        properties: {
          job: { type: SCHEMA_TYPES.OBJECT },
        },
        required: ['job'],
      },
    }),
    async (input, context) => {
      const job = await projectService.getJobStatus({ jobId: input.jobId, userId: context.userId });
      return { job };
    }
  );

  // ── cancel_job ─────────────────────────────────────────
  registry.registerTool(
    buildToolDescriptor({
      id:          'generation.cancel',
      name:        'Cancel Generation Job',
      description: 'Cancel a running or queued generation job',
      version:     '1.0.0',
      category:    'generation',
      inputSchema: {
        properties: {
          jobId: { type: SCHEMA_TYPES.STRING },
        },
        required: ['jobId'],
      },
      outputSchema: {
        properties: {
          cancelled: { type: SCHEMA_TYPES.BOOLEAN },
        },
        required: ['cancelled'],
      },
    }),
    async (input, context) => {
      await projectService.submitHITLReview({ jobId: input.jobId, userId: context.userId, action: 'cancel' });
      return { cancelled: true, jobId: input.jobId };
    }
  );

  // ── queue_stats ────────────────────────────────────────
  registry.registerTool(
    buildToolDescriptor({
      id:          'generation.queue_stats',
      name:        'Queue Statistics',
      description: 'Retrieve current render queue depth and throughput metrics',
      version:     '1.0.0',
      category:    'generation',
      inputSchema: { properties: {}, required: [] },
      outputSchema: {
        properties: {
          stats: { type: SCHEMA_TYPES.OBJECT },
        },
        required: ['stats'],
      },
    }),
    async (_input, _context) => {
      let stats = { queued: 0, processing: 0 };
      try {
        const health = await queueService.healthCheck();
        const depth  = await queueService.getQueueDepth();
        stats = { ...health, queued: depth || 0 };
      } catch {
        // Queue stats are non-critical — return defaults
      }
      return { stats };
    }
  );
}

module.exports = { register };
