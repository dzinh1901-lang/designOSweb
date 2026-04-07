'use strict';

const { v4: uuidv4 } = require('uuid');

class GenerationJobProducer {
  constructor({ queue }) {
    this.queue = queue;
  }

  async enqueue({
    type,
    userId,
    projectId,
    generationJobId,
    prompt,
    options = {},
    input = {},
  }) {
    const now = new Date().toISOString();
    const job = {
      id: uuidv4(),
      type,
      userId,
      projectId,
      generationJobId,
      prompt,
      options,
      input,
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };

    await this.queue.push(job);
    return job;
  }
}

module.exports = { GenerationJobProducer };
