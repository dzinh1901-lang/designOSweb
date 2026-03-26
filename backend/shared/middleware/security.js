'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · Security Middleware Stack
//
// Layers applied (in order):
//  1. Helmet        — HTTP security headers
//  2. CORS          — Origin whitelisting
//  3. Rate limiting — Per-route + global
//  4. XSS clean     — Strip XSS from body/query
//  5. HPP           — HTTP Parameter Pollution prevention
//  6. Mongo sanitize — NoSQL injection prevention
//  7. Request ID    — Correlation header injection
//  8. Body limits   — Prevent large-payload DoS
// ══════════════════════════════════════════════════════════

require('dotenv').config();
const helmet       = require('helmet');
const cors         = require('cors');
const rateLimit    = require('express-rate-limit');
const hpp          = require('hpp');
const mongoSanitize = require('express-mongo-sanitize');
const { v4: uuidv4 } = require('uuid');
const logger       = require('../utils/logger');

// ── 1. Helmet — hardened HTTP headers ────────────────────
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", "'strict-dynamic'"],
      styleSrc:       ["'self'", 'https:', "'unsafe-inline'"],
      imgSrc:         ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc:     ["'self'", 'https://api.klingai.com', 'https://api.genspark.ai'],
      fontSrc:        ["'self'", 'https:', 'data:'],
      objectSrc:      ["'none'"],
      mediaSrc:       ["'self'", 'https:', 'blob:'],
      frameSrc:       ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow CDN resources
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
});

// ── 2. CORS — origin whitelist ────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',').map(o => o.trim());

const corsOptions = {
  origin: (origin, cb) => {
    // Allow server-to-server (no origin) and whitelisted origins
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    logger.warn('CORS blocked', { origin });
    cb(new Error(`CORS policy: origin '${origin}' not allowed`));
  },
  methods:           ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders:    ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Api-Key'],
  exposedHeaders:    ['X-Request-ID', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  credentials:       true,
  maxAge:            86400, // 24h preflight cache
};

// ── 3. Rate limiters ──────────────────────────────────────
const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;

const rateLimitHandler = (req, res) => {
  logger.warn('Rate limit hit', { ip: req.ip, path: req.path, requestId: req.requestId });
  res.status(429).json({
    error:   'Too many requests',
    retryAfter: Math.ceil(windowMs / 1000),
    requestId: req.requestId,
  });
};

// Global API limiter
const globalLimiter = rateLimit({
  windowMs,
  max:          parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler:      rateLimitHandler,
  keyGenerator: (req) => req.headers['x-forwarded-for']?.split(',')[0] || req.ip,
  skip: (req) => req.path === '/health', // never limit healthcheck
});

// Strict auth limiter (brute-force protection)
const authLimiter = rateLimit({
  windowMs,
  max:          parseInt(process.env.RATE_LIMIT_AUTH_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler:      rateLimitHandler,
  keyGenerator: (req) => req.headers['x-forwarded-for']?.split(',')[0] || req.ip,
});

// Generation limiter (GPU cost protection)
const generateLimiter = rateLimit({
  windowMs,
  max:          parseInt(process.env.RATE_LIMIT_GENERATE_MAX) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler:      rateLimitHandler,
});

// ── 4. Request ID injection ───────────────────────────────
function requestId(req, res, next) {
  const id = req.headers['x-request-id'] || uuidv4();
  req.requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
}

// ── 5. Security headers (no-cache for API responses) ──────
function apiHeaders(req, res, next) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}

// ── 6. Internal service auth (gateway ↔ orchestrator) ─────
function internalAuth(req, res, next) {
  const secret = req.headers['x-internal-secret'];
  if (!secret || secret !== process.env.ORCHESTRATOR_INTERNAL_SECRET) {
    return res.status(401).json({ error: 'Internal auth failed' });
  }
  next();
}

// ── 7. Request logging ────────────────────────────────────
function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level]('HTTP', {
      method:     req.method,
      path:       req.path,
      status:     res.statusCode,
      ms,
      ip:         req.headers['x-forwarded-for']?.split(',')[0] || req.ip,
      requestId:  req.requestId,
      userAgent:  req.headers['user-agent']?.slice(0, 100),
    });
  });
  next();
}

module.exports = {
  helmetMiddleware,
  corsOptions,
  globalLimiter,
  authLimiter,
  generateLimiter,
  requestId,
  apiHeaders,
  internalAuth,
  requestLogger,
  hpp: hpp(),
  mongoSanitize: mongoSanitize({ replaceWith: '_' }),
};
