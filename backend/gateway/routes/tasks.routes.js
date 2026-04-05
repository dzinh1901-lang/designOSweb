'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · Tasks Routes  (Coordinator API)
// POST   /api/v1/tasks              – Create task from goal
// GET    /api/v1/tasks              – List user tasks
// GET    /api/v1/tasks/:id          – Get task state + plan
// GET    /api/v1/tasks/:id/stream   – SSE stream of task progress
// POST   /api/v1/tasks/:id/approve  – Approve gated action
// POST   /api/v1/tasks/:id/cancel   – Cancel task
// ══════════════════════════════════════════════════════════

const router      = require('express').Router();
const { body, param, query } = require('express-validator');
const { authenticate }       = require('../../shared/middleware/auth.middleware');
const { validate }           = require('../../shared/validators/schemas');
const stateManager           = require('../../coordinator/coordinator.state');
const orchestrator           = require('../../coordinator/coordinator.orchestrator');
const logger                 = require('../../shared/utils/logger');
const { HTTP }               = require('../../config/constants');

// All task routes require authentication
router.use(authenticate);

// ── POST /tasks ───────────────────────────────────────────
router.post(
  '/',
  [
    body('goal')
      .trim()
      .isLength({ min: 5, max: 2000 }).withMessage('Goal must be 5–2000 characters')
      .escape(),
    body('sessionId').optional().isUUID().withMessage('sessionId must be a UUID'),
    validate,
  ],
  async (req, res, next) => {
    try {
      const task = await orchestrator.createAndRun({
        goal:      req.body.goal,
        userId:    req.user.id,
        sessionId: req.body.sessionId,
        role:      req.user.role,
        requestId: req.requestId,
      });
      res.status(HTTP.CREATED).json({ task, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

// ── GET /tasks ─────────────────────────────────────────────
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    validate,
  ],
  async (req, res, next) => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const result = await stateManager.listUserTasks(req.user.id, { page, limit });
      res.status(HTTP.OK).json({ ...result, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

// ── GET /tasks/:id ────────────────────────────────────────
router.get(
  '/:id',
  [param('id').isUUID(), validate],
  async (req, res, next) => {
    try {
      const task = await stateManager.getTask(req.params.id);
      if (!task) return res.status(HTTP.NOT_FOUND).json({ error: 'Task not found', requestId: req.requestId });
      if (task.userId !== req.user.id) return res.status(HTTP.FORBIDDEN).json({ error: 'Forbidden', requestId: req.requestId });
      res.status(HTTP.OK).json({ task, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

// ── GET /tasks/:id/stream — SSE ───────────────────────────
router.get(
  '/:id/stream',
  [param('id').isUUID(), validate],
  async (req, res, next) => {
    try {
      const task = await stateManager.getTask(req.params.id);
      if (!task) return res.status(HTTP.NOT_FOUND).json({ error: 'Task not found' });
      if (task.userId !== req.user.id) return res.status(HTTP.FORBIDDEN).json({ error: 'Forbidden' });

      res.setHeader('Content-Type',      'text/event-stream');
      res.setHeader('Cache-Control',     'no-cache');
      res.setHeader('Connection',        'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      const taskId  = req.params.id;
      const userId  = req.user.id;

      res.write(`event: connected\ndata: ${JSON.stringify({ taskId, timestamp: new Date().toISOString() })}\n\n`);

      // Poll task state every 2s
      const interval = setInterval(async () => {
        try {
          const current = await stateManager.getTask(taskId);
          res.write(`event: update\ndata: ${JSON.stringify({
            taskId,
            status:    current.status,
            steps:     current.steps,
            plan:      current.plan,
            result:    current.result,
            updatedAt: current.updatedAt,
          })}\n\n`);

          if (['completed', 'failed', 'cancelled'].includes(current.status)) {
            res.write(`event: done\ndata: ${JSON.stringify({ status: current.status })}\n\n`);
            clearInterval(interval);
            res.end();
          }
        } catch (err) {
          logger.warn('Task SSE poll error', { taskId, error: err.message });
        }
      }, 2000);

      req.on('close', () => {
        clearInterval(interval);
      });
    } catch (err) { next(err); }
  }
);

// ── POST /tasks/:id/approve ───────────────────────────────
router.post(
  '/:id/approve',
  [param('id').isUUID(), validate],
  async (req, res, next) => {
    try {
      const task = await orchestrator.approveTask(req.params.id, req.user.id, req.requestId);
      res.status(HTTP.OK).json({ task, requestId: req.requestId });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message, requestId: req.requestId });
      next(err);
    }
  }
);

// ── POST /tasks/:id/cancel ────────────────────────────────
router.post(
  '/:id/cancel',
  [param('id').isUUID(), validate],
  async (req, res, next) => {
    try {
      const task = await stateManager.cancelTask(req.params.id, req.user.id);
      res.status(HTTP.OK).json({ task, requestId: req.requestId });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message, requestId: req.requestId });
      next(err);
    }
  }
);

module.exports = router;
