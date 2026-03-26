'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · Auth Routes
// POST /api/v1/auth/register
// POST /api/v1/auth/login
// POST /api/v1/auth/refresh
// POST /api/v1/auth/logout
// GET  /api/v1/auth/me
// POST /api/v1/auth/password/change
// POST /api/v1/auth/password/reset-request
// ══════════════════════════════════════════════════════════

const router       = require('express').Router();
const authService  = require('../../services/auth/auth.service');
const { authenticate } = require('../../shared/middleware/auth.middleware');
const { authLimiter }  = require('../../shared/middleware/security');
const {
  registerSchema, loginSchema, refreshSchema, validate,
} = require('../../shared/validators/schemas');
const { body, param } = require('express-validator');
const logger       = require('../../shared/utils/logger');
const { HTTP }     = require('../../config/constants');

// ── POST /register ────────────────────────────────────────
router.post(
  '/register',
  authLimiter,
  registerSchema,
  async (req, res, next) => {
    try {
      const { email, password, name, organization } = req.body;
      const result = await authService.register({ email, password, name, organization });

      logger.info('Register success', { email, requestId: req.requestId });

      // Set refresh token as httpOnly cookie
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure:   process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
        path:     '/api/v1/auth',
      });

      res.status(HTTP.CREATED).json({
        accessToken: result.accessToken,
        expiresAt:   result.expiresAt,
        requestId:   req.requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /login ───────────────────────────────────────────
router.post(
  '/login',
  authLimiter,
  loginSchema,
  async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const ip        = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
      const userAgent = req.headers['user-agent'];

      const result = await authService.login({ email, password, ip, userAgent });

      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure:   process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge:   7 * 24 * 60 * 60 * 1000,
        path:     '/api/v1/auth',
      });

      res.status(HTTP.OK).json({
        accessToken: result.accessToken,
        expiresAt:   result.expiresAt,
        user:        result.user,
        requestId:   req.requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /refresh ─────────────────────────────────────────
router.post(
  '/refresh',
  authLimiter,
  refreshSchema,
  async (req, res, next) => {
    try {
      // Accept from body or httpOnly cookie
      const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;
      if (!refreshToken) {
        return res.status(HTTP.UNAUTH).json({ error: 'Refresh token required', requestId: req.requestId });
      }

      const result = await authService.refreshTokens({ refreshToken });

      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure:   process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge:   7 * 24 * 60 * 60 * 1000,
        path:     '/api/v1/auth',
      });

      res.status(HTTP.OK).json({
        accessToken: result.accessToken,
        expiresAt:   result.expiresAt,
        requestId:   req.requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /logout ──────────────────────────────────────────
router.post(
  '/logout',
  authenticate,
  async (req, res, next) => {
    try {
      const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;
      await authService.logout({ jti: req.user.jti, refreshToken });

      res.clearCookie('refreshToken', { path: '/api/v1/auth' });
      res.status(HTTP.NO_CONTENT).end();
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /me ───────────────────────────────────────────────
router.get(
  '/me',
  authenticate,
  async (req, res, next) => {
    try {
      const profile = await authService.getProfile(req.user.id);
      res.status(HTTP.OK).json({ user: profile, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /password/change ─────────────────────────────────
router.post(
  '/password/change',
  authenticate,
  authLimiter,
  [
    body('currentPassword').notEmpty().withMessage('Current password required'),
    body('newPassword')
      .isLength({ min: 12, max: 128 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
      .withMessage('New password must meet complexity requirements'),
    validate,
  ],
  async (req, res, next) => {
    try {
      await authService.changePassword({
        userId:          req.user.id,
        currentPassword: req.body.currentPassword,
        newPassword:     req.body.newPassword,
      });
      res.status(HTTP.OK).json({ message: 'Password updated', requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /password/reset-request ─────────────────────────
router.post(
  '/password/reset-request',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    validate,
  ],
  async (req, res, next) => {
    try {
      await authService.requestPasswordReset({ email: req.body.email });
      // Always return 200 to prevent user enumeration
      res.status(HTTP.OK).json({
        message:   'If that email is registered, a reset link has been sent.',
        requestId: req.requestId,
      });
    } catch (err) {
      // Swallow internal errors — still return 200
      logger.warn('Password reset error', { error: err.message });
      res.status(HTTP.OK).json({ message: 'If that email is registered, a reset link has been sent.' });
    }
  }
);

module.exports = router;
