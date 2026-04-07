'use strict';

const logger = require('../../../shared/utils/logger');
const progressBus = require('../progress-bus');

class InMemoryQueue {
  constructor() {
    this.items = [];
  }

  async push(job) {
    this.items.push(job);
  }

  async pop() {
    return this.items.shift() || null;
  }

  get length() {
    return this.items.length;
  }
}

class GenerationWorker {
  constructor({ queue, retryPolicy, deadLetterQueue, pipelineByType }) {
    this.queue = queue;
    this.retryPolicy = retryPolicy;
    this.deadLetterQueue = deadLetterQueue;
    this.pipelineByType = pipelineByType;
    this.running = false;
    this.pollIntervalMs = 250;
  }

  async processNext() {
    const job = await this.queue.pop();
    if (!job) return false;

    const pipeline = this.pipelineByType[job.type];
    if (!pipeline) {
      await this.deadLetterQueue.push({
        job,
        error: new Error(`Unsupported job type: ${job.type}`),
        context: { phase: 'dispatch' },
      });
      return true;
    }

    const emit = (payload) => progressBus.emitProgress(job.generationJobId || job.id, payload);

    try {
      emit({ status: 'processing', stage: 'queued', progress: 0.05, message: 'Job started' });
      await pipeline.run(job, emit);
      logger.info('Generation job completed', { jobId: job.id, type: job.type });
    } catch (error) {
      const attempt = (job.attempts || 0) + 1;
      if (this.retryPolicy.shouldRetry(error, attempt)) {
        const delayMs = this.retryPolicy.getDelayMs(attempt);
        logger.warn('Generation worker retry scheduled', { jobId: job.id, attempt, delayMs, error: error.message });

        setTimeout(() => {
          this.queue.push({ ...job, attempts: attempt, updatedAt: new Date().toISOString() }).catch(() => {});
        }, delayMs);

        emit({ status: 'retrying', stage: 'retry_backoff', progress: null, message: `Retry ${attempt} scheduled in ${delayMs}ms` });
      } else {
        await this.deadLetterQueue.push({ job, error, context: { attempts: attempt } });
        emit({ status: 'failed', stage: 'dead_letter', progress: null, message: error.message });
      }
    }

    return true;
  }

  async start() {
    if (this.running) return;
    this.running = true;

    while (this.running) {
      const didWork = await this.processNext();
      if (!didWork) {
        await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
      }
    }
  }

  stop() {
    this.running = false;
  }
}

module.exports = {
  GenerationWorker,
  InMemoryQueue,
};
