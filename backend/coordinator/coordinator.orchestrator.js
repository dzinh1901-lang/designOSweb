'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · Coordinator Orchestrator
// Main execution loop:
//  1. Ingest  — validate goal + session context + permissions
//  2. Classify — determine task type
//  3. Plan    — generate ordered execution plan
//  4. Execute — invoke MCP tools with retry/fallback
//  5. Reflect — continue / retry / delegate decision
//  6. Synthesise — build user-facing result + internal trace
// ══════════════════════════════════════════════════════════

const stateManager = require('./coordinator.state');
const planner      = require('./coordinator.planner');
const executor     = require('./coordinator.executor');
const logger       = require('../shared/utils/logger');

/**
 * Initialise the coordinator (inject Firestore DB if available).
 * @param {object|null} db - Firestore DB instance
 */
function init(db) {
  stateManager.init(db);
}

/**
 * Create a new task and immediately begin execution asynchronously.
 *
 * @param {object} opts
 * @param {string} opts.goal       - Natural language user goal
 * @param {string} opts.userId     - Authenticated user ID
 * @param {string} opts.sessionId  - Session ID
 * @param {string} opts.role       - User role (RBAC)
 * @param {string} opts.requestId  - Request trace ID
 * @returns {Promise<object>} - Created task (status = pending/planning)
 */
async function createAndRun({ goal, userId, sessionId, role, requestId }) {
  // 1. Ingest — create persistent task record
  const task = await stateManager.createTask({ userId, sessionId, goal });

  await stateManager.appendAuditEvent(task.id, {
    event:  'task_created',
    userId,
    goal,
    requestId,
  });

  // Run execution loop in background (non-blocking)
  setImmediate(() => _runLoop(task.id, { userId, role, sessionId, requestId })
    .catch(err => logger.error('Coordinator loop fatal error', { taskId: task.id, error: err.message }))
  );

  return stateManager.getTask(task.id);
}

/**
 * Approve a gated step and resume execution.
 *
 * @param {string} taskId
 * @param {string} userId
 * @param {string} requestId
 * @returns {Promise<object>} - Updated task
 */
async function approveTask(taskId, userId, requestId) {
  const task = await stateManager.getTask(taskId);
  if (!task)              throw Object.assign(new Error('Task not found'), { status: 404 });
  if (task.userId !== userId) throw Object.assign(new Error('Forbidden'),     { status: 403 });
  if (task.status !== stateManager.TASK_STATUS.WAITING) {
    throw Object.assign(new Error('Task is not waiting for approval'), { status: 409 });
  }

  await stateManager.appendAuditEvent(taskId, { event: 'task_approved', userId, requestId });

  // Resume with approval flag
  setImmediate(() => _runLoop(taskId, { userId, role: null, requestId, approved: true })
    .catch(err => logger.error('Coordinator resume error', { taskId, error: err.message }))
  );

  return stateManager.getTask(taskId);
}

// ── Internal execution loop ───────────────────────────────

async function _runLoop(taskId, context) {
  const { userId, role, requestId, approved = false } = context;

  // 2. Plan
  let task = await stateManager.updateTaskStatus(taskId, stateManager.TASK_STATUS.PLANNING);

  let plan;
  try {
    plan = await planner.generatePlan(task.goal, { userId, role });
  } catch (err) {
    logger.error('Coordinator: planning failed', { taskId, error: err.message });
    await stateManager.updateTaskStatus(taskId, stateManager.TASK_STATUS.FAILED, {
      error: `Planning failed: ${err.message}`,
    });
    return;
  }

  task = await stateManager.updateTaskStatus(taskId, stateManager.TASK_STATUS.EXECUTING, {
    plan,
  });

  await stateManager.appendAuditEvent(taskId, {
    event:  'plan_generated',
    intent: plan.intent,
    steps:  plan.steps.length,
    llmUsed: plan.llmUsed,
  });

  // 3. Execute plan steps
  const execContext = { userId, role, requestId, approved };
  let allResults    = [];

  for (const step of plan.steps) {
    task = await stateManager.getTask(taskId);

    // Abort if task was cancelled externally
    if (task.status === stateManager.TASK_STATUS.CANCELLED) {
      logger.info('Coordinator: task cancelled mid-execution', { taskId });
      return;
    }

    const stepResult = await executor.executeStep(step, task, execContext);

    // Record step result
    task = await stateManager.appendStepResult(taskId, {
      stepId:  step.stepId,
      toolId:  step.toolId,
      action:  step.action,
      ...stepResult,
    });

    await stateManager.appendAuditEvent(taskId, {
      event:   'step_executed',
      stepId:  step.stepId,
      toolId:  step.toolId,
      success: stepResult.success,
      requiresApproval: stepResult.requiresApproval,
    });

    // 4. Reflect — if approval required, pause and wait
    if (stepResult.requiresApproval) {
      await stateManager.updateTaskStatus(taskId, stateManager.TASK_STATUS.WAITING, {
        pendingStepId: step.stepId,
      });
      logger.info('Coordinator: task paused — waiting for approval', { taskId, stepId: step.stepId });
      return; // caller must invoke approveTask() to resume
    }

    // If step failed, decide whether to continue or abort
    if (!stepResult.success) {
      logger.warn('Coordinator: step failed', { taskId, stepId: step.stepId, error: stepResult.error });
      // Non-blocking steps (info gathering) — continue
      // Blocking steps (write operations) — abort
      if (step.action === 'invoke_tool' && step.critical) {
        await stateManager.updateTaskStatus(taskId, stateManager.TASK_STATUS.FAILED, {
          error: `Step ${step.stepId} failed: ${stepResult.error}`,
        });
        return;
      }
    } else {
      allResults.push({ stepId: step.stepId, result: stepResult.result });
    }
  }

  // 5. Synthesise result
  const synthesis = _synthesise(plan, allResults);

  await stateManager.updateTaskStatus(taskId, stateManager.TASK_STATUS.COMPLETED, {
    result:    synthesis,
    updatedAt: new Date().toISOString(),
  });

  await stateManager.appendAuditEvent(taskId, {
    event:  'task_completed',
    steps:  plan.steps.length,
    intent: plan.intent,
  });

  // Broadcast SSE update if available
  _broadcastUpdate(userId, {
    type:   'task_completed',
    taskId,
    result: synthesis,
  });

  logger.info('Coordinator: task completed', { taskId, userId, intent: plan.intent });
}

/**
 * Build a user-facing synthesis from all step results.
 */
function _synthesise(plan, results) {
  return {
    intent:    plan.intent,
    llmUsed:   plan.llmUsed,
    stepCount: plan.steps.length,
    outputs:   results,
    summary:   `Completed ${results.length} of ${plan.steps.length} step(s) for intent: ${plan.intent}`,
  };
}

/**
 * Push real-time update via SSE if the global SSE helper is available.
 */
function _broadcastUpdate(userId, data) {
  try {
    if (typeof global.pushJobUpdate === 'function') {
      global.pushJobUpdate(userId, data);
    }
  } catch {
    // SSE not configured — ignore
  }
}

module.exports = { init, createAndRun, approveTask };
