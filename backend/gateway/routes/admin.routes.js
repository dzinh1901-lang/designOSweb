'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · Admin Routes (role: admin only)
// GET  /api/v1/admin/users
// GET  /api/v1/admin/users/:userId
// PATCH /api/v1/admin/users/:userId
// GET  /api/v1/admin/jobs
// GET  /api/v1/admin/metrics/summary
// POST /api/v1/admin/credits/adjust
// POST /api/v1/admin/queue/flush-dlq
// ══════════════════════════════════════════════════════════

const router      = require('express').Router();
const { authenticate, requireRole } = require('../../shared/middleware/auth.middleware');
const queueService = require('../../services/queue/queue.service');
const agenticAutonomy = require('../../services/agentic/agentic-autonomy.service');
const { body, param, query } = require('express-validator');
const { validate } = require('../../shared/validators/schemas');
const { HTTP, ROLES } = require('../../config/constants');
const logger      = require('../../shared/utils/logger');

// All admin routes require admin role
router.use(authenticate);
router.use(requireRole(ROLES.ADMIN));

// ── GET /admin/users ──────────────────────────────────────
router.get(
  '/users',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('role').optional().isString(),
    query('search').optional().isString().trim().isLength({ max: 100 }),
    validate,
  ],
  async (req, res, next) => {
    try {
      // In production, query Firestore
      res.status(HTTP.OK).json({
        message:   'Admin: user listing (connect Firestore to populate)',
        page:      req.query.page   || 1,
        limit:     req.query.limit  || 20,
        requestId: req.requestId,
      });
    } catch (err) { next(err); }
  }
);

// ── GET /admin/users/:userId ──────────────────────────────
router.get(
  '/users/:userId',
  [param('userId').isUUID(), validate],
  async (req, res, next) => {
    try {
      res.status(HTTP.OK).json({
        userId:    req.params.userId,
        message:   'Admin: user detail (connect Firestore)',
        requestId: req.requestId,
      });
    } catch (err) { next(err); }
  }
);

// ── PATCH /admin/users/:userId ────────────────────────────
router.patch(
  '/users/:userId',
  [
    param('userId').isUUID(),
    body('role').optional().isIn(Object.values(ROLES)),
    body('active').optional().isBoolean(),
    validate,
  ],
  async (req, res, next) => {
    try {
      logger.info('Admin: user update', {
        adminId: req.user.id,
        targetUserId: req.params.userId,
        updates: req.body,
      });
      res.status(HTTP.OK).json({
        userId:    req.params.userId,
        updates:   req.body,
        requestId: req.requestId,
      });
    } catch (err) { next(err); }
  }
);

// ── GET /admin/jobs ───────────────────────────────────────
router.get(
  '/jobs',
  [
    query('status').optional().isString(),
    query('mode').optional().isString(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    validate,
  ],
  async (req, res, next) => {
    try {
      const queueHealth = await queueService.healthCheck();
      const depth       = await queueService.getQueueDepth();
      res.status(HTTP.OK).json({
        queue:     { depth, ...queueHealth },
        message:   'Admin: job listing (connect Firestore)',
        requestId: req.requestId,
      });
    } catch (err) { next(err); }
  }
);

// ── GET /admin/metrics/summary ────────────────────────────
router.get(
  '/metrics/summary',
  async (req, res, next) => {
    try {
      const [kafkaHealth, queueDepth] = await Promise.all([
        queueService.healthCheck(),
        queueService.getQueueDepth(),
      ]);
      res.status(HTTP.OK).json({
        timestamp:   new Date().toISOString(),
        queueDepth,
        kafka:       kafkaHealth,
        uptime:      process.uptime(),
        memoryUsage: process.memoryUsage(),
        requestId:   req.requestId,
      });
    } catch (err) { next(err); }
  }
);

// ── POST /admin/credits/adjust ────────────────────────────
router.post(
  '/credits/adjust',
  [
    body('userId').isUUID(),
    body('amount').isFloat({ min: -1000, max: 1000 }),
    body('reason').trim().isLength({ min: 1, max: 500 }).escape(),
    validate,
  ],
  async (req, res, next) => {
    try {
      const { userId, amount, reason } = req.body;
      logger.info('Admin: credits adjusted', {
        adminId: req.user.id, userId, amount, reason,
      });
      res.status(HTTP.OK).json({
        userId,
        adjustment: amount,
        reason,
        message:   'Credits adjusted (connect Firestore to persist)',
        requestId: req.requestId,
      });
    } catch (err) { next(err); }
  }
);

// ── POST /admin/queue/flush-dlq ───────────────────────────
router.post(
  '/queue/flush-dlq',
  async (req, res, next) => {
    try {
      logger.warn('Admin: DLQ flush requested', { adminId: req.user.id });
      res.status(HTTP.ACCEPTED).json({
        message:   'DLQ flush queued (implement Kafka admin client)',
        requestId: req.requestId,
      });
    } catch (err) { next(err); }
  }
);

// ════════════════════════════════════════════════════════════
//  AGENTIC AUTONOMY ADMIN ROUTES (v1.3.0)
// ════════════════════════════════════════════════════════════

// ── GET /admin/agentic/status ─────────────────────────────
router.get(
  '/agentic/status',
  async (req, res, next) => {
    try {
      const status = agenticAutonomy.getStatus();
      res.status(HTTP.OK).json({ ...status, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

// ── GET /admin/agentic/adaptations ────────────────────────
router.get(
  '/agentic/adaptations',
  async (req, res, next) => {
    try {
      const log = agenticAutonomy.getAdaptationLog();
      res.status(HTTP.OK).json({ adaptations: log, count: log.length, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

// ── GET /admin/agentic/memory ─────────────────────────────
router.get(
  '/agentic/memory',
  [query('limit').optional().isInt({ min: 1, max: 100 }).toInt(), validate],
  async (req, res, next) => {
    try {
      const episodes = agenticAutonomy.getEpisodicMemory(req.query.limit || 10);
      res.status(HTTP.OK).json({ episodes, count: episodes.length, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

// ── POST /admin/agentic/trigger ────────────────────────────
// Manually trigger a full Perceive→Reason→Act→Learn cycle
router.post(
  '/agentic/trigger',
  async (req, res, next) => {
    try {
      logger.info('Admin: manual agentic cycle triggered', { adminId: req.user.id });
      const result = await agenticAutonomy.triggerManualCycle();
      res.status(HTTP.OK).json({ ...result, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

module.exports = router;
