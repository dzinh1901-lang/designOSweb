'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · Auth Service
// JWT issuance, refresh rotation, bcrypt, token revocation
// ══════════════════════════════════════════════════════════

const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const logger   = require('../../shared/utils/logger');
const { hashToken, randomToken } = require('../../shared/crypto/encryption');
const { BCRYPT_ROUNDS, MAX_LOGIN_ATTEMPTS, LOCKOUT_DURATION_MS,
        TOKEN_BLACKLIST_TTL, ROLES, HTTP } = require('../../config/constants');

let redisClient  = null;
let firestoreDb  = null;
function init(redis, firestore) { redisClient = redis; firestoreDb = firestore; }

// ── Token generation ──────────────────────────────────────
function issueAccessToken(user) {
  return jwt.sign(
    {
      sub:     user.id,
      email:   user.email,
      role:    user.role || ROLES.FREE,
      credits: user.credits || 0,
      orgId:   user.orgId || null,
      jti:     uuidv4(),
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '15m',
      algorithm: 'HS256',
      issuer:    'designos-api',
      audience:  'designos-client',
    }
  );
}

function issueRefreshToken(userId) {
  const rawToken = randomToken(48);
  const hashed   = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return { rawToken, hashed, expiresAt };
}

// ── Register ──────────────────────────────────────────────
async function register({ email, password, name, organization }) {
  if (!firestoreDb) throw new Error('Firestore not initialised');

  // Check duplicate
  const existing = await firestoreDb.collection('users').where('email', '==', email).limit(1).get();
  if (!existing.empty) {
    const err = new Error('Email already registered'); err.status = HTTP.CONFLICT; throw err;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const userId = uuidv4();
  const now    = new Date();

  const userData = {
    id:           userId,
    email,
    name,
    organization:  organization || null,
    passwordHash,
    role:          ROLES.FREE,
    credits:       5.0,  // free tier starting credits
    active:        true,
    loginAttempts: 0,
    lockedUntil:   null,
    createdAt:     now,
    updatedAt:     now,
  };

  await firestoreDb.collection('users').doc(userId).set(userData);
  logger.info('User registered', { userId, email });

  const accessToken  = issueAccessToken({ id: userId, email, role: ROLES.FREE, credits: 5.0 });
  const { rawToken, hashed, expiresAt } = issueRefreshToken(userId);

  await firestoreDb.collection('refresh_tokens').doc(hashed).set({
    userId, expiresAt, createdAt: now, userAgent: null,
  });

  return { accessToken, refreshToken: rawToken, expiresAt };
}

// ── Login ─────────────────────────────────────────────────
async function login({ email, password, userAgent, ip }) {
  if (!firestoreDb) throw new Error('Firestore not initialised');

  const snap = await firestoreDb.collection('users').where('email', '==', email).limit(1).get();
  const authFail = () => { const e = new Error('Invalid email or password'); e.status = HTTP.UNAUTH; throw e; };

  if (snap.empty) return authFail();
  const userDoc = snap.docs[0];
  const user    = userDoc.data();

  // Account lock check
  if (user.lockedUntil && user.lockedUntil.toDate() > new Date()) {
    const err = new Error('Account temporarily locked. Try again later.');
    err.status = HTTP.FORBIDDEN; throw err;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const attempts = (user.loginAttempts || 0) + 1;
    const updates  = { loginAttempts: attempts, updatedAt: new Date() };
    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      updates.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
      logger.warn('Account locked', { userId: user.id, email, ip });
    }
    await userDoc.ref.update(updates);
    return authFail();
  }

  // Reset attempts on success
  await userDoc.ref.update({ loginAttempts: 0, lockedUntil: null, lastLoginAt: new Date(), updatedAt: new Date() });

  const accessToken = issueAccessToken(user);
  const { rawToken, hashed, expiresAt } = issueRefreshToken(user.id);
  await firestoreDb.collection('refresh_tokens').doc(hashed).set({
    userId: user.id, expiresAt, createdAt: new Date(), userAgent: userAgent?.slice(0, 200) || null, ip,
  });

  logger.info('User login', { userId: user.id, ip });
  return { accessToken, refreshToken: rawToken, expiresAt, user: sanitiseUser(user) };
}

