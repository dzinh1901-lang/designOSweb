'use strict';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ok(data) { return { success: true, data }; }
function fail(fieldErrors) { return { success: false, error: { flatten: () => ({ fieldErrors }) } }; }

function asStrictObject(input) {
  return input && typeof input === 'object' && !Array.isArray(input) ? input : null;
}

function createSchema(validateFn) {
  return { safeParse: validateFn };
}

const generationStatuses = new Set(['queued', 'ingesting', 'analyzing', 'concepting', 'generating', 'synthesizing', 'expanding', 'post_production', 'qa_review', 'hitl_review', 'complete', 'failed', 'cancelled']);

const generateRequestSchema = createSchema((input) => {
  const body = asStrictObject(input);
  if (!body) return fail({ body: ['Expected JSON object'] });
  const allowed = new Set(['prompt', 'stylePreset', 'profession', 'mood', 'accessory', 'transparentBg', 'variations', 'sourcePhoto', 'identityPreservation', 'projectId', 'mode']);
  const unknown = Object.keys(body).filter((k) => !allowed.has(k));
  if (unknown.length) return fail({ body: [`Unknown fields: ${unknown.join(', ')}`] });
  if (typeof body.prompt !== 'string' || !body.prompt.trim()) return fail({ prompt: ['prompt is required'] });
  for (const key of ['stylePreset', 'profession', 'mood', 'accessory']) {
    if (typeof body[key] !== 'string' || !body[key].trim()) return fail({ [key]: [`${key} is required`] });
  }
  if (body.projectId && !UUID_RE.test(body.projectId)) return fail({ projectId: ['projectId must be UUID'] });
  const mode = body.mode || 'draft';
  if (!['draft', 'cinema', 'exploration'].includes(mode)) return fail({ mode: ['invalid mode'] });
  const variations = body.variations ?? 1;
  if (!Number.isInteger(variations) || variations < 1 || variations > 8) return fail({ variations: ['variations must be 1..8'] });
  return ok({ ...body, mode, variations, transparentBg: Boolean(body.transparentBg) });
});

const generateResponseSchema = createSchema((input) => ok(input));
const uploadPhotoRequestSchema = createSchema((input) => ok({ source: input?.source || 'gallery', mimeType: input?.mimeType }));
const uploadPhotoResponseSchema = createSchema((input) => ok(input));
const galleryQuerySchema = createSchema((input) => {
  const page = Number(input?.page || 1);
  const limit = Number(input?.limit || 24);
  if (!Number.isInteger(page) || page < 1) return fail({ page: ['page must be positive integer'] });
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return fail({ limit: ['limit must be 1..100'] });
  return ok({ page, limit });
});
const galleryResponseSchema = createSchema((input) => ok(input));

const saveCharacterRequestSchema = createSchema((input) => {
  const body = asStrictObject(input);
  if (!body || typeof body.name !== 'string' || !body.name.trim()) return fail({ name: ['name is required'] });
  if (!body.profile || typeof body.profile !== 'object') return fail({ profile: ['profile is required'] });
  return ok(body);
});

const saveCharacterResponseSchema = createSchema((input) => ok(input));

const meResponseSchema = createSchema((input) => {
  const email = input?.user?.email;
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) return fail({ user: ['user.email is invalid'] });
  return ok(input);
});

const stripeWebhookRequestSchema = createSchema((input) => {
  if (!input || typeof input.id !== 'string' || typeof input.type !== 'string') return fail({ body: ['id and type required'] });
  return ok(input);
});
const stripeWebhookResponseSchema = createSchema((input) => ok(input));

module.exports = {
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
  generationStatusSchema: { safeParse: (input) => generationStatuses.has(input) ? ok(input) : fail({ status: ['invalid status'] }) },
};
