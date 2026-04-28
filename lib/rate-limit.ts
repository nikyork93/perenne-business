import { prisma } from '@/lib/prisma';
import { Resend } from 'resend';
import { env } from '@/lib/env';

// ─── Rate limiting thresholds ──────────────────────────────────────

const PER_EMAIL_MAX_FAILED = 5; // failed attempts per email
const PER_EMAIL_WINDOW_MIN = 15;
const PER_EMAIL_LOCKOUT_MIN = 30;

const PER_IP_MAX_FAILED = 20; // failed attempts per IP across any email
const PER_IP_WINDOW_MIN = 60;
const PER_IP_LOCKOUT_MIN = 60;

const ACCOUNT_LOCKOUT_THRESHOLD = 10; // total failed attempts to trigger account-level lockout

// ─── Public API ────────────────────────────────────────────────────

export interface RateLimitCheck {
  allowed: boolean;
  reason?: 'email_locked' | 'ip_locked' | 'account_locked';
  retryAfterMinutes?: number;
}

/**
 * Checks whether a login attempt should be allowed.
 * Pre-flight check before verifying password.
 */
export async function checkLoginRateLimit(
  email: string,
  ipAddress: string | null
): Promise<RateLimitCheck> {
  const now = new Date();

  // 1. Per-email check
  const emailWindowStart = new Date(now.getTime() - PER_EMAIL_WINDOW_MIN * 60 * 1000);
  const emailFailedRecent = await prisma.loginAttempt.count({
    where: {
      email,
      success: false,
      createdAt: { gte: emailWindowStart },
    },
  });

  if (emailFailedRecent >= PER_EMAIL_MAX_FAILED) {
    // Find oldest failed attempt in window — lockout ends PER_EMAIL_LOCKOUT_MIN after the threshold attempt
    const oldestFailed = await prisma.loginAttempt.findFirst({
      where: { email, success: false, createdAt: { gte: emailWindowStart } },
      orderBy: { createdAt: 'asc' },
    });
    const lockoutEnd = oldestFailed
      ? new Date(oldestFailed.createdAt.getTime() + PER_EMAIL_LOCKOUT_MIN * 60 * 1000)
      : new Date(now.getTime() + PER_EMAIL_LOCKOUT_MIN * 60 * 1000);

    if (lockoutEnd > now) {
      const minutesLeft = Math.ceil((lockoutEnd.getTime() - now.getTime()) / 60000);
      return { allowed: false, reason: 'email_locked', retryAfterMinutes: minutesLeft };
    }
  }

  // 2. Per-IP check
  if (ipAddress) {
    const ipWindowStart = new Date(now.getTime() - PER_IP_WINDOW_MIN * 60 * 1000);
    const ipFailedRecent = await prisma.loginAttempt.count({
      where: {
        ipAddress,
        success: false,
        createdAt: { gte: ipWindowStart },
      },
    });

    if (ipFailedRecent >= PER_IP_MAX_FAILED) {
      return { allowed: false, reason: 'ip_locked', retryAfterMinutes: PER_IP_LOCKOUT_MIN };
    }
  }

  // 3. Account-level lockout
  const user = await prisma.user.findUnique({ where: { email }, select: { isActive: true } });
  if (user && !user.isActive) {
    return { allowed: false, reason: 'account_locked' };
  }

  return { allowed: true };
}

/**
 * Records a login attempt result. Triggers protective actions on failures.
 */
export async function recordLoginAttempt(params: {
  email: string;
  ipAddress: string | null;
  userAgent: string | null;
  success: boolean;
}): Promise<void> {
  const { email, ipAddress, userAgent, success } = params;

  await prisma.loginAttempt.create({
    data: { email, ipAddress, userAgent, success },
  });

  // On success, clear recent failed attempts for this email (good behavior reset)
  if (success) {
    await prisma.loginAttempt.deleteMany({
      where: { email, success: false },
    });
    return;
  }

  // On failure: count total recent failures and trigger notification at threshold
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const totalRecent = await prisma.loginAttempt.count({
    where: { email, success: false, createdAt: { gte: oneDayAgo } },
  });

  // At exactly the email-lock threshold (5), send notification email to user
  if (totalRecent === PER_EMAIL_MAX_FAILED) {
    await notifySuspiciousAttempts(email, totalRecent, ipAddress).catch((err) => {
      console.error('[recordLoginAttempt] notification failed:', err);
    });
  }

  // At account lockout threshold, deactivate the account (option C)
  if (totalRecent >= ACCOUNT_LOCKOUT_THRESHOLD) {
    await prisma.user.updateMany({
      where: { email },
      data: { isActive: false },
    });
    await notifyAccountLocked(email).catch((err) => {
      console.error('[recordLoginAttempt] lockout notification failed:', err);
    });
  }
}

// ─── Email notifications ───────────────────────────────────────────

