'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · Storage Service
// AWS S3 + CloudFront CDN wrapper
//
// Features:
//  - Multipart upload for large files
//  - Pre-signed URLs (get/put) with TTL
//  - CloudFront signed URL generation
//  - Server-side encryption (SSE-S3 / SSE-KMS)
//  - Object metadata tagging for cost attribution
//  - Lifecycle transitions to Glacier after 90 days
//  - Local disk fallback when S3 is unavailable
// ══════════════════════════════════════════════════════════

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const logger = require('../../shared/utils/logger');

// S3 client (lazy loaded to avoid hard dep)
let s3Client       = null;
let isS3Available  = false;

const BUCKET       = () => process.env.S3_BUCKET || 'designos-assets';
const CDN_DOMAIN   = () => process.env.CLOUDFRONT_DOMAIN;
const REGION       = () => process.env.AWS_REGION || 'us-east-1';

// Local fallback directory
const LOCAL_DIR = path.join(process.cwd(), 'uploads');

// ── Init ──────────────────────────────────────────────────
function init() {
  // Ensure local upload directory exists
  if (!fs.existsSync(LOCAL_DIR)) {
    fs.mkdirSync(LOCAL_DIR, { recursive: true });
  }

  // Try to initialise AWS SDK
  try {
    const { S3Client } = require('@aws-sdk/client-s3');
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      s3Client = new S3Client({
        region: REGION(),
        credentials: {
          accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });
      isS3Available = true;
      logger.info('Storage: S3 client initialised', { bucket: BUCKET(), region: REGION() });
    } else {
      logger.warn('Storage: AWS credentials not set — using local disk fallback');
    }
  } catch {
    logger.warn('Storage: @aws-sdk not installed — using local disk fallback');
  }
}

// ── Upload buffer ──────────────────────────────────────────
async function uploadBuffer(buffer, key, contentType = 'application/octet-stream', metadata = {}) {
  if (isS3Available && s3Client) {
    return uploadToS3(buffer, key, contentType, metadata);
  }
  return uploadToLocal(buffer, key, contentType);
}

async function uploadToS3(buffer, key, contentType, metadata) {
  const { PutObjectCommand } = require('@aws-sdk/client-s3');

  await s3Client.send(new PutObjectCommand({
    Bucket:               BUCKET(),
    Key:                  key,
    Body:                 buffer,
    ContentType:          contentType,
    ServerSideEncryption: process.env.S3_KMS_KEY_ID ? 'aws:kms' : 'AES256',
    SSEKMSKeyId:          process.env.S3_KMS_KEY_ID || undefined,
    Metadata: {
      'x-designos-user':    String(metadata.userId  || ''),
      'x-designos-file-id': String(metadata.fileId  || ''),
    },
    Tagging: buildTagString(metadata),
  }));

  const url = CDN_DOMAIN()
    ? `https://${CDN_DOMAIN()}/${key}`
    : `https://${BUCKET()}.s3.${REGION()}.amazonaws.com/${key}`;

  logger.info('Storage: uploaded to S3', { key, size: buffer.length });
  return url;
}

async function uploadToLocal(buffer, key, contentType) {
  const filePath = path.join(LOCAL_DIR, key.replace(/\//g, '_'));
  fs.writeFileSync(filePath, buffer);

  const localUrl = `/uploads/${path.basename(filePath)}`;
  logger.info('Storage: uploaded to local disk', { key, path: filePath });
  return localUrl;
}

// ── Upload stream (for large files) ───────────────────────
async function uploadStream(readableStream, key, contentType = 'application/octet-stream', metadata = {}) {
  if (!isS3Available || !s3Client) {
    // Buffer entire stream for local fallback
    const chunks = [];
    for await (const chunk of readableStream) chunks.push(chunk);
    return uploadBuffer(Buffer.concat(chunks), key, contentType, metadata);
  }

  try {
    const { Upload } = require('@aws-sdk/lib-storage');
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket:               BUCKET(),
        Key:                  key,
        Body:                 readableStream,
        ContentType:          contentType,
        ServerSideEncryption: 'AES256',
        Metadata: { 'x-designos-user': String(metadata.userId || '') },
      },
      queueSize:  4,
      partSize:   1024 * 1024 * 10, // 10 MB parts
      leavePartsOnError: false,
    });

    upload.on('httpUploadProgress', (progress) => {
      logger.debug('S3 multipart upload progress', {
        key, loaded: progress.loaded, total: progress.total,
      });
    });

    await upload.done();
    const url = CDN_DOMAIN()
      ? `https://${CDN_DOMAIN()}/${key}`
      : `https://${BUCKET()}.s3.${REGION()}.amazonaws.com/${key}`;

    return url;
  } catch (err) {
    logger.error('Storage: multipart upload failed', { key, error: err.message });
    throw err;
  }
}

