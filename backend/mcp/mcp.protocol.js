'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · MCP Protocol Handler
// Implements the MCP initialize / tool-discovery /
// tool-execution lifecycle.
// ══════════════════════════════════════════════════════════

const registry = require('./mcp.registry');
const { validateSchema, buildResult, TOOL_STATUS, MCP_VERSION } = require('./mcp.schemas');
const logger   = require('../shared/utils/logger');

/**
 * Handle the MCP "initialize" handshake.
 * Returns server capabilities and available tools.
 */
function handleInitialize() {
  return {
    protocol:     'mcp',
    version:      MCP_VERSION,
    server:       'designos-mcp',
    capabilities: {
      tools:     true,
      streaming: true,
      approval:  true,
    },
    tools: registry.listTools(),
  };
}

/**
 * Handle tool-discovery: return all or filtered tool descriptors.
 * @param {string} [category]
 */
function handleToolDiscovery(category) {
  return registry.listTools(category);
}

/**
 * Handle tool execution.
 * Validates input, enforces RBAC, runs the handler.
 *
 * @param {string}  toolId   - registered tool ID
 * @param {object}  input    - caller-supplied inputs
 * @param {object}  context  - { userId, role, requestId, ... }
 * @returns {Promise<object>} MCP result envelope
 */
async function handleToolExecution(toolId, input, context = {}) {
  const entry = registry.getTool(toolId);
  if (!entry) {
    logger.warn('MCP: unknown tool invoked', { toolId, requestId: context.requestId });
    return buildResult(TOOL_STATUS.ERROR, { message: `Tool not found: ${toolId}` });
  }

  const { descriptor, handler } = entry;

  // Schema validation
  const { valid, errors } = validateSchema(descriptor.inputSchema, input || {});
  if (!valid) {
    logger.warn('MCP: tool input validation failed', { toolId, errors, requestId: context.requestId });
    return buildResult(TOOL_STATUS.ERROR, { message: `Validation failed: ${errors.join('; ')}` });
  }

  // Approval gate — callers that don't carry approval token are blocked
  if (descriptor.requiresApproval && !context.approved) {
    logger.info('MCP: tool requires approval', { toolId, userId: context.userId });
    return buildResult(TOOL_STATUS.PENDING, { message: 'Action requires explicit approval', toolId });
  }

  // Invoke handler
  const start = Date.now();
  try {
    const result = await handler(input || {}, context);
    const latencyMs = Date.now() - start;

    logger.info('MCP: tool executed', {
      toolId,
      userId:     context.userId,
      latencyMs,
      requestId:  context.requestId,
    });

    return buildResult(TOOL_STATUS.SUCCESS, result, { toolId, latencyMs });
  } catch (err) {
    const latencyMs = Date.now() - start;
    logger.error('MCP: tool execution error', {
      toolId,
      error:      err.message,
      latencyMs,
      requestId:  context.requestId,
    });
    return buildResult(TOOL_STATUS.ERROR, { message: err.message }, { toolId, latencyMs });
  }
}

module.exports = {
  handleInitialize,
  handleToolDiscovery,
  handleToolExecution,
};
