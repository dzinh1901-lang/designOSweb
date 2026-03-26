'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · Express API Gateway  v1.1.0
//
// Boot sequence:
//  1. Load env + validate required vars
//  2. Initialise Redis (cache + blacklist)
//  3. Initialise Kafka producer
//  4. Initialise Auth + Projects services (inject deps)
//  5. Mount global middleware (Helmet, CORS, rate limiting…)
//  6. Mount route groups
//  7. Mount error handler
//  8. Start HTTP server
// ══════════════════════════════════════════════════════════

require('dotenv').config();

const express        = require('express');
const compression    = require('compression');
const cookieParser   = require('cookie-parser');
const swaggerUi      = require('swagger-ui-express');
const YAML           = require('yamljs');
const http           = require('http');
const path           = require('path');
const { createClient }  = require('redis');
const promClient     = require('prom-client');

const logger         = require('../shared/utils/logger');
const {
  helmetMiddleware, corsOptions, globalLimiter,
  requestId, apiHeaders, requestLogger,
  hpp, mongoSanitize,
} = require('../shared/middleware/security');
const { setRedisClient } = require('../shared/middleware/auth.middleware');

// Services
const authService    = require('../services/auth/auth.service');
const projectService = require('../services/projects/projects.service');
const queueService   = require('../services/queue/queue.service');
const storageService = require('../services/storage/storage.service');

// Routes
const authRoutes     = require('./routes/auth.routes');
const projectRoutes  = require('./routes/projects.routes');
const generateRoutes = require('./routes/generate.routes');
const adminRoutes    = require('./routes/admin.routes');
const uploadRoutes   = require('./routes/upload.routes');

const { API_PREFIX, HEALTH_PATH } = require('../config/constants');

// ── Validate required environment variables ───────────────
const REQUIRED_ENV = [
  'JWT_SECRET', 'ENCRYPTION_KEY', 'HMAC_SECRET',
];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  logger.error('Missing required env vars', { missing });
  process.exit(1);
}

// ── Prometheus metrics ────────────────────────────────────
promClient.collectDefaultMetrics({ prefix: 'designos_' });

const httpDuration = new promClient.Histogram({
  name:    'designos_http_duration_seconds',
  help:    'HTTP request duration',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
});

const activeJobs = new promClient.Gauge({
  name: 'designos_active_render_jobs',
  help: 'Currently processing render jobs',
});

// ── Redis client factory ──────────────────────────────────
async function initRedis() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  const client = createClient({
    url,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) return new Error('Redis: max reconnect attempts');
        return Math.min(retries * 100, 3000);
      },
    },
  });

  client.on('error',        (err) => logger.error('Redis error',       { error: err.message }));
  client.on('connect',      ()    => logger.info ('Redis connected'));
  client.on('reconnecting', ()    => logger.warn ('Redis reconnecting'));

  try {
    await client.connect();
    return client;
  } catch (err) {
    logger.warn('Redis unavailable — continuing without cache', { error: err.message });
    return null;
  }
}

