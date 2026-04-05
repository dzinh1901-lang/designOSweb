'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · MCP Tool Registry
// Central registry for all MCP-wrapped capability tools.
// Supports versioning, metadata lookup, and RBAC policy.
// ══════════════════════════════════════════════════════════

const logger = require('../shared/utils/logger');

// Internal store: toolId → tool descriptor + handler
const _registry = new Map();

/**
 * Register a tool with the registry.
 * @param {object} descriptor - Tool descriptor (from buildToolDescriptor)
 * @param {Function} handler  - async (input, context) => result
 */
function registerTool(descriptor, handler) {
  if (!descriptor.id || typeof handler !== 'function') {
    throw new Error('registerTool: descriptor.id and handler function are required');
  }
  if (_registry.has(descriptor.id)) {
    logger.warn('MCP registry: overwriting existing tool', { toolId: descriptor.id });
  }
  _registry.set(descriptor.id, { descriptor, handler });
  logger.info('MCP tool registered', { toolId: descriptor.id, version: descriptor.version });
}

/**
 * Retrieve a registered tool by ID.
 * @param {string} toolId
 * @returns {{ descriptor, handler } | null}
 */
function getTool(toolId) {
  return _registry.get(toolId) || null;
}

/**
 * List all registered tool descriptors (optionally filtered by category).
 * @param {string} [category]
 * @returns {object[]}
 */
function listTools(category) {
  const tools = Array.from(_registry.values()).map(({ descriptor }) => descriptor);
  if (category) return tools.filter(t => t.category === category);
  return tools;
}

/**
 * Check whether a tool is registered.
 * @param {string} toolId
 * @returns {boolean}
 */
function hasTool(toolId) {
  return _registry.has(toolId);
}

/**
 * Remove a tool from the registry (for testing/cleanup).
 * @param {string} toolId
 */
function deregisterTool(toolId) {
  _registry.delete(toolId);
}

/**
 * Clear all registered tools (for testing).
 */
function clearRegistry() {
  _registry.clear();
}

module.exports = {
  registerTool,
  getTool,
  listTools,
  hasTool,
  deregisterTool,
  clearRegistry,
};
