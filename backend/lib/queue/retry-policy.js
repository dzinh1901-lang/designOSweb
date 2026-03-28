'use strict';

function createRetryPolicy({
  maxAttempts = 4,
  baseDelayMs = 1500,
  maxDelayMs = 60_000,
  jitterRatio = 0.25,
} = {}) {
  return {
    maxAttempts,
    shouldRetry(error, attempt) {
      if (attempt >= maxAttempts) return false;
      if (!error) return true;
      if (error.retryable === false) return false;
      const status = error.status || error.statusCode;
      return !status || status === 429 || status >= 500;
    },
    getDelayMs(attempt) {
      const exp = Math.min(maxDelayMs, baseDelayMs * (2 ** Math.max(attempt - 1, 0)));
      const jitter = exp * jitterRatio * Math.random();
      return Math.round(exp + jitter);
    },
  };
}

module.exports = { createRetryPolicy };
