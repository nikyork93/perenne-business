import { isCommonPassword } from './common-passwords';

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4; // 0=very weak, 4=excellent
  label: 'too short' | 'weak' | 'fair' | 'good' | 'strong' | 'excellent';
  color: 'red' | 'orange' | 'yellow' | 'lime' | 'green' | 'emerald';
  feedback: string[];
  errors: string[]; // blocking errors that prevent submission
  isValid: boolean;
}

/**
 * Comprehensive password validator + strength meter.
 * Used both client-side (real-time feedback) and server-side (final validation).
 */
export function evaluatePassword(password: string, email?: string): PasswordStrength {
  const errors: string[] = [];
  const feedback: string[] = [];
  let score = 0;

  // ─── Hard requirements (must pass to be valid) ───────────────────
  if (password.length < 10) {
    errors.push('Must be at least 10 characters');
  }

  if (password.length > 128) {
    errors.push('Maximum 128 characters');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Must contain at least one lowercase letter');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Must contain at least one uppercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Must contain at least one number');
  }

  if (isCommonPassword(password)) {
    errors.push('This password is too common and has been seen in data breaches');
  }

  // Block password = email or contains email local part
  if (email) {
    const emailLocal = email.split('@')[0]?.toLowerCase();
    if (emailLocal && password.toLowerCase().includes(emailLocal) && emailLocal.length >= 4) {
      errors.push('Password should not contain your email');
    }
  }

  // ─── Strength scoring (assumes hard requirements pass) ──────────

  // Length scoring
  if (password.length >= 10) score += 1;
  if (password.length >= 14) score += 1;
  if (password.length >= 18) score += 1;

  // Character variety
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);
  const varietyCount = [hasLower, hasUpper, hasNumber, hasSpecial].filter(Boolean).length;

  if (varietyCount === 4) score += 1;
  if (hasSpecial) score += 1;

  // Penalty for repetitions / sequences
  if (/(.)\1{2,}/.test(password)) {
    score -= 1;
    feedback.push('Avoid repeating the same character 3+ times');
  }
  if (/(?:0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|qwer|wert|erty)/i.test(password)) {
    score -= 1;
    feedback.push('Avoid sequential keys/numbers');
  }

  // Clamp score to 0-4
  score = Math.max(0, Math.min(4, score)) as 0 | 1 | 2 | 3 | 4;

  // ─── Suggestions for improvement ────────────────────────────────

  if (password.length < 14 && errors.length === 0) {
    feedback.push('Use 14+ characters for stronger security');
  }
  if (!hasSpecial && errors.length === 0) {
    feedback.push('Add a special character (e.g. !@#$%) for extra strength');
  }

  // ─── Label and color from score ─────────────────────────────────

  let label: PasswordStrength['label'];
  let color: PasswordStrength['color'];

  if (errors.length > 0 && password.length < 10) {
    label = 'too short';
    color = 'red';
  } else if (errors.length > 0) {
    label = 'weak';
    color = 'red';
  } else if (score === 0 || score === 1) {
    label = 'weak';
    color = 'orange';
  } else if (score === 2) {
    label = 'fair';
    color = 'yellow';
  } else if (score === 3) {
    label = 'good';
    color = 'lime';
  } else if (score === 4) {
    label = 'strong';
    color = 'green';
  } else {
    label = 'excellent';
    color = 'emerald';
  }

  // Bonus: if 18+ chars + 4 variety + no penalties, mark as excellent
  if (errors.length === 0 && password.length >= 18 && varietyCount === 4 && score === 4) {
    label = 'excellent';
    color = 'emerald';
  }

  return {
    score,
    label,
    color,
    feedback,
    errors,
    isValid: errors.length === 0,
  };
}

/**
 * Generate a strong random password.
 * Uses crypto.getRandomValues for entropy. Avoids ambiguous chars (0/O, l/1).
 */
export function generateSecurePassword(length: number = 16): string {
  const lowercase = 'abcdefghjkmnpqrstuvwxyz'; // no l, i, o
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I, O
  const numbers = '23456789'; // no 0, 1
  const special = '!@#$%^&*-_=+';
  const allChars = lowercase + uppercase + numbers + special;

  // Ensure at least 1 of each type
  const required = [
    pickRandom(lowercase),
    pickRandom(lowercase),
    pickRandom(uppercase),
    pickRandom(uppercase),
    pickRandom(numbers),
    pickRandom(numbers),
    pickRandom(special),
    pickRandom(special),
  ];

  // Fill remaining length with random chars from full set
  const remaining = length - required.length;
  for (let i = 0; i < remaining; i++) {
    required.push(pickRandom(allChars));
  }

  // Shuffle (Fisher-Yates with crypto random)
  const arr = required;
  for (let i = arr.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr.join('');
}

function pickRandom(charset: string): string {
  return charset[secureRandomInt(charset.length)];
}

function secureRandomInt(max: number): number {
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    return arr[0] % max;
  }
  // Server-side fallback (Node)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require('crypto');
  return crypto.randomInt(0, max);
}
