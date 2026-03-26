'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · AES-256-GCM Field-Level Encryption
//
// Security model:
//  - AES-256-GCM: authenticated encryption (prevents tampering)
//  - Random IV per encryption (prevents IV reuse attacks)
//  - GCM auth tag validates ciphertext integrity
//  - Key versioning allows key rotation without re-encrypting all data
//  - PBKDF2 key derivation from env secrets
//  - Timing-safe comparison for HMAC verification
// ══════════════════════════════════════════════════════════

const crypto = require('crypto');
const { ENCRYPTION } = require('../../config/constants');

const KEY_CACHE = new Map(); // Avoid repeated PBKDF2 on hot path

/**
 * Derive a 32-byte AES key from the master secret using PBKDF2.
 * Result is cached in memory (not persisted).
 */
function deriveKey(keyVersion = process.env.ENCRYPTION_KEY_VERSION || '1') {
  const cacheKey = `key_v${keyVersion}`;
  if (KEY_CACHE.has(cacheKey)) return KEY_CACHE.get(cacheKey);

  const masterSecret = process.env.ENCRYPTION_KEY;
  if (!masterSecret) throw new Error('ENCRYPTION_KEY env var not set');

  const salt = Buffer.from(`designos-v${keyVersion}-salt`, 'utf8');
  const key  = crypto.pbkdf2Sync(masterSecret, salt, 100_000, ENCRYPTION.KEY_LENGTH, 'sha256');
  KEY_CACHE.set(cacheKey, key);
  return key;
}

/**
 * Encrypt a string value with AES-256-GCM.
 * Returns a Base64-encoded envelope: version:iv:tag:ciphertext
 */
function encrypt(plaintext, keyVersion) {
  if (plaintext === null || plaintext === undefined) return plaintext;

  const ver  = keyVersion || process.env.ENCRYPTION_KEY_VERSION || '1';
  const key  = deriveKey(ver);
  const iv   = crypto.randomBytes(ENCRYPTION.IV_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION.ALGORITHM, key, iv);

  const encrypted  = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag    = cipher.getAuthTag();

  // Envelope: v{version}:{iv_hex}:{tag_hex}:{ct_base64}
  return `v${ver}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypt an AES-256-GCM envelope produced by encrypt().
 * Verifies auth tag — throws if tampered.
 */
function decrypt(envelope) {
  if (!envelope || typeof envelope !== 'string') return envelope;

  const parts = envelope.split(':');
  if (parts.length !== 4) throw new Error('Invalid encryption envelope');

  const [versionStr, ivHex, tagHex, ctBase64] = parts;
  const version = versionStr.replace('v', '');
  const key     = deriveKey(version);
  const iv      = Buffer.from(ivHex,    'hex');
  const authTag = Buffer.from(tagHex,   'hex');
  const ct      = Buffer.from(ctBase64, 'base64');

  const decipher = crypto.createDecipheriv(ENCRYPTION.ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Encrypt a plain JS object's specified fields in-place (returns new object).
 */
function encryptFields(obj, fields) {
  const out = { ...obj };
  for (const field of fields) {
    if (out[field] !== undefined && out[field] !== null) {
      out[field] = encrypt(String(out[field]));
    }
  }
  return out;
}

/**
 * Decrypt a plain JS object's specified fields in-place (returns new object).
 */
function decryptFields(obj, fields) {
  const out = { ...obj };
  for (const field of fields) {
    if (out[field] !== undefined && out[field] !== null) {
      try {
        out[field] = decrypt(String(out[field]));
      } catch {
        // If decryption fails (plain-text legacy field), return as-is
        out[field] = out[field];
      }
    }
  }
  return out;
}

/**
 * HMAC-SHA256 for signing webhook payloads and signed URLs.
 */
function hmacSign(data, secret) {
  const key = secret || process.env.HMAC_SECRET;
  if (!key) throw new Error('HMAC_SECRET not configured');
  return crypto.createHmac('sha256', key).update(String(data)).digest('hex');
}

/**
 * Timing-safe HMAC verification (prevents timing attacks).
 */
function hmacVerify(data, expectedSig, secret) {
  const actualSig = hmacSign(data, secret);
  const a = Buffer.from(actualSig,   'hex');
  const b = Buffer.from(expectedSig, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Generate a cryptographically secure random token.
 */
function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Hash a token for storage (one-way, for refresh tokens).
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = { encrypt, decrypt, encryptFields, decryptFields, hmacSign, hmacVerify, randomToken, hashToken };
