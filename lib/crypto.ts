import { randomBytes, createHmac, timingSafeEqual } from 'crypto';

/**
 * Generate a cryptographically random token, URL-safe base64url.
 * Default 32 bytes = 256 bits of entropy.
 */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Generate a human-readable notebook code.
 * Format: PRN-XXXX-XXXX-XXXX (12 alphanumeric chars, ambiguous letters removed)
 * Collision probability is negligible (32^12 ≈ 10^18 combinations).
 */
export function generateNotebookCode(): string {
  // No 0/O/1/I/L — easy to read/transcribe
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(12);
  let code = '';
  for (let i = 0; i < 12; i++) {
    code += alphabet[bytes[i] % alphabet.length];
    if (i === 3 || i === 7) code += '-';
  }
  return 'PRN-' + code;
}

/**
 * HMAC a string with a server-side secret.
 * Used for session cookie signing and webhook verification.
 */
export function hmacSign(message: string, secret: string): string {
  return createHmac('sha256', secret).update(message).digest('base64url');
}

/**
 * Constant-time comparison for tokens. Use instead of `===` to prevent
 * timing attacks when comparing secrets.
 */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
