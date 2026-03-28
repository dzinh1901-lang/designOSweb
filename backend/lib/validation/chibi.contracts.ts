import { z } from 'zod';

export const generationStatusSchema = z.enum([
  'queued',
  'ingesting',
  'analyzing',
  'concepting',
  'generating',
  'synthesizing',
  'expanding',
  'post_production',
  'qa_review',
  'hitl_review',
  'complete',
  'failed',
  'cancelled',
]);

export const sourcePhotoSchema = z.object({
  fileId: z.string().uuid().optional(),
  url: z.string().url().optional(),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']).optional(),
}).strict().refine((value) => value.fileId || value.url, { message: 'sourcePhoto requires fileId or url' });

export const identityPreservationSchema = z.object({
  enabled: z.boolean().default(false),
  strength: z.number().min(0).max(1).default(0.5),
  lockFace: z.boolean().default(true),
}).strict();

export const generateRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(1500),
  stylePreset: z.string().trim().min(1).max(120),
  profession: z.string().trim().min(1).max(120),
  mood: z.string().trim().min(1).max(120),
  accessory: z.string().trim().min(1).max(120),
  transparentBg: z.boolean().default(false),
  variations: z.number().int().min(1).max(8).default(1),
  sourcePhoto: sourcePhotoSchema.optional(),
  identityPreservation: identityPreservationSchema.optional(),
  projectId: z.string().uuid().optional(),
  mode: z.enum(['draft', 'cinema', 'exploration']).default('draft'),
}).strict();

export const generateResponseSchema = z.object({
  jobIds: z.array(z.string().uuid()).min(1),
  jobs: z.array(z.object({
    jobId: z.string().uuid(),
    projectId: z.string().uuid(),
    status: generationStatusSchema,
    statusContract: z.object({
      poll: z.object({ href: z.string(), intervalMs: z.number().int().positive() }).strict(),
      stream: z.object({ href: z.string(), protocol: z.literal('sse') }).strict(),
      results: z.object({ href: z.string() }).strict(),
    }).strict(),
  }).strict()).min(1),
  requestId: z.string().optional(),
}).strict();
