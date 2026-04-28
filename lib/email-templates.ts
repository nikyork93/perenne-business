/**
 * Email templates for Perenne Business.
 * Uses inline SVG logo + glass aesthetic with teal gradient background.
 *
 * APPLE MAIL FIX (v2): Multiple redundant layers ensure the dark
 * background covers the entire email rendering area, even when
 * Apple Mail strips or ignores individual style declarations.
 *
 * Strategy:
 *  1. <html> and <body> have bgcolor + inline style + !important CSS
 *  2. A 100vh-min-height div wrapper outside the main table
 *  3. The outer table is 100% width with redundant bgcolor on every cell
 *  4. The radial gradient is on an INNER table — if a client doesn't
 *     support background-image, the solid #0a0a0f from outer layers stays
 *  5. Negative margins / outer padding eliminated to prevent gaps
 */

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 656.01 77.56" width="220" height="26" style="display:block" fill="#f4f4f5" aria-label="Perenne Note" role="img"><path d="M477.11,24.12c-1.78-1.92-3.94-3.4-6.49-4.45s-5.46-1.57-8.74-1.57c-4.68,0-8.48,1.03-11.41,3.09s-5.31,4.56-7.12,7.49v-9.42h-8.06v54.14h8.06v-31c0-2.51.4-4.82,1.2-6.91.8-2.09,1.94-3.89,3.4-5.39,1.47-1.5,3.19-2.65,5.18-3.46,1.99-.8,4.14-1.2,6.44-1.2,4.82,0,8.52,1.47,11.1,4.4,2.58,2.93,3.88,6.91,3.88,11.94v31.62h8.06v-33.61c0-3.21-.47-6.14-1.41-8.8-.94-2.65-2.3-4.94-4.08-6.86h-.01Z"/><path d="M544.91,26.42c-2.51-2.55-5.5-4.57-8.95-6.07-3.46-1.5-7.21-2.25-11.26-2.25s-7.91.75-11.36,2.25c-3.46,1.5-6.44,3.54-8.95,6.13-2.51,2.58-4.47,5.6-5.86,9.06-1.4,3.46-2.09,7.1-2.09,10.94s.7,7.47,2.09,10.89c1.4,3.42,3.35,6.41,5.86,8.95,2.51,2.55,5.48,4.57,8.9,6.07,3.42,1.5,7.16,2.25,11.2,2.25s7.82-.75,11.31-2.25,6.49-3.54,9-6.13c2.51-2.58,4.49-5.6,5.92-9.06s2.15-7.1,2.15-10.94-.7-7.47-2.09-10.89c-1.4-3.42-3.35-6.4-5.86-8.95h-.01ZM543.13,54.62c-.98,2.54-2.34,4.75-4.08,6.63-1.75,1.88-3.84,3.36-6.28,4.44s-5.13,1.62-8.06,1.62-5.52-.56-7.96-1.67-4.55-2.61-6.33-4.49-3.18-4.11-4.19-6.69-1.52-5.33-1.52-8.25.49-5.66,1.47-8.2c.98-2.54,2.32-4.77,4.03-6.69,1.71-1.91,3.79-3.41,6.23-4.49s5.13-1.62,8.06-1.62,5.51.56,7.96,1.67c2.44,1.11,4.57,2.63,6.39,4.54s3.23,4.16,4.24,6.74,1.52,5.33,1.52,8.25-.49,5.66-1.47,8.2h0Z"/><path d="M578.32,2.91h-8.06v16.34h-7.54v7.12h7.54v32.67c0,2.72.38,5.06,1.15,7.02s1.83,3.54,3.19,4.76c1.36,1.22,2.98,2.11,4.87,2.67,1.88.56,3.91.84,6.07.84,1.95,0,3.72-.19,5.29-.58,1.57-.38,3.05-.96,4.45-1.73v-6.91c-1.4.7-2.71,1.19-3.93,1.47-1.22.28-2.53.42-3.93.42-2.72,0-4.92-.66-6.6-1.99-1.68-1.33-2.51-3.67-2.51-7.02v-31.62h17.17v-7.12h-17.17V2.91h.01Z"/><path d="M649.42,26.47c-2.16-2.58-4.82-4.62-7.96-6.13-3.14-1.5-6.7-2.25-10.68-2.25-3.77,0-7.24.73-10.42,2.2-3.18,1.47-5.92,3.47-8.22,6.02-2.3,2.55-4.1,5.55-5.39,9.01s-1.94,7.14-1.94,11.05c0,4.19.73,8.03,2.17,11.52,1.45,3.49,3.4,6.48,5.86,8.95,2.46,2.48,5.33,4.4,8.61,5.76s6.77,2.04,10.47,2.04c5.17,0,9.49-.93,12.98-2.77,3.49-1.85,6.6-4.31,9.32-7.38l-5.03-4.5c-2.24,2.3-4.7,4.15-7.38,5.55-2.69,1.4-5.92,2.09-9.69,2.09-2.37,0-4.64-.4-6.81-1.2s-4.12-1.99-5.86-3.56c-1.75-1.57-3.18-3.49-4.29-5.76-1.12-2.27-1.82-4.87-2.09-7.8h42.83c.07-.49.11-.94.11-1.36v-1.15c0-3.98-.56-7.71-1.68-11.2s-2.76-6.53-4.92-9.11v-.02ZM613.08,43.33c.28-2.65.9-5.09,1.87-7.33.97-2.23,2.22-4.17,3.75-5.81s3.3-2.93,5.31-3.87,4.2-1.41,6.56-1.41c2.71,0,5.08.51,7.13,1.52s3.78,2.36,5.21,4.03c1.42,1.68,2.53,3.63,3.33,5.86.8,2.23,1.3,4.57,1.51,7.02h-34.67Z"/><path d="M49.84,6.57c-2.54-2.1-5.63-3.74-9.19-4.88-3.52-1.12-7.46-1.69-11.71-1.69H0v76.3h11.27v-25.86h16.3c4.03,0,7.91-.53,11.52-1.58,3.66-1.06,6.91-2.68,9.66-4.81,2.78-2.15,5.02-4.86,6.65-8.04h0c1.64-3.2,2.47-6.96,2.47-11.16,0-3.82-.7-7.32-2.07-10.4-1.38-3.1-3.39-5.75-5.96-7.88h0ZM46.6,25.16c0,2.21-.43,4.23-1.27,6.01s-2.08,3.33-3.68,4.6c-1.63,1.31-3.62,2.33-5.91,3.04-2.33.72-4.95,1.08-7.8,1.08H11.28V10.64h17.08c5.59,0,10.11,1.26,13.44,3.73,3.23,2.41,4.8,5.94,4.8,10.79h0Z"/><path d="M111.97,26.92c-2.29-2.73-5.14-4.93-8.46-6.52-3.33-1.59-7.14-2.4-11.33-2.4-3.97,0-7.69.79-11.05,2.34-3.34,1.54-6.27,3.69-8.7,6.38-2.42,2.68-4.34,5.87-5.69,9.48-1.35,3.6-2.03,7.5-2.03,11.57,0,4.37.77,8.44,2.29,12.1,1.52,3.66,3.6,6.83,6.18,9.43,2.59,2.61,5.65,4.66,9.1,6.09,3.45,1.43,7.16,2.16,11.05,2.16,5.39,0,9.99-.99,13.69-2.95,3.63-1.93,6.91-4.52,9.74-7.71l.99-1.12-7.21-6.46-1,1.03c-2.11,2.18-4.47,3.95-7,5.26-2.46,1.28-5.48,1.92-8.99,1.92-2.19,0-4.3-.37-6.29-1.11-1.97-.73-3.78-1.83-5.38-3.27s-2.92-3.22-3.95-5.31h0c-.82-1.67-1.4-3.56-1.74-5.64h42.43l.18-1.29c.08-.56.12-1.09.12-1.57v-1.15c0-4.11-.59-8.03-1.75-11.66-1.17-3.66-2.92-6.89-5.2-9.62v.02ZM107.47,43.24h-31.26c.32-1.86.83-3.62,1.53-5.23.9-2.07,2.07-3.88,3.47-5.39,1.39-1.49,3.02-2.68,4.85-3.54,1.8-.84,3.79-1.27,5.92-1.27,2.46,0,4.63.46,6.46,1.36,1.85.92,3.44,2.15,4.73,3.66,1.3,1.53,2.33,3.34,3.06,5.4.57,1.6.99,3.28,1.24,5.01h0Z"/><path d="M154.04,19.23c-2.38.74-4.61,1.86-6.61,3.3-1.99,1.44-3.78,3.17-5.33,5.16-.34.44-.67.88-.98,1.34v-9.87h-11.06v57.14h11.06v-23.07c0-3.86.53-7.3,1.59-10.23,1.04-2.9,2.49-5.35,4.29-7.29,1.79-1.92,3.92-3.38,6.32-4.34,2.42-.97,5.04-1.46,7.77-1.46h2.13v-11.65l-1.46-.04c-2.74-.07-5.33.27-7.71,1.01h-.01Z"/><path d="M184.39,75.4c3.45,1.43,7.16,2.16,11.05,2.16,5.39,0,9.99-.99,13.69-2.95,3.63-1.93,6.91-4.52,9.74-7.71l.99-1.12-7.21-6.46-1,1.03c-2.11,2.18-4.47,3.95-7,5.26-2.46,1.28-5.49,1.92-8.99,1.92-2.19,0-4.3-.37-6.29-1.11-1.97-.73-3.78-1.83-5.38-3.27s-2.92-3.22-3.95-5.31h0c-.82-1.67-1.4-3.56-1.74-5.64h42.43l.18-1.29c.08-.56.12-1.09.12-1.57v-1.15c0-4.11-.59-8.03-1.75-11.66-1.17-3.66-2.92-6.89-5.2-9.62-2.29-2.73-5.14-4.93-8.46-6.52-3.33-1.59-7.14-2.4-11.33-2.4s-7.69.79-11.05,2.34c-3.34,1.54-6.27,3.69-8.7,6.38-2.42,2.68-4.34,5.87-5.69,9.48-1.35,3.6-2.03,7.5-2.03,11.57,0,4.37.77,8.44,2.29,12.1,1.52,3.66,3.6,6.83,6.18,9.43,2.59,2.61,5.65,4.66,9.1,6.09v.02ZM178.3,43.24c.32-1.86.83-3.62,1.53-5.23.9-2.07,2.07-3.88,3.47-5.39,1.39-1.49,3.02-2.68,4.85-3.54,1.8-.84,3.79-1.27,5.92-1.27,2.46,0,4.63.46,6.46,1.36,1.85.92,3.44,2.15,4.73,3.66,1.29,1.52,2.32,3.34,3.06,5.4.57,1.6.99,3.28,1.24,5.01h-31.26,0Z"/><path d="M384.8,36.54c-1.17-3.66-2.92-6.89-5.2-9.62-2.29-2.73-5.14-4.93-8.46-6.52-3.33-1.59-7.14-2.4-11.33-2.4s-7.69.79-11.05,2.34c-3.34,1.54-6.27,3.69-8.71,6.38-2.42,2.68-4.34,5.87-5.69,9.48-1.35,3.6-2.03,7.5-2.03,11.57,0,4.37.77,8.44,2.29,12.1,1.52,3.66,3.6,6.83,6.18,9.43,2.59,2.61,5.65,4.66,9.1,6.09,3.45,1.43,7.16,2.16,11.05,2.16,5.39,0,9.99-.99,13.69-2.95,3.64-1.93,6.91-4.52,9.74-7.71l.99-1.12-7.21-6.46-1,1.03c-2.11,2.18-4.47,3.95-7,5.26-2.46,1.28-5.49,1.92-8.99,1.92-2.19,0-4.3-.37-6.29-1.11-1.97-.73-3.79-1.83-5.38-3.27-1.6-1.44-2.92-3.22-3.95-5.31h0c-.82-1.67-1.4-3.56-1.74-5.64h42.43l.18-1.29c.08-.56.12-1.09.12-1.57v-1.15c0-4.11-.59-8.03-1.75-11.66v.02ZM375.09,43.24h-31.26c.32-1.86.83-3.62,1.53-5.23.9-2.07,2.07-3.88,3.47-5.39,1.39-1.49,3.02-2.68,4.85-3.54,1.8-.84,3.79-1.27,5.92-1.27,2.46,0,4.63.46,6.47,1.36,1.85.92,3.44,2.15,4.73,3.66,1.3,1.53,2.33,3.34,3.06,5.4.57,1.6.99,3.28,1.24,5.01h0Z"/><path d="M310.71,62.5c-2.98-5.15-5.68-10.75-8.31-16.19-3.06-6.33-6.22-12.88-9.84-18.78-4.08-6.66-12.62-10.77-21.04-5.74-6.21,3.71-10.39,12.02-4.89,21.5,1.08,1.86,3.15,4.28,5.35,6.84,2.83,3.3,6.35,7.41,6.73,9.43.42,2.28-.49,4.43-2.34,5.47-1.63.92-3.52.69-5.09-.62-4.41-6.73-8.11-14.22-11.69-21.47-2.75-5.56-5.59-11.32-8.74-16.7-2.4-4.11-4.74-7.19-11.01-6.5-3.95.44-7.69,4.57-7.69,8.5v47.95h10.5v-43.15c2.9,4.9,5.5,10.45,8.03,15.85,3.29,7.01,6.69,14.26,10.8,20.24,3.49,5.07,8.1,7.07,12.5,7.07,2.97,0,5.84-.91,8.2-2.4,6.04-3.81,10.08-12.2,4.66-21.6-1.27-2.21-3.39-4.63-5.64-7.2-2.75-3.14-5.59-6.39-6.34-8.76-.85-2.7.55-4.77,2.32-5.62,1.72-.83,4.23-.73,6.08,2.03,4.03,6,7.49,13.25,10.83,20.27,2.9,6.08,5.9,12.37,9.28,17.88,1.72,2.8,4.16,4.65,6.88,5.21,2.39.5,4.83-.05,7.02-1.59,1.78-1.24,3.92-4.53,3.92-6.75V19.72h-10.5v42.76l.02.02Z"/></svg>`;

