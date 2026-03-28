'use strict';

const router = require('express').Router();
const multer = require('multer');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

const projectService = require('../../services/projects/projects.service');
const storageService = require('../../services/storage/storage.service');
const authService = require('../../services/auth/auth.service');
const { authenticate } = require('../../shared/middleware/auth.middleware');
const { HTTP } = require('../../config/constants');
const {
  generateRequestSchema,
  generateResponseSchema,
  uploadPhotoRequestSchema,
  uploadPhotoResponseSchema,
  galleryQuerySchema,
  galleryResponseSchema,
  saveCharacterRequestSchema,
  saveCharacterResponseSchema,
  meResponseSchema,
  stripeWebhookRequestSchema,
  stripeWebhookResponseSchema,
} = require('../../lib/validation/chibi.contracts');

const uploadPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
});

function parse(schema, data, res, requestId) {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    res.status(HTTP.BAD_REQUEST).json({
      error: 'Validation failed',
      details: parsed.error.flatten(),
      requestId,
    });
    return null;
  }
  return parsed.data;
}

router.post('/generate', authenticate, async (req, res, next) => {
  try {
    const payload = parse(generateRequestSchema, req.body, res, req.requestId);
    if (!payload) return;

    const count = payload.variations || 1;
    const jobs = [];

    let projectId = payload.projectId;
    if (!projectId) {
      const project = await projectService.createProject({
        userId: req.user.id,
        name: `${payload.stylePreset} ${payload.profession}`.slice(0, 120),
        industry: 'character',
        description: `Auto-created for /api/generate (${payload.mood})`,
      });
      projectId = project.id;
    }

    for (let i = 0; i < count; i += 1) {
      const created = await projectService.createGenerationJob({
        projectId,
        userId: req.user.id,
        userRole: req.user.role,
        userCredits: req.user.credits,
        prompt: payload.prompt,
        mode: payload.mode,
        stylePresets: [payload.stylePreset, payload.profession, payload.mood, payload.accessory],
        aspectRatio: payload.transparentBg ? '1:1' : '16:9',
        durationSeconds: 10,
        referenceImageIds: payload.sourcePhoto?.fileId ? [payload.sourcePhoto.fileId] : [],
        styleDirection: payload.identityPreservation?.enabled
          ? `identity-preservation:${payload.identityPreservation.strength ?? 0.5}`
          : undefined,
      });

      jobs.push({
        jobId: created.id,
        projectId: created.projectId,
        status: created.status,
        statusContract: {
          poll: {
            href: `/api/projects/${created.projectId}/jobs/${created.id}`,
            intervalMs: 3000,
          },
          stream: {
            href: `/api/projects/${created.projectId}/jobs/${created.id}/stream`,
            protocol: 'sse',
          },
          results: {
            href: `/results/${created.id}`,
          },
        },
      });
    }

    const responsePayload = {
      jobIds: jobs.map((job) => job.jobId),
      jobs,
      requestId: req.requestId,
    };

    const response = parse(generateResponseSchema, responsePayload, res, req.requestId);
    if (!response) return;

    res.status(HTTP.ACCEPTED).json(response);
  } catch (err) {
    next(err);
  }
});

router.post('/upload-photo', authenticate, uploadPhoto.single('photo'), async (req, res, next) => {
  try {
    const payload = parse(uploadPhotoRequestSchema, req.body || {}, res, req.requestId);
    if (!payload) return;

    if (!req.file) {
      return res.status(HTTP.BAD_REQUEST).json({ error: 'photo file is required', requestId: req.requestId });
    }

    const optimised = await sharp(req.file.buffer)
      .withMetadata({ exif: {} })
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90, progressive: true })
      .toBuffer();

    const fileId = uuidv4();
    const s3Key = `reference-images/${req.user.id}/${fileId}.jpg`;
    const url = await storageService.uploadBuffer(optimised, s3Key, 'image/jpeg', {
      userId: req.user.id,
      fileId,
      source: payload.source,
    });

    const responsePayload = { fileId, url, mimeType: 'image/jpeg', size: optimised.length, requestId: req.requestId };
    const response = parse(uploadPhotoResponseSchema, responsePayload, res, req.requestId);
    if (!response) return;

    res.status(HTTP.CREATED).json(response);
  } catch (err) {
    next(err);
  }
});

router.get('/gallery', authenticate, async (req, res, next) => {
  try {
    const query = parse(galleryQuerySchema, req.query, res, req.requestId);
    if (!query) return;

    const result = await projectService.listUserGallery({
      userId: req.user.id,
      page: query.page,
      limit: query.limit,
    });

    const responsePayload = { ...result, requestId: req.requestId };
    const response = parse(galleryResponseSchema, responsePayload, res, req.requestId);
    if (!response) return;

    res.status(HTTP.OK).json(response);
  } catch (err) {
    next(err);
  }
});

router.post('/save-character', authenticate, async (req, res, next) => {
  try {
    const payload = parse(saveCharacterRequestSchema, req.body, res, req.requestId);
    if (!payload) return;

    const characterId = await projectService.saveCharacter({
      userId: req.user.id,
      name: payload.name,
      avatarUrl: payload.avatarUrl,
      baseJobId: payload.baseJobId,
      profile: payload.profile,
    });

    const responsePayload = { characterId, requestId: req.requestId };
    const response = parse(saveCharacterResponseSchema, responsePayload, res, req.requestId);
    if (!response) return;

    res.status(HTTP.CREATED).json(response);
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await authService.getProfile(req.user.id);
    const responsePayload = { user, requestId: req.requestId };
    const response = parse(meResponseSchema, responsePayload, res, req.requestId);
    if (!response) return;

    res.status(HTTP.OK).json(response);
  } catch (err) {
    next(err);
  }
});

router.post('/stripe/webhook', async (req, res, next) => {
  try {
    const event = parse(stripeWebhookRequestSchema, req.body, res, req.requestId);
    if (!event) return;

    const responsePayload = { received: true, eventId: event.id, eventType: event.type };
    const response = parse(stripeWebhookResponseSchema, responsePayload, res, req.requestId);
    if (!response) return;

    res.status(HTTP.OK).json(response);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
