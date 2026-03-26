'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · Input Validation Schemas (express-validator)
// Centralised — reused across routes
// ══════════════════════════════════════════════════════════

const { body, param, query, validationResult } = require('express-validator');
const { RENDER_MODES } = require('../../config/constants');

// ── Validation result handler ─────────────────────────────
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error:  'Validation failed',
      fields: errors.array().map(e => ({ field: e.path, message: e.msg })),
      requestId: req.requestId,
    });
  }
  next();
}

// ── Auth schemas ──────────────────────────────────────────
const registerSchema = [
  body('email')
    .isEmail().normalizeEmail().withMessage('Valid email required')
    .isLength({ max: 254 }),
  body('password')
    .isLength({ min: 12, max: 128 }).withMessage('Password must be 12–128 chars')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    .withMessage('Password needs upper, lower, number, and special char'),
  body('name')
    .trim().isLength({ min: 2, max: 80 }).escape().withMessage('Name 2–80 chars'),
  body('organization')
    .optional().trim().isLength({ max: 120 }).escape(),
  validate,
];

const loginSchema = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 1, max: 128 }),
  validate,
];

const refreshSchema = [
  body('refreshToken').notEmpty().isLength({ min: 10, max: 1000 }),
  validate,
];

// ── Generation schemas ────────────────────────────────────
const generateSchema = [
  body('prompt')
    .trim()
    .isLength({ min: 10, max: 2000 }).withMessage('Prompt 10–2000 chars')
    .escape(),
  body('mode')
    .isIn(Object.values(RENDER_MODES)).withMessage(`Mode must be: ${Object.values(RENDER_MODES).join(', ')}`),
  body('style_presets')
    .optional().isArray({ max: 5 }).withMessage('Max 5 style presets'),
  body('style_presets.*')
    .optional().isString().trim().isLength({ max: 50 }).escape(),
  body('aspect_ratio')
    .optional().isIn(['16:9', '9:16', '1:1', '4:3']),
  body('duration_seconds')
    .optional().isInt({ min: 3, max: 60 }).withMessage('Duration 3–60 seconds'),
  body('reference_image_ids')
    .optional().isArray({ max: 5 }),
  body('reference_image_ids.*')
    .optional().isUUID(),
  validate,
];

const variationsSchema = [
  param('projectId').isUUID().withMessage('Valid project ID required'),
  body('count').optional().isInt({ min: 1, max: 10 }).withMessage('1–10 variations'),
  body('style_direction').optional().trim().isLength({ max: 500 }).escape(),
  validate,
];

// ── Project schemas ───────────────────────────────────────
const projectSchema = [
  body('name').trim().isLength({ min: 1, max: 120 }).escape(),
  body('industry')
    .optional().isIn(['commercial_real_estate', 'maritime', 'luxury_branding', 'other']),
  body('description').optional().trim().isLength({ max: 1000 }).escape(),
  validate,
];

const projectIdSchema = [
  param('projectId').isUUID().withMessage('Valid project ID required'),
  validate,
];

// ── Pagination schema ─────────────────────────────────────
const paginationSchema = [
  query('page').optional().isInt({ min: 1, max: 1000 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('sort').optional().isIn(['createdAt', '-createdAt', 'updatedAt', 'name']),
  validate,
];

// ── HITL review schema ────────────────────────────────────
const hitlSchema = [
  param('jobId').isUUID(),
  body('action').isIn(['approve', 'regenerate', 'cancel']),
  body('adjustments').optional().isObject(),
  body('adjustments.camera').optional().trim().isLength({ max: 200 }).escape(),
  body('adjustments.lighting').optional().trim().isLength({ max: 200 }).escape(),
  body('adjustments.style').optional().trim().isLength({ max: 200 }).escape(),
  validate,
];

module.exports = {
  registerSchema, loginSchema, refreshSchema,
  generateSchema, variationsSchema,
  projectSchema, projectIdSchema,
  paginationSchema, hitlSchema,
  validate,
};
