/**
 * Employee notebook code email.
 * Sent when a company distributes codes to their team members.
 */
export function codeDistributionEmail(params: {
  recipientName: string | null;
  companyName: string;
  code: string;
  appStoreUrl?: string;
  senderName?: string;
}) {
  const greeting = params.recipientName ? `Hi ${params.recipientName},` : 'Hi,';
  const appLink = params.appStoreUrl ?? 'https://perenne.app/download';
  const sender = params.senderName ?? params.companyName;

  const text = `${greeting}

${sender} has given you a digital notebook — your personal ${params.companyName}-branded notebook inside Perenne Note on iPad.

Here's your activation code:

    ${params.code}

How to activate:
1. Download Perenne Note from the App Store: ${appLink}
2. Open the app and tap Settings → Team
3. Enter the code above and tap Activate
4. Your ${params.companyName} notebook is ready

This code works one time, on one device. Once activated, your notebook is yours for life.

Welcome.
`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Your notebook is ready</title></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#f5f5f0;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0a0a0f;padding:48px 24px;">
    <tr><td align="center">
      <table role="presentation" width="520" cellspacing="0" cellpadding="0" style="max-width:520px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:40px;">
        <tr><td>
          <h1 style="margin:0 0 8px 0;font-family:Georgia,serif;font-style:italic;font-size:26px;font-weight:400;color:#f5f5f0;letter-spacing:-0.02em;">
            Your notebook is ready
          </h1>
          <p style="margin:0 0 32px 0;font-size:11px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.5);">
            From ${escapeHtml(params.companyName)}
          </p>

          <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:rgba(255,255,255,0.85);">
            ${greeting}
          </p>
          <p style="margin:0 0 28px 0;font-size:15px;line-height:1.6;color:rgba(255,255,255,0.85);">
            ${escapeHtml(sender)} has given you a digital notebook — your personal ${escapeHtml(params.companyName)}-branded notebook inside Perenne Note on iPad.
          </p>

          <div style="margin:0 0 32px 0;padding:20px;background:rgba(212,165,116,0.1);border:1px solid rgba(212,165,116,0.3);border-radius:12px;text-align:center;">
            <p style="margin:0 0 8px 0;font-size:10px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;color:rgba(212,165,116,0.8);">
              Activation code
            </p>
            <p style="margin:0;font-family:'SF Mono',Consolas,monospace;font-size:22px;font-weight:600;color:#d4a574;letter-spacing:0.08em;">
              ${params.code}
            </p>
          </div>

          <h2 style="margin:0 0 16px 0;font-size:11px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.5);">How to activate</h2>
          <ol style="margin:0 0 32px 0;padding-left:20px;font-size:14px;line-height:1.8;color:rgba(255,255,255,0.75);">
            <li>Download Perenne Note from the App Store</li>
            <li>Open the app, tap <strong>Settings → Team</strong></li>
            <li>Enter the code above and tap <strong>Activate</strong></li>
            <li>Your ${escapeHtml(params.companyName)} notebook is ready</li>
          </ol>

          <table role="presentation" cellspacing="0" cellpadding="0">
            <tr><td style="background:#d4a574;border-radius:10px;">
              <a href="${appLink}" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:600;color:#1a1309;text-decoration:none;letter-spacing:0.02em;">
                Get Perenne Note →
              </a>
            </td></tr>
          </table>

          <p style="margin:32px 0 0 0;font-size:12px;line-height:1.6;color:rgba(255,255,255,0.4);">
            This code works one time, on one device. Once activated, the notebook is yours for life.
          </p>
        </td></tr>
      </table>
      <p style="margin:24px 0 0 0;font-size:11px;color:rgba(255,255,255,0.25);">
        Perenne Note · Sent on behalf of ${escapeHtml(params.companyName)}
      </p>
    </td></tr>
  </table>
</body></html>`;

  return { text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
