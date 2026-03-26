'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · Kafka Queue Service
// Handles GPU job publishing, consumer setup, DLQ management
// Retry with exponential backoff + dead-letter queue
// ══════════════════════════════════════════════════════════

const { Kafka, Partitioners, logLevel } = require('kafkajs');
const logger  = require('../../shared/utils/logger');
const { TOPICS, JOB_STATUS } = require('../../config/constants');

const MAX_RETRIES = 3;
const RETRY_DELAYS = [5000, 30000, 120000]; // 5s, 30s, 2min

let kafka    = null;
let producer = null;
let consumer = null;
let isConnected = false;

// ── Initialise ────────────────────────────────────────────
async function init() {
  const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
  kafka = new Kafka({
    clientId:  process.env.KAFKA_CLIENT_ID || 'designos-gateway',
    brokers,
    logLevel:  logLevel.WARN,
    ssl:       process.env.KAFKA_SSL === 'true',
    retry: {
      initialRetryTime: 300,
      retries:          8,
    },
  });

  producer = kafka.producer({
    createPartitioner: Partitioners.LegacyPartitioner,
    transactionTimeout: 30000,
  });

  await producer.connect();
  isConnected = true;
  logger.info('Kafka producer connected', { brokers });
}

// ── Publish render job ────────────────────────────────────
async function publishRenderJob(job) {
  if (!isConnected) {
    logger.warn('Kafka not connected — using fallback in-memory queue');
    return fallbackQueue.push(job);
  }

  const message = {
    key:   job.jobId,
    value: JSON.stringify({
      ...job,
      publishedAt: new Date().toISOString(),
      retryCount:  0,
    }),
    headers: {
      priority:   String(job.priority || 1),
      mode:       job.mode,
      userId:     job.userId,
      version:    '1.1.0',
    },
    partition: getPartitionByPriority(job.priority),
  };

  try {
    await producer.send({
      topic:    TOPICS.RENDERS,
      messages: [message],
    });
    logger.info('Job published to Kafka', { jobId: job.jobId, mode: job.mode, priority: job.priority });
  } catch (err) {
    logger.error('Kafka publish failed', { jobId: job.jobId, error: err.message });
    throw err;
  }
}

// ── Publish to DLQ ────────────────────────────────────────
async function publishToDeadLetter(job, error) {
  if (!isConnected) return;
  await producer.send({
    topic: TOPICS.DEAD_LETTER,
    messages: [{
      key:   job.jobId,
      value: JSON.stringify({
        ...job,
        failedAt:    new Date().toISOString(),
        errorMessage: error.message,
        errorStack:  error.stack,
      }),
    }],
  }).catch(e => logger.error('DLQ publish failed', { error: e.message }));
}

// ── Publish QA result ─────────────────────────────────────
async function publishQAResult(jobId, result) {
  if (!isConnected) return;
  await producer.send({
    topic: TOPICS.QA,
    messages: [{
      key:   jobId,
      value: JSON.stringify({ jobId, result, timestamp: new Date().toISOString() }),
    }],
  });
}

// ── Publish notification ──────────────────────────────────
async function publishNotification(userId, notification) {
  if (!isConnected) return;
  await producer.send({
    topic: TOPICS.NOTIFICATIONS,
    messages: [{
      key:   userId,
      value: JSON.stringify({ userId, ...notification, timestamp: new Date().toISOString() }),
    }],
  });
}

// ── Get queue depth (for backpressure) ───────────────────
async function getQueueDepth(topic = TOPICS.RENDERS) {
  if (!isConnected || !kafka) return 0;
  try {
    const admin = kafka.admin();
    await admin.connect();
    const offsets = await admin.fetchTopicOffsets(topic);
    await admin.disconnect();
    return offsets.reduce((sum, p) => sum + (Number(p.high) - Number(p.low)), 0);
  } catch {
    return 0;
  }
}

// ── Partition routing by priority ─────────────────────────
function getPartitionByPriority(priority) {
  if (priority >= 10) return 0; // Cinema — highest priority partition
  if (priority >= 5)  return 1; // Pro
  return 2;                     // Draft — lowest
}

// ── Retry logic ───────────────────────────────────────────
async function retryJob(job, attempt = 0) {
  if (attempt >= MAX_RETRIES) {
    logger.error('Max retries exceeded, sending to DLQ', { jobId: job.jobId, attempts: attempt });
    await publishToDeadLetter(job, new Error(`Max retries (${MAX_RETRIES}) exceeded`));
    return false;
  }

  const delay = RETRY_DELAYS[attempt] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
  logger.info('Scheduling job retry', { jobId: job.jobId, attempt: attempt + 1, delayMs: delay });

  setTimeout(async () => {
    await publishRenderJob({ ...job, retryCount: attempt + 1 });
  }, delay);

  return true;
}

// ── Fallback in-memory queue (when Kafka unavailable) ─────
const fallbackQueue = {
  _items: [],
  push(job) {
    this._items.push({ ...job, queuedAt: new Date() });
    logger.warn('Using in-memory fallback queue', { jobId: job.jobId, depth: this._items.length });
  },
  shift() { return this._items.shift(); },
  get depth() { return this._items.length; },
};

// ── Health ────────────────────────────────────────────────
async function healthCheck() {
  return { connected: isConnected, fallbackDepth: fallbackQueue.depth };
}

// ── Disconnect ────────────────────────────────────────────
async function disconnect() {
  if (producer) await producer.disconnect().catch(() => {});
  if (consumer) await consumer.disconnect().catch(() => {});
  isConnected = false;
}

module.exports = {
  init, publishRenderJob, publishToDeadLetter,
  publishQAResult, publishNotification,
  getQueueDepth, retryJob, healthCheck, disconnect,
};
