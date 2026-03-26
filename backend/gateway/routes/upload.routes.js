'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · Upload Routes
// POST /api/v1/upload/reference   – Upload reference images
// GET  /api/v1/upload/:fileId     – Get signed URL for file
// DELETE /api/v1/upload/:fileId   – Delete uploaded file
// ══════════════════════════════════════════════════════════

const router         = require('express').Router();
const multer         = require('multer');
const sharp          = require('sharp');
const path           = require('path');
const { v4: uuidv4 } = require('uuid');
const { authenticate }  = require('../../shared/middleware/auth.middleware');
const storageService    = require('../../services/storage/storage.service');
const logger            = require('../../shared/utils/logger');
const { HTTP, MAX_FILE_SIZE_BYTES, ALLOWED_IMAGE_TYPES } = require('../../config/constants');
const { param } = require('express-validator');
const { validate } = require('../../shared/validators/schemas');

// ── Multer config (memory storage — we stream to S3) ──────
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  {
    fileSize: MAX_FILE_SIZE_BYTES,
    files:    5,
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', `Invalid type: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

router.use(authenticate);

// ── POST /upload/reference ────────────────────────────────
router.post(
  '/reference',
  upload.array('images', 5),
  async (req, res, next) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(HTTP.BAD_REQUEST).json({
          error: 'At least one image file required', requestId: req.requestId,
        });
      }

      const results = await Promise.all(
        req.files.map(async (file) => {
          // Optimise image via sharp (strip EXIF, normalise)
          const optimised = await sharp(file.buffer)
            .withMetadata({ exif: {} }) // Strip personal EXIF
            .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 90, progressive: true })
            .toBuffer();

          const fileId  = uuidv4();
          const s3Key   = `reference-images/${req.user.id}/${fileId}.jpg`;

          const url = await storageService.uploadBuffer(optimised, s3Key, 'image/jpeg', {
            userId:   req.user.id,
            fileId,
            originalName: file.originalname.slice(0, 200),
          });

          return {
            fileId,
            url,
            originalName: file.originalname,
            size:         optimised.length,
            mimeType:     'image/jpeg',
          };
        })
      );

      logger.info('Files uploaded', { userId: req.user.id, count: results.length });
      res.status(HTTP.CREATED).json({ files: results, requestId: req.requestId });
    } catch (err) {
      if (err instanceof multer.MulterError) {
        return res.status(HTTP.BAD_REQUEST).json({
          error:     err.message,
          code:      err.code,
          requestId: req.requestId,
        });
      }
      next(err);
    }
  }
);

// ── GET /upload/:fileId ───────────────────────────────────
router.get(
  '/:fileId',
  [param('fileId').isUUID(), validate],
  async (req, res, next) => {
    try {
      const { fileId } = req.params;
      const s3Key  = `reference-images/${req.user.id}/${fileId}.jpg`;
      const signedUrl = await storageService.getSignedUrl(s3Key, 3600); // 1hr expiry
      res.status(HTTP.OK).json({ fileId, url: signedUrl, expiresIn: 3600, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

// ── DELETE /upload/:fileId ────────────────────────────────
router.delete(
  '/:fileId',
  [param('fileId').isUUID(), validate],
  async (req, res, next) => {
    try {
      const { fileId } = req.params;
      const s3Key  = `reference-images/${req.user.id}/${fileId}.jpg`;
      await storageService.deleteObject(s3Key);
      res.status(HTTP.NO_CONTENT).end();
    } catch (err) { next(err); }
  }
);

module.exports = router;