// ── Graceful shutdown ─────────────────────────────────────
function setupGracefulShutdown(server, redis) {
  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal} — graceful shutdown started`);

    // Stop accepting new connections
    server.close(async () => {
      logger.info('HTTP server closed');
      try {
        await queueService.disconnect();
        if (redis) await redis.quit();
        logger.info('Shutdown complete');
        process.exit(0);
      } catch (err) {
        logger.error('Shutdown error', { error: err.message });
        process.exit(1);
      }
    });

    // Force exit after 30s
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30_000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('uncaughtException',  (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    shutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason: String(reason) });
  });
}

// ── Build Express app ─────────────────────────────────────
function buildApp(redis) {
  const app = express();

  // ── Trust proxy (Kubernetes ingress / ALB) ────────────
  app.set('trust proxy', 1);

  // ── Security middleware ───────────────────────────────
  app.use(requestId);
  app.use(helmetMiddleware);
  app.use(require('cors')(corsOptions));
  app.use(globalLimiter);
  app.use(hpp);
  app.use(mongoSanitize);
  app.use(apiHeaders);
  app.use(requestLogger);

  // ── Compression + parsing ─────────────────────────────
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // ── Metrics timing ────────────────────────────────────
  app.use((req, res, next) => {
    const end = httpDuration.startTimer({ method: req.method, route: req.path });
    res.on('finish', () => end({ status: res.statusCode }));
    next();
  });

  // ── Health check (no auth, no rate limiting) ──────────
  app.get(HEALTH_PATH, async (req, res) => {
    const [kafkaHealth, redisOk] = await Promise.allSettled([
      queueService.healthCheck(),
      redis ? redis.ping() : Promise.resolve('SKIPPED'),
    ]);

    const healthy = kafkaHealth.status === 'fulfilled' &&
                    (redisOk.status === 'fulfilled');

    res.status(healthy ? 200 : 503).json({
      status:    healthy ? 'ok' : 'degraded',
      version:   '1.1.0',
      timestamp: new Date().toISOString(),
      services: {
        kafka:  kafkaHealth.status === 'fulfilled' ? kafkaHealth.value : { error: kafkaHealth.reason?.message },
        redis:  redisOk.status === 'fulfilled' ? 'ok' : 'unavailable',
      },
    });
  });

  // ── Prometheus metrics endpoint ───────────────────────
  app.get('/metrics', async (req, res) => {
    // Internal-only: check internal secret if set
    const secret = process.env.METRICS_SECRET;
    if (secret && req.headers['x-metrics-secret'] !== secret) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.set('Content-Type', promClient.register.contentType);
    res.end(await promClient.register.metrics());
  });

  // ── Swagger UI ────────────────────────────────────────
  try {
    const swaggerDoc = YAML.load(path.join(__dirname, '../docs/openapi.yaml'));
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc, {
      customCssUrl: 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.0.0/swagger-ui.min.css',
    }));
  } catch {
    logger.warn('OpenAPI spec not found — /docs disabled');
  }

  // ── API Routes ────────────────────────────────────────
  app.use(`${API_PREFIX}/auth`,     authRoutes);
  app.use(`${API_PREFIX}/projects`, projectRoutes);
  app.use(`${API_PREFIX}/generate`, generateRoutes);
  app.use(`${API_PREFIX}/upload`,   uploadRoutes);
  app.use(`${API_PREFIX}/admin`,    adminRoutes);

  // ── 404 handler ───────────────────────────────────────
  app.use((req, res) => {
    res.status(404).json({
      error:     'Endpoint not found',
      path:      req.path,
      requestId: req.requestId,
    });
  });

  // ── Global error handler ──────────────────────────────
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    const isProd = process.env.NODE_ENV === 'production';

    // CORS errors
    if (err.message?.includes('CORS')) {
      return res.status(403).json({ error: err.message, requestId: req.requestId });
    }

    // Validation errors
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid JSON body', requestId: req.requestId });
    }

    logger.error('Unhandled error', {
      error:     err.message,
      stack:     isProd ? undefined : err.stack,
      path:      req.path,
      requestId: req.requestId,
      status,
    });

    res.status(status).json({
      error:     isProd && status >= 500 ? 'Internal server error' : err.message,
      code:      err.code || null,
      requestId: req.requestId,
    });
  });

  return app;
}

// ── Bootstrap ─────────────────────────────────────────────
async function bootstrap() {
  logger.info('DesignOS Gateway starting', { version: '1.1.0', env: process.env.NODE_ENV });

  // 1. Redis
  const redis = await initRedis();

  // 2. Kafka (non-blocking — fallback queue if unavailable)
  try {
    await queueService.init();
  } catch (err) {
    logger.warn('Kafka init failed — using in-memory fallback', { error: err.message });
  }

  // 3. Inject dependencies
  authService.init(redis, null);         // Firestore injected later if configured
  projectService.init(null, redis);
  storageService.init();
  setRedisClient(redis);

  // 4. Configure Firestore if credentials provided
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIRESTORE_PROJECT_ID) {
    try {
      const { Firestore } = require('@google-cloud/firestore');
      const db = new Firestore({ projectId: process.env.FIRESTORE_PROJECT_ID });
      authService.init(redis, db);
      projectService.init(db, redis);
      logger.info('Firestore connected', { project: process.env.FIRESTORE_PROJECT_ID });
    } catch (err) {
      logger.warn('Firestore init failed', { error: err.message });
    }
  }

  // 5. Build app
  const app    = buildApp(redis);
  const PORT   = parseInt(process.env.PORT) || 4000;
  const server = http.createServer(app);

  // 6. WebSocket server for real-time job status (simple polling upgrade)
  setupWebSocketServer(server, redis);

  // 7. Graceful shutdown
  setupGracefulShutdown(server, redis);

  // 8. Listen
  server.listen(PORT, '0.0.0.0', () => {
    logger.info(`Gateway listening on port ${PORT}`, {
      url: `http://0.0.0.0:${PORT}`,
      health: `http://0.0.0.0:${PORT}/health`,
      docs:   `http://0.0.0.0:${PORT}/docs`,
    });
  });
}

// ── WebSocket (Server-Sent Events fallback) ───────────────
function setupWebSocketServer(server, redis) {
  const sseClients = new Map(); // userId → res[]

  server.on('upgrade', (req, socket, head) => {
    // Could be upgraded to ws library — using SSE via /sse route instead
    socket.destroy();
  });

  // Expose SSE push helper for other services
  global.sseClients = sseClients;
  global.pushJobUpdate = (userId, data) => {
    const clients = sseClients.get(userId) || [];
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    clients.forEach(res => {
      try { res.write(payload); } catch { /* client disconnected */ }
    });
  };
}

bootstrap().catch(err => {
  logger.error('Fatal bootstrap error', { error: err.message, stack: err.stack });
  process.exit(1);
});

module.exports = { buildApp }; // For testing
