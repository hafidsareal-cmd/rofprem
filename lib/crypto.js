import { randomBytes, createHash } from 'crypto';

/**
 * Generate activation code: XXXX-XXXX-XXXX-XXXX (uppercase hex)
 * Stored PLAINTEXT in DB — simple, no hash mismatch bug.
 */
export function generateCode() {
  const hex = randomBytes(8).toString('hex').toUpperCase();
  return `${hex.slice(0,4)}-${hex.slice(4,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}`;
}

/**
 * Normalize a user-entered code to canonical form.
 * Strips spaces, dashes optional, uppercases, then re-inserts dashes.
 */
export function normalizeCode(input) {
  const clean = String(input || '').replace(/[\s\-_]/g, '').toUpperCase();
  if (clean.length !== 16) return null;  // invalid length
  return `${clean.slice(0,4)}-${clean.slice(4,8)}-${clean.slice(8,12)}-${clean.slice(12,16)}`;
}

export function generateToken() {
  return randomBytes(32).toString('hex');
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function generateVerifyToken() {
  return randomBytes(24).toString('hex');
}