// ── Get pre-signed URL ─────────────────────────────────────
async function getSignedUrl(key, expiresInSeconds = 3600) {
  if (!isS3Available || !s3Client) {
    return `/uploads/${key.replace(/\//g, '_')}`;
  }

  const { getSignedUrl: awsGetSignedUrl } = require('@aws-sdk/s3-request-presigner');
  const { GetObjectCommand } = require('@aws-sdk/client-s3');

  try {
    const cmd = new GetObjectCommand({ Bucket: BUCKET(), Key: key });
    return awsGetSignedUrl(s3Client, cmd, { expiresIn: expiresInSeconds });
  } catch (err) {
    logger.error('Storage: signed URL failed', { key, error: err.message });
    throw err;
  }
}

// ── Get pre-signed PUT URL (for direct browser upload) ────
async function getSignedPutUrl(key, contentType, expiresInSeconds = 900) {
  if (!isS3Available || !s3Client) {
    return { url: `/upload/${key}`, method: 'PUT', local: true };
  }

  const { getSignedUrl: awsGetSignedUrl } = require('@aws-sdk/s3-request-presigner');
  const { PutObjectCommand } = require('@aws-sdk/client-s3');

  const cmd = new PutObjectCommand({
    Bucket:      BUCKET(),
    Key:         key,
    ContentType: contentType,
    ServerSideEncryption: 'AES256',
  });

  const url = await awsGetSignedUrl(s3Client, cmd, { expiresIn: expiresInSeconds });
  return { url, method: 'PUT', key, expiresIn: expiresInSeconds };
}

// ── Delete object ──────────────────────────────────────────
async function deleteObject(key) {
  if (!isS3Available || !s3Client) {
    const filePath = path.join(LOCAL_DIR, key.replace(/\//g, '_'));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return;
  }

  const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
  await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET(), Key: key }));
  logger.info('Storage: deleted object', { key });
}

// ── Copy object ────────────────────────────────────────────
async function copyObject(sourceKey, destKey) {
  if (!isS3Available || !s3Client) return;
  const { CopyObjectCommand } = require('@aws-sdk/client-s3');
  await s3Client.send(new CopyObjectCommand({
    Bucket:     BUCKET(),
    CopySource: `${BUCKET()}/${sourceKey}`,
    Key:        destKey,
  }));
  logger.info('Storage: copied object', { sourceKey, destKey });
}

// ── Archive to Glacier (manual override) ──────────────────
async function archiveToGlacier(key) {
  if (!isS3Available || !s3Client) return;
  const { CopyObjectCommand } = require('@aws-sdk/client-s3');
  await s3Client.send(new CopyObjectCommand({
    Bucket:       BUCKET(),
    CopySource:   `${BUCKET()}/${key}`,
    Key:          key,
    StorageClass: 'GLACIER',
    MetadataDirective: 'COPY',
  }));
  logger.info('Storage: archived to Glacier', { key });
}

// ── CloudFront signed URL ──────────────────────────────────
function getCDNSignedUrl(key, expiresAt) {
  const domain = CDN_DOMAIN();
  if (!domain) return null;

  const cfPrivKey  = process.env.CLOUDFRONT_PRIVATE_KEY;
  const cfKeyId    = process.env.CLOUDFRONT_KEY_PAIR_ID;
  if (!cfPrivKey || !cfKeyId) {
    // Return unsigned CDN URL
    return `https://${domain}/${key}`;
  }

  // CloudFront signed URL with custom policy
  const policy = JSON.stringify({
    Statement: [{
      Resource: `https://${domain}/${key}`,
      Condition: {
        DateLessThan: { 'AWS:EpochTime': Math.floor(expiresAt / 1000) },
      },
    }],
  });

  const policyBase64 = Buffer.from(policy).toString('base64')
    .replace(/\+/g, '-').replace(/=/g, '_').replace(/\//g, '~');

  const sign = crypto.createSign('RSA-SHA1');
  sign.update(policy);
  const sigBase64 = sign.sign(cfPrivKey, 'base64')
    .replace(/\+/g, '-').replace(/=/g, '_').replace(/\//g, '~');

  return `https://${domain}/${key}?Policy=${policyBase64}&Signature=${sigBase64}&Key-Pair-Id=${cfKeyId}`;
}

// ── Health check ───────────────────────────────────────────
async function healthCheck() {
  if (!isS3Available) {
    return { available: false, type: 'local', directory: LOCAL_DIR };
  }
  try {
    const { HeadBucketCommand } = require('@aws-sdk/client-s3');
    await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET() }));
    return { available: true, type: 's3', bucket: BUCKET(), region: REGION() };
  } catch (err) {
    return { available: false, type: 's3', error: err.message };
  }
}

// ── Helpers ───────────────────────────────────────────────
function buildTagString(metadata) {
  const tags = {
    service:    'designos',
    userId:     metadata.userId  || 'unknown',
    fileType:   metadata.fileType || 'asset',
  };
  return Object.entries(tags)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

module.exports = {
  init, uploadBuffer, uploadStream,
  getSignedUrl, getSignedPutUrl,
  deleteObject, copyObject,
  archiveToGlacier, getCDNSignedUrl, healthCheck,
};
