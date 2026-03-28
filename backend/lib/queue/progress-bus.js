'use strict';

const { EventEmitter } = require('events');

class ProgressBus extends EventEmitter {
  emitProgress(jobId, payload) {
    const event = {
      jobId,
      status: payload.status,
      stage: payload.stage || null,
      progress: Number.isFinite(payload.progress) ? payload.progress : null,
      message: payload.message || null,
      outputs: payload.outputs || null,
      timestamp: new Date().toISOString(),
    };

    this.emit('progress', event);
    this.emit(`job:${jobId}`, event);

    return event;
  }

  subscribe(jobId, listener) {
    this.on(`job:${jobId}`, listener);
    return () => this.off(`job:${jobId}`, listener);
  }
}

module.exports = new ProgressBus();