interface InviteEmailParams {
  recipientName?: string | null;
  recipientEmail: string;
  companyName: string;
  inviteUrl: string;
  invitedByName?: string | null;
  invitedByEmail: string;
}

export function inviteEmail(params: InviteEmailParams): { subject: string; html: string; text: string } {
  const { recipientName, companyName, inviteUrl, invitedByName, invitedByEmail } = params;
  const greeting = recipientName ? `Hi ${recipientName},` : 'Hi,';
  const inviterDisplay = invitedByName || invitedByEmail;

  const subject = `Set up your Perenne Business account for ${companyName}`;

  const text = `${greeting}\n\n${inviterDisplay} has invited you to Perenne Business for ${companyName}.\n\nSet up your account here (link valid for 7 days):\n${inviteUrl}\n\nOnce you set your password, you can sign in any time at https://business.perenne.app/login\n\n— Perenne team`;

  const html = renderEmail({
    title: subject,
    bodyHtml: `
      <h1 style="font-family:Georgia,serif;font-style:italic;font-size:30px;color:#f4f4f5;margin:0 0 20px;font-weight:400;letter-spacing:-0.01em;line-height:1.2;">Welcome to Perenne Business</h1>
      <p style="color:#c1c1c8;font-size:15px;line-height:1.6;margin:0 0 8px;">${escapeHtml(greeting)}</p>
      <p style="color:#c1c1c8;font-size:15px;line-height:1.6;margin:0 0 28px;"><strong style="color:#f4f4f5;">${escapeHtml(inviterDisplay)}</strong> has set up a Perenne Business account for <strong style="color:#f4f4f5;">${escapeHtml(companyName)}</strong>. Click below to choose your password and complete your setup.</p>
    `,
    ctaText: 'Set up my account',
    ctaUrl: inviteUrl,
    footerHtml: `
      <p style="color:#71717a;font-size:12px;line-height:1.6;margin:0 0 8px;">This invite link expires in 7 days. If it expires, ask the person who invited you to send a new one.</p>
      <p style="color:#71717a;font-size:12px;line-height:1.6;margin:0;">If you weren&apos;t expecting this invite, you can ignore this email.</p>
    `,
  });

  return { subject, html, text };
}

