/**
 * Email template for code distribution.
 * Sent when a company admin distributes a NotebookCode to a recipient.
 *
 * v38: brand the email with Perenne logo (header + footer wordmark) so
 * the recipient knows what app the code is for, even before reading.
 * Logo is loaded from /api/brand/perenne-logo (public endpoint, 1y
 * cache, served as SVG with CORS open) — works in Apple Mail, Gmail
 * (after "Show images"), Outlook 2019+, iOS Mail. We always set the
 * absolute URL so embedded mail clients can fetch it.
 */

interface CodeEmailParams {
  recipientName: string | null;
  companyName: string;
  code: string;
  expiresLabel?: string | null;
  customMessage?: string | null;
  /**
   * Absolute origin used when building the logo URL. Falls back to
   * https://business.perenne.app if not provided. Caller (the
   * distribute route) can pass req.nextUrl.origin for non-prod envs.
   */
  origin?: string;
}

const DEFAULT_ORIGIN = 'https://business.perenne.app';

export function codeDistributionEmail(p: CodeEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const origin = p.origin?.replace(/\/$/, '') || DEFAULT_ORIGIN;
  const logoExtendedUrl = `${origin}/api/brand/perenne-logo?variant=extended&color=1a1a1a`;
  const logoSymbolUrl = `${origin}/api/brand/perenne-logo?variant=symbol&color=8a8a85`;

  const greeting = p.recipientName ? `Hi ${p.recipientName},` : 'Hi there,';
  const expiry = p.expiresLabel ? `\n\nThis code expires on ${p.expiresLabel}.` : '';
  const customLine = p.customMessage ? `\n${p.customMessage}\n` : '';

  const subject = `Your Perenne Note activation code from ${p.companyName}`;

  const text = `${greeting}

${p.companyName} has issued you a Perenne Note activation code.
${customLine}
To activate Perenne Note on your iPad:

  1. Download Perenne Note from the App Store
  2. Open the app and tap Settings → Team → Activate
  3. Enter this code: ${p.code}

Your iPad will then load the ${p.companyName} branding and design.${expiry}

If you have questions, reach out to your IT administrator at ${p.companyName}.

— The Perenne team`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f0;padding:48px 24px;">
    <tr>
      <td align="center">
        <table role="presentation" width="520" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:16px;padding:40px;max-width:520px;">
          <!-- HEADER: Perenne wordmark -->
          <tr>
            <td style="padding-bottom:32px;border-bottom:1px solid #ececec;">
              <img
                src="${logoExtendedUrl}"
                alt="Perenne note"
                width="180"
                height="22"
                style="display:block;height:22px;width:auto;border:0;outline:0;"
              />
            </td>
          </tr>
          <!-- BODY -->
          <tr>
            <td style="padding-top:32px;">
              <div style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#8a8a85;font-family:'SF Mono',Menlo,monospace;margin-bottom:20px;">
                ${escapeHtml(p.companyName)}
              </div>
              <h1 style="margin:0 0 24px 0;font-size:26px;font-weight:300;line-height:1.3;color:#1a1a1a;">
                ${greeting}
              </h1>
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#3a3a3a;">
                ${escapeHtml(p.companyName)} has issued you a <strong>Perenne Note</strong> activation code.
              </p>
              ${
                p.customMessage
                  ? `<p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#3a3a3a;font-style:italic;border-left:3px solid #d4d4cf;padding-left:16px;">${escapeHtml(
                      p.customMessage
                    )}</p>`
                  : ''
              }
              <div style="background:#1a1a1a;border-radius:12px;padding:32px;text-align:center;margin:32px 0;">
                <div style="font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#8a8a85;font-family:'SF Mono',Menlo,monospace;margin-bottom:12px;">
                  Activation code
                </div>
                <div style="font-family:'SF Mono',Menlo,monospace;font-size:28px;letter-spacing:0.1em;color:#f5f5f0;font-weight:500;">
                  ${escapeHtml(p.code)}
                </div>
              </div>
              <h2 style="margin:32px 0 16px 0;font-size:14px;text-transform:uppercase;letter-spacing:0.18em;color:#8a8a85;font-weight:500;font-family:'SF Mono',Menlo,monospace;">
                How to activate
              </h2>
              <ol style="margin:0 0 24px 0;padding-left:20px;font-size:15px;line-height:1.8;color:#3a3a3a;">
                <li>Download <strong>Perenne Note</strong> from the App Store</li>
                <li>Open the app, tap <strong>Settings → Team → Activate</strong></li>
                <li>Enter the code above</li>
              </ol>
              ${
                p.expiresLabel
                  ? `<p style="margin:0;font-size:13px;color:#8a8a85;">This code expires on <strong>${escapeHtml(
                      p.expiresLabel
                    )}</strong>.</p>`
                  : ''
              }
            </td>
          </tr>
          <!-- FOOTER -->
          <tr>
            <td style="padding-top:32px;border-top:1px solid #ececec;">
              <p style="margin:0 0 16px 0;font-size:13px;color:#8a8a85;line-height:1.6;">
                Questions? Contact your IT administrator at ${escapeHtml(p.companyName)}.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:16px;">
                <tr>
                  <td style="padding-right:8px;vertical-align:middle;">
                    <img
                      src="${logoSymbolUrl}"
                      alt=""
                      width="16"
                      height="10"
                      style="display:block;height:10px;width:auto;border:0;outline:0;opacity:0.6;"
                    />
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="font-size:11px;color:#b5b5b0;font-family:'SF Mono',Menlo,monospace;letter-spacing:0.08em;">
                      THE PERENNE TEAM
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
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
    .replace(/'/g, '&#039;');
}
