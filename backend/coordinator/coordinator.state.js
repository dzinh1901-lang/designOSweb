'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · Coordinator Task State Manager
// Persists task state across execution steps.
// In-memory fallback when Firestore is not available.
// ══════════════════════════════════════════════════════════

const { v4: uuidv4 }  = require('uuid');
const logger           = require('../shared/utils/logger');

// Task status constants
const TASK_STATUS = Object.freeze({
  PENDING:    'pending',
  PLANNING:   'planning',
  EXECUTING:  'executing',
  WAITING:    'waiting_approval',
  COMPLETED:  'completed',
  FAILED:     'failed',
  CANCELLED:  'cancelled',
});

// In-memory fallback store
const _inMemory = new Map();

// Firestore reference (injected)
let _db = null;
function init(db) { _db = db; }

const COLLECTION = 'coordinator_tasks';

// ── Create task ───────────────────────────────────────────
async function createTask({ userId, sessionId, goal, permissions = [] }) {
  const taskId = uuidv4();
  const now    = new Date().toISOString();

  const task = {
    id:          taskId,
    userId,
    sessionId:   sessionId || uuidv4(),
    goal,
    status:      TASK_STATUS.PENDING,
    permissions,
    plan:        null,
    steps:       [],
    result:      null,
    error:       null,
    auditLog:    [],
    createdAt:   now,
    updatedAt:   now,
  };

  await _persist(taskId, task);
  logger.info('Task created', { taskId, userId });
  return task;
}

// ── Get task ──────────────────────────────────────────────
async function getTask(taskId) {
  if (_db) {
    const doc = await _db.collection(COLLECTION).doc(taskId).get();
    if (!doc.exists) return null;
    return doc.data();
  }
  return _inMemory.get(taskId) || null;
}

// ── Update task status ────────────────────────────────────
async function updateTaskStatus(taskId, status, extra = {}) {
  const task = await getTask(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  const updated = {
    ...task,
    status,
    updatedAt: new Date().toISOString(),
    ...extra,
  };

  await _persist(taskId, updated);
  return updated;
}

// ── Append step result ────────────────────────────────────
async function appendStepResult(taskId, step) {
  const task = await getTask(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  const steps = [...(task.steps || []), { ...step, timestamp: new Date().toISOString() }];
  return updateTaskStatus(taskId, task.status, { steps });
}

// ── Append audit event ────────────────────────────────────
async function appendAuditEvent(taskId, event) {
  const task = await getTask(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  const auditLog = [
    ...(task.auditLog || []),
    { ...event, timestamp: new Date().toISOString() },
  ];

  const updated = {
    ...task,
    auditLog,
    updatedAt: new Date().toISOString(),
  };

  await _persist(taskId, updated);
  return updated;
}

// ── List tasks for a user ─────────────────────────────────
async function listUserTasks(userId, { page = 1, limit = 20 } = {}) {
  if (_db) {
    const snap = await _db
      .collection(COLLECTION)
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .offset((page - 1) * limit)
      .get();

    const tasks = snap.docs.map(d => d.data());
    const total = (
      await _db.collection(COLLECTION).where('userId', '==', userId).count().get()
    ).data().count;

    return { tasks, total, page, limit };
  }

  const all   = Array.from(_inMemory.values()).filter(t => t.userId === userId);
  const sorted = all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const start  = (page - 1) * limit;
  return {
    tasks: sorted.slice(start, start + limit),
    total: sorted.length,
    page,
    limit,
  };
}

// ── Cancel task ───────────────────────────────────────────
async function cancelTask(taskId, userId) {
  const task = await getTask(taskId);
  if (!task)              throw new Error(`Task not found: ${taskId}`);
  if (task.userId !== userId) throw Object.assign(new Error('Forbidden'), { status: 403 });

  return updateTaskStatus(taskId, TASK_STATUS.CANCELLED);
}

// ── Internal: persist (Firestore or in-memory) ─────────────
async function _persist(taskId, data) {
  if (_db) {
    await _db.collection(COLLECTION).doc(taskId).set(data, { merge: true });
  } else {
    _inMemory.set(taskId, data);
  }
}

module.exports = {
  TASK_STATUS,
  init,
  createTask,
  getTask,
  updateTaskStatus,
  appendStepResult,
  appendAuditEvent,
  listUserTasks,
  cancelTask,
};