// ── Refresh token rotation ────────────────────────────────
async function refreshTokens({ refreshToken }) {
  const hashed = hashToken(refreshToken);
  const tokenDoc = await firestoreDb.collection('refresh_tokens').doc(hashed).get();

  if (!tokenDoc.exists) {
    const err = new Error('Invalid refresh token'); err.status = HTTP.UNAUTH; throw err;
  }

  const tokenData = tokenDoc.data();
  if (new Date() > tokenData.expiresAt.toDate()) {
    await tokenDoc.ref.delete();
    const err = new Error('Refresh token expired'); err.status = HTTP.UNAUTH; throw err;
  }

  const userDoc = await firestoreDb.collection('users').doc(tokenData.userId).get();
  if (!userDoc.exists || !userDoc.data().active) {
    const err = new Error('Account not found or inactive'); err.status = HTTP.UNAUTH; throw err;
  }

  // Token rotation — delete old, issue new
  await tokenDoc.ref.delete();
  const user = userDoc.data();
  const newAccessToken  = issueAccessToken(user);
  const { rawToken: newRaw, hashed: newHashed, expiresAt } = issueRefreshToken(user.id);
  await firestoreDb.collection('refresh_tokens').doc(newHashed).set({
    userId: user.id, expiresAt, createdAt: new Date(), userAgent: tokenData.userAgent,
  });

  return { accessToken: newAccessToken, refreshToken: newRaw, expiresAt };
}

// ── Logout (blacklist token) ──────────────────────────────
async function logout({ jti, refreshToken }) {
  // Blacklist access token JTI
  if (redisClient && jti) {
    await redisClient.setEx(
      `${process.env.REDIS_PREFIX || 'dos:'}blacklist:${jti}`,
      TOKEN_BLACKLIST_TTL, '1'
    );
  }
  // Revoke refresh token
  if (refreshToken && firestoreDb) {
    const hashed = hashToken(refreshToken);
    await firestoreDb.collection('refresh_tokens').doc(hashed).delete().catch(() => {});
  }
  logger.info('User logout', { jti });
}

// ── Get profile ───────────────────────────────────────────
async function getProfile(userId) {
  if (!firestoreDb) {
    return { id: userId, email: 'demo@designos.ai', role: 'free', credits: 5.0 };
  }
  const doc = await firestoreDb.collection('users').doc(userId).get();
  if (!doc.exists) {
    const err = new Error('User not found'); err.status = HTTP.NOT_FOUND; throw err;
  }
  return sanitiseUser(doc.data());
}

// ── Change password ───────────────────────────────────────
async function changePassword({ userId, currentPassword, newPassword }) {
  if (!firestoreDb) throw new Error('Firestore not initialised');
  const doc  = await firestoreDb.collection('users').doc(userId).get();
  if (!doc.exists) { const e = new Error('User not found'); e.status = HTTP.NOT_FOUND; throw e; }

  const user = doc.data();
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) { const e = new Error('Current password incorrect'); e.status = HTTP.UNAUTH; throw e; }

  const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await doc.ref.update({ passwordHash: newHash, updatedAt: new Date() });

  // Invalidate all refresh tokens for this user
  const tokens = await firestoreDb.collection('refresh_tokens')
    .where('userId', '==', userId).get();
  const batch = firestoreDb.batch();
  tokens.docs.forEach(t => batch.delete(t.ref));
  await batch.commit();

  logger.info('Password changed', { userId });
}

// ── Request password reset ────────────────────────────────
async function requestPasswordReset({ email }) {
  // In production: generate reset token, send email via SES/SendGrid
  // For now: log intent (prevent user enumeration by always succeeding)
  logger.info('Password reset requested', { email });
  // TODO: integrate email service
}

// ── Helpers ───────────────────────────────────────────────
function sanitiseUser(user) {
  const { passwordHash, loginAttempts, lockedUntil, ...safe } = user;
  return safe;
}

module.exports = {
  init, register, login, refreshTokens, logout,
  getProfile, changePassword, requestPasswordReset,
};
