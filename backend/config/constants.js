'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · Platform Constants
// ══════════════════════════════════════════════════════════

module.exports = Object.freeze({

  // ── API ──────────────────────────────────────────────────
  API_PREFIX: '/api/v1',
  HEALTH_PATH: '/health',

  // ── Render Modes ─────────────────────────────────────────
  RENDER_MODES: {
    DRAFT:      'draft',
    CINEMA:     'cinema',
    EXPLORATION: 'exploration',
  },

  // ── Coordinator Task States ───────────────────────────────
  TASK_STATUS: {
    PENDING:   'pending',
    PLANNING:  'planning',
    EXECUTING: 'executing',
    WAITING:   'waiting_approval',
    COMPLETED: 'completed',
    FAILED:    'failed',
    CANCELLED: 'cancelled',
  },

  // ── Job States ───────────────────────────────────────────
  JOB_STATUS: {
    QUEUED:       'queued',
    INGESTING:    'ingesting',
    ANALYZING:    'analyzing',
    CONCEPTING:   'concepting',
    GENERATING:   'generating',
    SYNTHESIZING: 'synthesizing',
    EXPANDING:    'expanding',
    POST:         'post_production',
    QA:           'qa_review',
    HITL:         'hitl_review',
    COMPLETE:     'complete',
    FAILED:       'failed',
    CANCELLED:    'cancelled',
  },

  // ── Queue Priorities ─────────────────────────────────────
  QUEUE_PRIORITY: {
    DRAFT:   1,
    PRO:     5,
    CINEMA: 10,
  },

  // ── Token Credits ────────────────────────────────────────
  TOKEN_COSTS: {
    draft:       0.1,
    cinema:      1.0,
    exploration: 0.5,
  },

  // ── Security ─────────────────────────────────────────────
  BCRYPT_ROUNDS: 12,
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION_MS: 15 * 60 * 1000, // 15 min
  TOKEN_BLACKLIST_TTL: 7 * 24 * 60 * 60, // 7 days in seconds

  // ── File Limits ──────────────────────────────────────────
  MAX_FILE_SIZE_BYTES: 50 * 1024 * 1024, // 50 MB
  MAX_FILES_PER_REQUEST: 5,
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  ALLOWED_UPLOAD_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],

  // ── Kafka Topics ─────────────────────────────────────────
  TOPICS: {
    RENDERS:       'dos.renders',
    QA:            'dos.qa',
    NOTIFICATIONS: 'dos.notifications',
    DEAD_LETTER:   'dos.dlq',
  },

  // ── Cache TTLs (seconds) ──────────────────────────────────
  CACHE_TTL: {
    USER_PROFILE:  300,     // 5 min
    PROJECT_LIST:  60,      // 1 min
    RENDER_STATUS: 5,       // 5 sec (live status)
    STYLE_PRESETS: 3600,    // 1 hr
    METRICS:       30,      // 30 sec
  },

  // ── HTTP Status ───────────────────────────────────────────
  HTTP: {
    OK:          200,
    CREATED:     201,
    ACCEPTED:    202,
    NO_CONTENT:  204,
    BAD_REQUEST: 400,
    UNAUTH:      401,
    FORBIDDEN:   403,
    NOT_FOUND:   404,
    CONFLICT:    409,
    TOO_MANY:    429,
    SERVER_ERR:  500,
    BAD_GATEWAY: 502,
  },

  // ── User Roles ────────────────────────────────────────────
  ROLES: {
    ADMIN:   'admin',
    PRO:     'pro',
    STUDIO:  'studio',
    FREE:    'free',
  },

  // ── Encryption ────────────────────────────────────────────
  ENCRYPTION: {
    ALGORITHM:   'aes-256-gcm',
    IV_LENGTH:   16,
    TAG_LENGTH:  16,
    KEY_LENGTH:  32,
  },

});