async function notifySuspiciousAttempts(
  email: string,
  count: number,
  ipAddress: string | null
): Promise<void> {
  if (!env.RESEND_API_KEY) return;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;

  const resend = new Resend(env.RESEND_API_KEY);

  const subject = 'Suspicious sign-in attempts on your Perenne Business account';

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#0a0a0f;font-family:-apple-system,sans-serif;color:#f4f4f5;">
<table width="100%" style="background:#0a0a0f;padding:48px 20px;"><tr><td align="center">
<table width="560" style="max-width:560px;background:rgba(24,24,27,0.95);border:1px solid rgba(255,255,255,0.08);border-radius:24px;">
<tr><td style="padding:36px 40px;">
  <div style="font-family:ui-monospace,monospace;font-size:10px;color:#71717a;letter-spacing:0.18em;text-transform:uppercase;margin-bottom:20px;">Security alert</div>
  <h1 style="font-family:Georgia,serif;font-style:italic;font-size:26px;color:#f4f4f5;margin:0 0 16px;">Multiple failed sign-in attempts</h1>
  <p style="color:#c1c1c8;font-size:14px;line-height:1.6;margin:0 0 16px;">${count} failed sign-in attempts were made on your Perenne Business account in the last 15 minutes${ipAddress ? ` from IP <code style="font-family:monospace;color:#f4f4f5;background:rgba(255,255,255,0.04);padding:2px 6px;border-radius:4px;">${ipAddress}</code>` : ''}.</p>
  <p style="color:#c1c1c8;font-size:14px;line-height:1.6;margin:0 0 24px;">Your account has been temporarily locked for 30 minutes as a precaution. If this was you, just wait and try again. If it wasn&apos;t, we recommend you reset your password immediately.</p>
  <a href="https://business.perenne.app/forgot-password" style="display:inline-block;background:#4a7a8c;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:12px 28px;border-radius:14px;">Reset my password</a>
  <p style="color:#71717a;font-size:11px;line-height:1.6;margin:28px 0 0;">If you didn&apos;t attempt to sign in and you don&apos;t recognize this IP, change your password and contact us at nicholas@perenne.app.</p>
</td></tr>
</table></td></tr></table>
</body></html>`;

  await resend.emails.send({
    from: env.EMAIL_FROM || 'Perenne Business <business@perenne.app>',
    to: email,
    replyTo: 'nicholas@perenne.app',
    subject,
    html,
    text: `Security alert: ${count} failed sign-in attempts on your Perenne Business account${ipAddress ? ` from IP ${ipAddress}` : ''}. Account temporarily locked for 30 minutes. If this wasn't you, reset your password at https://business.perenne.app/forgot-password`,
  });
}

async function notifyAccountLocked(email: string): Promise<void> {
  if (!env.RESEND_API_KEY) return;

  const resend = new Resend(env.RESEND_API_KEY);

  const subject = 'Your Perenne Business account has been locked';

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#0a0a0f;font-family:-apple-system,sans-serif;color:#f4f4f5;">
<table width="100%" style="background:#0a0a0f;padding:48px 20px;"><tr><td align="center">
<table width="560" style="max-width:560px;background:rgba(24,24,27,0.95);border:1px solid rgba(255,90,90,0.2);border-radius:24px;">
<tr><td style="padding:36px 40px;">
  <div style="font-family:ui-monospace,monospace;font-size:10px;color:#ff5e5e;letter-spacing:0.18em;text-transform:uppercase;margin-bottom:20px;">Account locked</div>
  <h1 style="font-family:Georgia,serif;font-style:italic;font-size:26px;color:#f4f4f5;margin:0 0 16px;">Your account is locked</h1>
  <p style="color:#c1c1c8;font-size:14px;line-height:1.6;margin:0 0 16px;">Due to too many failed sign-in attempts, your Perenne Business account has been locked. To regain access, reset your password.</p>
  <a href="https://business.perenne.app/forgot-password" style="display:inline-block;background:#4a7a8c;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:12px 28px;border-radius:14px;">Reset my password</a>
  <p style="color:#71717a;font-size:11px;line-height:1.6;margin:28px 0 0;">If you suspect unauthorized access, contact us immediately at nicholas@perenne.app.</p>
</td></tr>
</table></td></tr></table>
</body></html>`;

  await resend.emails.send({
    from: env.EMAIL_FROM || 'Perenne Business <business@perenne.app>',
    to: email,
    replyTo: 'nicholas@perenne.app',
    subject,
    html,
    text: `Your Perenne Business account has been locked due to too many failed sign-in attempts. Reset your password at https://business.perenne.app/forgot-password to regain access.`,
  });
}

// ─── Forgot-password rate limit ────────────────────────────────────

const FORGOT_MAX_PER_HOUR = 3;

export async function checkForgotPasswordRateLimit(
  email: string,
  ipAddress: string | null
): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const recent = await prisma.loginAttempt.count({
    where: {
      OR: [
        { email, action: 'forgot_password', createdAt: { gte: oneHourAgo } },
        ipAddress ? { ipAddress, action: 'forgot_password', createdAt: { gte: oneHourAgo } } : { id: '__never__' },
      ],
    },
  });

  return recent < FORGOT_MAX_PER_HOUR;
}

export async function recordForgotPasswordAttempt(
  email: string,
  ipAddress: string | null
): Promise<void> {
  await prisma.loginAttempt.create({
    data: { email, ipAddress, action: 'forgot_password', success: true },
  });
}

// ─── Helpers ───────────────────────────────────────────────────────

export function extractIpAddress(req: Request): string | null {
  // Prefer Vercel-provided headers
  const xForwardedFor = req.headers.get('x-forwarded-for');
  if (xForwardedFor) return xForwardedFor.split(',')[0].trim();

  const xRealIp = req.headers.get('x-real-ip');
  if (xRealIp) return xRealIp;

  return null;
}
