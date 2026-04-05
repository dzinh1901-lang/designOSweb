'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · Coordinator Tool Executor
// Invokes MCP tools as part of a task execution plan.
// Supports retries, fallbacks, and approval gates.
// ══════════════════════════════════════════════════════════

const protocol = require('../mcp/mcp.protocol');
const { TOOL_STATUS } = require('../mcp/mcp.schemas');
const logger   = require('../shared/utils/logger');

const MAX_RETRIES        = 2;
const RETRY_DELAY_MS     = 500;

/**
 * Execute a single plan step.
 *
 * @param {object} step       - Plan step descriptor
 * @param {object} taskState  - Current task state (for context)
 * @param {object} context    - { userId, role, requestId, approved }
 * @returns {Promise<object>} - { success, result, requiresApproval, error }
 */
async function executeStep(step, taskState, context = {}) {
  if (step.action === 'extract_params') {
    // Planner-only step; no tool invocation needed
    return { success: true, result: { note: step.description }, requiresApproval: false };
  }

  if (step.action !== 'invoke_tool') {
    logger.warn('Coordinator executor: unknown step action', { action: step.action });
    return { success: false, error: `Unknown action: ${step.action}`, requiresApproval: false };
  }

  const { toolId } = step;
  if (!toolId) {
    return { success: false, error: 'Step is missing toolId', requiresApproval: false };
  }

  // Build tool input from task state context and step params
  const toolInput = _buildToolInput(step, taskState, context);

  // Check if step requires approval and caller hasn't approved
  if (step.requiresApproval && !context.approved) {
    return {
      success:          false,
      requiresApproval: true,
      toolId,
      result:           { message: 'Approval required before executing this step' },
    };
  }

  // Execute with retry
  let attempt = 0;
  let lastError;

  while (attempt <= MAX_RETRIES) {
    attempt++;
    const execContext = { ...context, approved: !step.requiresApproval || context.approved };
    const result = await protocol.handleToolExecution(toolId, toolInput, execContext);

    if (result.status === TOOL_STATUS.SUCCESS) {
      return { success: true, result: result.data, requiresApproval: false };
    }

    if (result.status === TOOL_STATUS.PENDING) {
      return {
        success:          false,
        requiresApproval: true,
        toolId,
        result:           result.data,
      };
    }

    // ERROR — retry with backoff
    lastError = result.error || 'Unknown tool error';
    logger.warn('Coordinator executor: tool error, retrying', {
      toolId,
      attempt,
      maxRetries: MAX_RETRIES,
      error:      lastError,
    });

    if (attempt <= MAX_RETRIES) {
      await _sleep(RETRY_DELAY_MS * attempt);
    }
  }

  return { success: false, error: lastError, requiresApproval: false };
}

/**
 * Build a tool input object by merging step params with task state context.
 * Extracts commonly needed IDs from prior step results.
 */
function _buildToolInput(step, taskState, context) {
  const input = { ...(step.params || {}) };

  // Propagate userId from context
  if (context.userId) input.userId = context.userId;

  // Try to resolve projectId from prior steps
  if (!input.projectId) {
    const projectStep = (taskState.steps || [])
      .slice()
      .reverse()
      .find(s => s.result?.project?.id || s.result?.projects?.[0]?.id);

    if (projectStep) {
      input.projectId =
        projectStep.result?.project?.id ||
        projectStep.result?.projects?.[0]?.id;
    }
  }

  // Try to resolve jobId from prior steps
  if (!input.jobId) {
    const jobStep = (taskState.steps || [])
      .slice()
      .reverse()
      .find(s => s.result?.job?.id);

    if (jobStep) {
      input.jobId = jobStep.result?.job?.id;
    }
  }

  return input;
}

function _sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { executeStep };
