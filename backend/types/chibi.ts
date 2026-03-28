export type GenerationStatus =
  | 'queued'
  | 'ingesting'
  | 'analyzing'
  | 'concepting'
  | 'generating'
  | 'synthesizing'
  | 'expanding'
  | 'post_production'
  | 'qa_review'
  | 'hitl_review'
  | 'complete'
  | 'failed'
  | 'cancelled';

export interface SourcePhotoInput {
  fileId?: string;
  url?: string;
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface IdentityPreservationInput {
  enabled?: boolean;
  strength?: number;
  lockFace?: boolean;
}

export interface GenerateRequest {
  prompt: string;
  stylePreset: string;
  profession: string;
  mood: string;
  accessory: string;
  transparentBg: boolean;
  variations: number;
  sourcePhoto?: SourcePhotoInput;
  identityPreservation?: IdentityPreservationInput;
  projectId?: string;
  mode?: 'draft' | 'cinema' | 'exploration';
}

export interface JobStatusContract {
  poll: { href: string; intervalMs: number };
  stream: { href: string; protocol: 'sse' };
  results: { href: string };
}

export interface GenerateJobResponse {
  jobId: string;
  projectId: string;
  status: GenerationStatus;
  statusContract: JobStatusContract;
}

export interface GenerateResponse {
  jobIds: string[];
  jobs: GenerateJobResponse[];
  requestId?: string;
}

export interface UploadPhotoResponse {
  fileId: string;
  url: string;
  mimeType: 'image/jpeg';
  size: number;
  requestId?: string;
}

export interface GalleryItem {
  jobId: string;
  projectId: string;
  status: GenerationStatus;
  coverUrl: string | null;
  createdAt: string;
}

export interface GalleryResponse {
  items: GalleryItem[];
  page: number;
  limit: number;
  total: number;
  requestId?: string;
}

export interface SaveCharacterRequest {
  name: string;
  avatarUrl?: string;
  baseJobId?: string;
  profile: {
    stylePreset: string;
    profession: string;
    mood: string;
    accessory: string;
    transparentBg: boolean;
  };
}

export interface SaveCharacterResponse {
  characterId: string;
  requestId?: string;
}

export interface StripeWebhookResponse {
  received: boolean;
  eventId: string;
  eventType: string;
}
