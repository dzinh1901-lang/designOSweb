'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · Coordinator + MCP Discovery Routes
// GET  /api/v1/mcp/tools          – Discover available tools
// POST /api/v1/mcp/tools/:id      – Invoke a specific tool
// GET  /api/v1/mcp/initialize     – MCP handshake info
// ══════════════════════════════════════════════════════════

const router    = require('express').Router();
const { param, query, body } = require('express-validator');
const { authenticate, requireRole } = require('../../shared/middleware/auth.middleware');
const { validate }                  = require('../../shared/validators/schemas');
const protocol                      = require('../../mcp/mcp.protocol');
const { HTTP, ROLES }               = require('../../config/constants');
const logger                        = require('../../shared/utils/logger');

// All coordinator/MCP routes require authentication
router.use(authenticate);

// ── GET /mcp/initialize ───────────────────────────────────
router.get('/initialize', (req, res) => {
  const info = protocol.handleInitialize();
  res.status(HTTP.OK).json({ ...info, requestId: req.requestId });
});

// ── GET /mcp/tools ────────────────────────────────────────
router.get(
  '/tools',
  [
    query('category').optional().isString().trim().escape(),
    validate,
  ],
  (req, res) => {
    const tools = protocol.handleToolDiscovery(req.query.category || undefined);
    res.status(HTTP.OK).json({ tools, count: tools.length, requestId: req.requestId });
  }
);

// ── POST /mcp/tools/:id ───────────────────────────────────
// Direct tool invocation — restricted to admin / pro roles for testing
router.post(
  '/tools/:id',
  requireRole(ROLES.ADMIN, ROLES.PRO, ROLES.STUDIO),
  [
    param('id').isString().trim(),
    body('input').optional().isObject(),
    validate,
  ],
  async (req, res, next) => {
    try {
      const toolId = req.params.id;
      const input  = req.body.input || {};
      const context = {
        userId:    req.user.id,
        role:      req.user.role,
        requestId: req.requestId,
        approved:  req.body.approved === true,
      };

      logger.info('MCP direct tool invocation', { toolId, userId: req.user.id, requestId: req.requestId });

      const result = await protocol.handleToolExecution(toolId, input, context);
      const status = result.status === 'error' ? HTTP.BAD_REQUEST : HTTP.OK;
      res.status(status).json({ ...result, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

module.exports = router;
