'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · JWT Auth Middleware
// Validates Bearer tokens, attaches req.user
// Checks token blacklist (revoked tokens) via Redis
// ══════════════════════════════════════════════════════════

const jwt    = require('jsonwebtoken');
const logger = require('../utils/logger');
const { ROLES, HTTP } = require('../../config/constants');

// Redis client is injected from gateway to avoid circular deps
let redisClient = null;
function setRedisClient(client) { redisClient = client; }

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(HTTP.UNAUTH).json({
        error: 'Missing or malformed Authorization header',
        requestId: req.requestId,
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify signature + expiry
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms:  ['HS256'],
        issuer:      'designos-api',
        audience:    'designos-client',
      });
    } catch (err) {
      const msg = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
      return res.status(HTTP.UNAUTH).json({ error: msg, requestId: req.requestId });
    }

    // Check blacklist (revoked / logged-out tokens)
    if (redisClient) {
      const blacklisted = await redisClient.get(`${process.env.REDIS_PREFIX || 'dos:'}blacklist:${decoded.jti}`);
      if (blacklisted) {
        logger.warn('Blacklisted token used', { jti: decoded.jti, userId: decoded.sub, requestId: req.requestId });
        return res.status(HTTP.UNAUTH).json({ error: 'Token revoked', requestId: req.requestId });
      }
    }

    req.user = {
      id:       decoded.sub,
      email:    decoded.email,
      role:     decoded.role || ROLES.FREE,
      jti:      decoded.jti,
      credits:  decoded.credits,
      orgId:    decoded.orgId,
    };

    next();
  } catch (err) {
    logger.error('Auth middleware error', { error: err.message, requestId: req.requestId });
    res.status(HTTP.SERVER_ERR).json({ error: 'Authentication error', requestId: req.requestId });
  }
}

// Role-based access control factory
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(HTTP.UNAUTH).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) {
      logger.warn('RBAC denied', { userId: req.user.id, role: req.user.role, required: roles, path: req.path });
      return res.status(HTTP.FORBIDDEN).json({ error: `Required role: ${roles.join(' or ')}` });
    }
    next();
  };
}

// Credit check middleware factory
function requireCredits(cost) {
  return (req, res, next) => {
    if (!req.user) return res.status(HTTP.UNAUTH).json({ error: 'Not authenticated' });
    if ((req.user.credits || 0) < cost) {
      return res.status(HTTP.FORBIDDEN).json({
        error:    'Insufficient credits',
        required: cost,
        balance:  req.user.credits || 0,
        requestId: req.requestId,
      });
    }
    next();
  };
}

// Optional auth (doesn't fail if no token)
async function optionalAuth(req, res, next) {
  if (!req.headers.authorization) return next();
  return authenticate(req, res, next);
}

module.exports = { authenticate, requireRole, requireCredits, optionalAuth, setRedisClient };
