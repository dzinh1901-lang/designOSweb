'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · Structured Logger (Winston)
// JSON output in production, pretty-print in dev
// Includes request-id correlation + sensitive field redaction
// ══════════════════════════════════════════════════════════

require('dotenv').config();
const { createLogger, format, transports } = require('winston');
require('winston-daily-rotate-file');

const { combine, timestamp, json, colorize, printf, errors, splat } = format;

const SENSITIVE_FIELDS = ['password', 'token', 'secret', 'authorization',
  'credit_card', 'apiKey', 'privateKey', 'refreshToken'];

// Redact sensitive fields from log metadata
const redactSensitive = format((info) => {
  function redact(obj, depth = 0) {
    if (depth > 6 || !obj || typeof obj !== 'object') return obj;
    const out = Array.isArray(obj) ? [...obj] : { ...obj };
    for (const key of Object.keys(out)) {
      if (SENSITIVE_FIELDS.some(f => key.toLowerCase().includes(f.toLowerCase()))) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = redact(out[key], depth + 1);
      }
    }
    return out;
  }
  return redact(info);
});

const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, requestId, ...meta }) => {
    const rid = requestId ? ` [${requestId}]` : '';
    const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    return `${timestamp}${rid} ${level}: ${message}${extra}`;
  })
);

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  splat(),
  redactSensitive(),
  json()
);

const isDev = process.env.NODE_ENV !== 'production';

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: isDev ? devFormat : prodFormat,
  defaultMeta: {
    service:     'designos-gateway',
    environment: process.env.NODE_ENV || 'development',
    version:     '1.1.0',
  },
  transports: [
    new transports.Console(),
    ...(isDev ? [] : [
      new transports.DailyRotateFile({
        filename:    'logs/error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        level:       'error',
        maxSize:     '20m',
        maxFiles:    '14d',
        zippedArchive: true,
      }),
      new transports.DailyRotateFile({
        filename:    'logs/combined-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxSize:     '50m',
        maxFiles:    '30d',
        zippedArchive: true,
      }),
    ]),
  ],
  exceptionHandlers: [new transports.Console()],
  rejectionHandlers: [new transports.Console()],
});

// Child logger with request context
logger.child = (meta) => logger.child(meta);

module.exports = logger;
