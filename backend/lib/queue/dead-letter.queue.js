'use strict';

const logger = require('../../shared/utils/logger');

class DeadLetterQueue {
  constructor() {
    this.items = [];
  }

  async push({ job, error, context = {} }) {
    const entry = {
      id: `${job.id || job.jobId}-dlq-${Date.now()}`,
      jobId: job.id || job.jobId,
      job,
      error: {
        message: error?.message || 'Unknown worker failure',
        code: error?.code || null,
        stack: error?.stack || null,
      },
      context,
      failedAt: new Date().toISOString(),
    };

    this.items.push(entry);
    logger.error('Job moved to dead-letter queue', { jobId: entry.jobId, reason: entry.error.message });
    return entry;
  }

  list({ limit = 50 } = {}) {
    return this.items.slice(-limit).reverse();
  }
}

module.exports = { DeadLetterQueue };
