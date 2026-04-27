import { Resend } from 'resend';
import { env } from './env';

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

/**
 * Send an email via Resend.
 * In dev without RESEND_API_KEY, logs to console instead (useful for local dev).
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!resend) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 EMAIL (dev mode, no RESEND_API_KEY set)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`To:      ${params.to}`);
    console.log(`Subject: ${params.subject}`);
    console.log('---');
    console.log(params.text ?? params.html.replace(/<[^>]+>/g, ''));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    return { ok: true, id: 'dev-log' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });
    if (error) {
      console.error('Resend error:', error);
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data?.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown email error';
    console.error('Email send failed:', msg);
    return { ok: false, error: msg };
  }
}

// ─── Templates ────────────────────────────────────────────────

/**
 * Magic link login email. Minimal, on-brand, works in plain-text clients too.
 */
export function magicLinkEmail(params: {
  recipientName: string | null;
  url: string;
  expiresInMinutes: number;
}) {
  const greeting = params.recipientName ? `Hi ${params.recipientName},` : 'Hi there,';
  const text = `${greeting}

Here's your sign-in link for Perenne Business:

${params.url}

This link will expire in ${params.expiresInMinutes} minutes and can only be used once.

If you didn't request this, ignore this email.

— Perenne`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Your sign-in link</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#f5f5f0;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0a0a0f;padding:48px 24px;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellspacing="0" cellpadding="0" style="max-width:480px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:40px;">
          <tr>
            <td>
              <h1 style="margin:0 0 8px 0;font-family:Georgia,serif;font-style:italic;font-size:28px;font-weight:400;color:#f5f5f0;letter-spacing:-0.02em;">
                Perenne Business
              </h1>
              <p style="margin:0 0 32px 0;font-size:11px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.5);">
                Sign in
              </p>
              <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:rgba(255,255,255,0.85);">
                ${greeting}
              </p>
              <p style="margin:0 0 32px 0;font-size:15px;line-height:1.6;color:rgba(255,255,255,0.85);">
                Click the button below to sign in to your Perenne Business account.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="background:#d4a574;border-radius:10px;">
                    <a href="${params.url}" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:600;color:#1a1309;text-decoration:none;letter-spacing:0.02em;">
                      Sign in to Perenne Business →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:32px 0 0 0;font-size:12px;line-height:1.6;color:rgba(255,255,255,0.4);">
                This link expires in ${params.expiresInMinutes} minutes and can only be used once.
                If you didn't request this, you can safely ignore this email.
              </p>
              <p style="margin:24px 0 0 0;font-size:11px;color:rgba(255,255,255,0.3);font-family:'SF Mono',Consolas,monospace;word-break:break-all;">
                ${params.url}
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:24px 0 0 0;font-size:11px;color:rgba(255,255,255,0.25);">
          Perenne Note · Nima Sport Sagl · Poschiavo, Switzerland
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { text, html };
}
