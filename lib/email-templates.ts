/**
 * HTML email templates for Perenne Business.
 * Plain inline-styled markup that renders well across mail clients.
 */

interface OwnerInviteParams {
  companyName: string;
  ownerName?: string | null;
  magicLinkUrl: string;
  invitedBy: string;
}

export function ownerInviteEmail(params: OwnerInviteParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { companyName, ownerName, magicLinkUrl, invitedBy } = params;
  const greeting = ownerName ? `Hi ${ownerName},` : 'Hi,';

  const subject = `Welcome to Perenne Business — your ${companyName} account is ready`;

  const text = `${greeting}

${invitedBy} from Perenne has set up a Business account for ${companyName}.

You can sign in here (link valid for 15 minutes):
${magicLinkUrl}

After this first sign-in, you can request a fresh link any time at https://business.perenne.app/login

— Perenne team`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#f4f4f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 20px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#18181b;border:1px solid rgba(255,255,255,0.08);border-radius:24px;overflow:hidden;">
        <tr><td style="padding:40px 40px 0;">
          <div style="font-size:11px;font-family:ui-monospace,monospace;color:#71717a;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:24px;">Perenne Business</div>
          <h1 style="font-family:Georgia,serif;font-style:italic;font-size:28px;color:#f4f4f5;margin:0 0 16px;font-weight:400;">Welcome to ${escapeHtml(companyName)}</h1>
          <p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 8px;">${escapeHtml(greeting)}</p>
          <p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 32px;">${escapeHtml(invitedBy)} from Perenne has set up a Business account for <strong style="color:#f4f4f5;">${escapeHtml(companyName)}</strong>. Click the button below to sign in for the first time.</p>
        </td></tr>
        <tr><td align="center" style="padding:0 40px;">
          <a href="${magicLinkUrl}" style="display:inline-block;background:#4a7a8c;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:14px 32px;border-radius:16px;letter-spacing:0.02em;">Sign in to Perenne Business</a>
        </td></tr>
        <tr><td style="padding:32px 40px 40px;">
          <p style="color:#71717a;font-size:12px;line-height:1.6;margin:0 0 8px;">This link expires in 15 minutes and can only be used once. If it expires, request a new one at <a href="https://business.perenne.app/login" style="color:#5a92a8;">business.perenne.app/login</a>.</p>
          <p style="color:#71717a;font-size:12px;line-height:1.6;margin:0;">If you weren&apos;t expecting this email, you can safely ignore it.</p>
        </td></tr>
        <tr><td style="padding:24px 40px;border-top:1px solid rgba(255,255,255,0.06);">
          <div style="font-family:ui-monospace,monospace;font-size:10px;color:#52525b;letter-spacing:0.15em;text-transform:uppercase;">Perenne Note · Business portal</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