interface TeamMemberInviteEmailParams {
  recipientName?: string | null;
  recipientEmail: string;
  companyName: string;
  inviteUrl: string;
  invitedByName?: string | null;
  invitedByEmail: string;
  role: 'ADMIN' | 'VIEWER' | 'OWNER' | 'SUPERADMIN';
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Administrator',
  VIEWER: 'Viewer',
  SUPERADMIN: 'Perenne team member',
};

export function teamMemberInviteEmail(params: TeamMemberInviteEmailParams): { subject: string; html: string; text: string } {
  const { recipientName, companyName, inviteUrl, invitedByName, invitedByEmail, role } = params;
  const greeting = recipientName ? `Hi ${recipientName},` : 'Hi,';
  const inviterDisplay = invitedByName || invitedByEmail;
  const roleLabel = ROLE_LABELS[role] || role;
  const isPerenneTeam = role === 'SUPERADMIN';

  const subject = isPerenneTeam
    ? `You've been invited to the Perenne team`
    : `You've been added to ${companyName} on Perenne Business`;

  const text = `${greeting}\n\n${inviterDisplay} has invited you to ${isPerenneTeam ? 'join the Perenne team' : `${companyName} on Perenne Business`} as a ${roleLabel}.\n\nSet up your account here (link valid for 7 days):\n${inviteUrl}\n\nOnce you set your password, you can sign in any time at https://business.perenne.app/login\n\n— Perenne team`;

  const introHtml = isPerenneTeam
    ? `<p style="color:#c1c1c8;font-size:15px;line-height:1.6;margin:0 0 28px;"><strong style="color:#f4f4f5;">${escapeHtml(inviterDisplay)}</strong> has invited you to join the <strong style="color:#f4f4f5;">Perenne team</strong> as a <strong style="color:#f4f4f5;">${escapeHtml(roleLabel)}</strong>. You&apos;ll have access to manage all customer companies on the platform.</p>`
    : `<p style="color:#c1c1c8;font-size:15px;line-height:1.6;margin:0 0 28px;"><strong style="color:#f4f4f5;">${escapeHtml(inviterDisplay)}</strong> has added you to <strong style="color:#f4f4f5;">${escapeHtml(companyName)}</strong> on Perenne Business as a <strong style="color:#f4f4f5;">${escapeHtml(roleLabel)}</strong>. Choose your password below to access your team workspace.</p>`;

  const html = renderEmail({
    title: subject,
    bodyHtml: `
      <h1 style="font-family:Georgia,serif;font-style:italic;font-size:30px;color:#f4f4f5;margin:0 0 20px;font-weight:400;letter-spacing:-0.01em;line-height:1.2;">${isPerenneTeam ? `Join the Perenne team` : `You're invited to ${escapeHtml(companyName)}`}</h1>
      <p style="color:#c1c1c8;font-size:15px;line-height:1.6;margin:0 0 8px;">${escapeHtml(greeting)}</p>
      ${introHtml}
    `,
    ctaText: 'Set up my account',
    ctaUrl: inviteUrl,
    footerHtml: `
      <p style="color:#71717a;font-size:12px;line-height:1.6;margin:0 0 8px;">This invite link expires in 7 days. If it expires, ask ${escapeHtml(inviterDisplay)} to send a new one.</p>
      <p style="color:#71717a;font-size:12px;line-height:1.6;margin:0;">If you weren&apos;t expecting this invite, you can ignore this email.</p>
    `,
  });

  return { subject, html, text };
}

interface ResetPasswordEmailParams {
  recipientName?: string | null;
  recipientEmail: string;
  resetUrl: string;
}

export function resetPasswordEmail(params: ResetPasswordEmailParams): { subject: string; html: string; text: string } {
  const { recipientName, resetUrl } = params;
  const greeting = recipientName ? `Hi ${recipientName},` : 'Hi,';

  const subject = 'Reset your Perenne Business password';

  const text = `${greeting}\n\nWe received a request to reset the password for your Perenne Business account.\n\nClick here to choose a new password (link valid for 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.\n\n— Perenne team`;

  const html = renderEmail({
    title: subject,
    bodyHtml: `
      <h1 style="font-family:Georgia,serif;font-style:italic;font-size:30px;color:#f4f4f5;margin:0 0 20px;font-weight:400;letter-spacing:-0.01em;line-height:1.2;">Reset your password</h1>
      <p style="color:#c1c1c8;font-size:15px;line-height:1.6;margin:0 0 8px;">${escapeHtml(greeting)}</p>
      <p style="color:#c1c1c8;font-size:15px;line-height:1.6;margin:0 0 28px;">We received a request to reset the password for your Perenne Business account. Click below to choose a new password.</p>
    `,
    ctaText: 'Reset my password',
    ctaUrl: resetUrl,
    footerHtml: `
      <p style="color:#71717a;font-size:12px;line-height:1.6;margin:0 0 8px;">This link expires in 1 hour. If you didn&apos;t request a password reset, you can safely ignore this email — your password won&apos;t change.</p>
    `,
  });

  return { subject, html, text };
}

// ─── Shared layout renderer ────────────────────────────────────────

interface RenderEmailParams {
  title: string;
  bodyHtml: string;
  ctaText: string;
  ctaUrl: string;
  footerHtml?: string;
}

function renderEmail(p: RenderEmailParams): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no" />
  <meta name="color-scheme" content="dark only" />
  <meta name="supported-color-schemes" content="dark only" />
  <title>${escapeHtml(p.title)}</title>
  <style type="text/css">
    /* CRITICAL APPLE MAIL FIX: every layer dark, no white can leak through */
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      height: 100% !important;
      min-height: 100% !important;
      background: #0a0a0f !important;
      background-color: #0a0a0f !important;
    }
    body {
      -webkit-text-size-adjust: 100% !important;
      -ms-text-size-adjust: 100% !important;
      mso-line-height-rule: exactly;
    }
    /* Apple Mail strips link colors — force ours */
    a, a[x-apple-data-detectors] {
      color: inherit !important;
      text-decoration: none !important;
    }
    /* Force dark in all dark-mode-aware clients */
    @media (prefers-color-scheme: dark) {
      html, body, .email-bg, .email-row, .email-cell {
        background: #0a0a0f !important;
        background-color: #0a0a0f !important;
      }
    }
    table { border-collapse: collapse !important; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; -ms-interpolation-mode: bicubic; }
  </style>
</head>
<body bgcolor="#0a0a0f" style="margin:0;padding:0;background:#0a0a0f;background-color:#0a0a0f;width:100%;min-height:100vh;color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">

  <!-- Layer 1: full-bleed wrapper div (acts as belt & suspenders) -->
  <div class="email-bg" style="background:#0a0a0f;background-color:#0a0a0f;width:100%;min-height:100vh;margin:0;padding:0;">

    <!-- Layer 2: outer table 100% width, solid bg only (no gradient — solid color survives stripping) -->
    <table role="presentation" class="email-bg" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#0a0a0f" style="background:#0a0a0f;background-color:#0a0a0f;width:100%;min-width:100%;margin:0;padding:0;border-collapse:collapse;">
      <tr class="email-row" bgcolor="#0a0a0f">
        <td class="email-cell" align="center" valign="top" bgcolor="#0a0a0f" style="background:#0a0a0f;background-color:#0a0a0f;padding:0;margin:0;">

          <!-- Layer 3: gradient overlay table (decorative — falls back to solid #0a0a0f if unsupported) -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#0a0a0f" style="background:#0a0a0f;background-color:#0a0a0f;background-image:radial-gradient(ellipse at 20% 10%, rgba(74,122,140,0.18) 0%, transparent 50%),radial-gradient(ellipse at 80% 90%, rgba(44,88,104,0.15) 0%, transparent 50%);width:100%;min-width:100%;border-collapse:collapse;">
            <tr bgcolor="#0a0a0f">
              <td align="center" valign="top" bgcolor="#0a0a0f" style="background-color:#0a0a0f;padding:48px 20px;">

                <!-- Layer 4: the email card -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%;background-color:rgba(24,24,27,0.92);border:1px solid rgba(255,255,255,0.08);border-radius:24px;">
                  <tr>
                    <td style="padding:36px 40px 12px;">
                      ${LOGO_SVG}
                      <div style="font-family:ui-monospace,'Geist Mono',Menlo,monospace;font-size:10px;color:#71717a;letter-spacing:0.18em;text-transform:uppercase;margin-top:14px;">Perenne · Business portal</div>
                    </td>
                  </tr>
                  <tr><td style="padding:24px 40px 8px;">${p.bodyHtml}</td></tr>
                  <tr>
                    <td align="center" style="padding:0 40px 8px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td align="center" bgcolor="#4a7a8c" style="border-radius:14px;background-color:#4a7a8c;">
                            <a href="${p.ctaUrl}" style="display:inline-block;background-color:#4a7a8c;color:#ffffff;text-decoration:none;font-size:15px;font-weight:500;padding:14px 36px;border-radius:14px;letter-spacing:0.01em;border:1px solid rgba(255,255,255,0.12);">${escapeHtml(p.ctaText)}</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr><td style="padding:28px 40px 36px;">${p.footerHtml ?? ''}</td></tr>
                  <tr>
                    <td style="padding:18px 40px;border-top:1px solid rgba(255,255,255,0.06);background-color:rgba(0,0,0,0.2);border-radius:0 0 24px 24px;">
                      <div style="font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#52525b;letter-spacing:0.16em;text-transform:uppercase;">
                        Perenne Note · branded notebooks for teams
                      </div>
                    </td>
                  </tr>
                </table>

              </td>
            </tr>
          </table>

        </td>
      </tr>
    </table>

  </div>

</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
