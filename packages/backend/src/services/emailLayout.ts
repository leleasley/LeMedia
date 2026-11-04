function escapeHtml(text: string): string {
  return text
    .replaceAll(/&/g, '&amp;')
    .replaceAll(/</g, '&lt;')
    .replaceAll(/>/g, '&gt;')
    .replaceAll(/"/g, '&quot;');
}

/** Escape for interpolating untrusted strings (site name, display names, emails) into
 *  HTML email bodies. bodyHtml is assembled by callers, so the layout can't escape it
 *  without double-escaping its own tags — callers escape each value at the boundary. */
export { escapeHtml };

export interface EmailLayoutOpts {
  siteName: string;
  siteUrl?: string | null;
  title: string;
  preheader?: string;
  bodyHtml: string;
  cta?: { label: string; href: string };
  footerNote?: string;
}

export function buildEmailHtml(opts: EmailLayoutOpts): string {
  const siteName = escapeHtml(opts.siteName || 'LeMedia');
  const title = escapeHtml(opts.title);
  const preheader = opts.preheader ? escapeHtml(opts.preheader) : '';
  const logoUrl = opts.siteUrl?.trim()
    ? `${opts.siteUrl.trim().replace(/\/+$/, '')}/logo.png`
    : null;

  const ctaHtml = opts.cta
    ? `<p style="margin:24px 0 0"><a href="${escapeHtml(opts.cta.href)}" style="background:#6366f1;color:#ffffff;padding:12px 22px;border-radius:10px;text-decoration:none;display:inline-block;font-weight:600;font-size:14px">${escapeHtml(opts.cta.label)}</a></p><p style="margin:12px 0 0;color:#9ca3af;font-size:12px;line-height:1.6;word-break:break-all">Plain link: ${escapeHtml(opts.cta.href)}</p>`
    : '';

  const footerNote = opts.footerNote
    ? `<p style="margin:20px 0 0;color:#9ca3af;font-size:12px;line-height:1.6">${escapeHtml(opts.footerNote)}</p>`
    : '';

  return `<!doctype html>
<html lang="en" style="margin:0;padding:0">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <style>
    /* iOS / Gmail full-width fix */
    html, body { margin:0 !important; padding:0 !important; width:100% !important; background:#0a0e17 !important; }
    table, td { mso-table-lspace:0pt !important; mso-table-rspace:0pt !important; }
    img { -ms-interpolation-mode:bicubic; }
    @media only screen and (max-width:600px) {
      .email-wrapper { padding:12px 0 !important; }
      .email-container { width:100% !important; max-width:100% !important; border-radius:0 !important; border-left:0 !important; border-right:0 !important; }
      .email-pad { padding-left:20px !important; padding-right:20px !important; }
    }
    /* Dark mode hint for iOS */
    @media (prefers-color-scheme: dark) { body { background:#0a0e17 !important; } }
  </style>
</head>
<body style="margin:0;padding:0;width:100%;background:#0a0e17;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${preheader}&#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847;</div>
  <center role="article" aria-roledescription="email" lang="en" dir="ltr" style="width:100%;background:#0a0e17">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#0a0e17" style="width:100%;background:#0a0e17">
      <tr><td align="center" class="email-wrapper" style="padding:32px 0">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="email-container" style="width:100%;max-width:520px;background:#151a28;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;margin:0 auto">
          <tr><td align="center" class="email-pad" style="padding:28px 24px 0">
            ${logoUrl ? `<img src="${logoUrl}" alt="${siteName}" width="64" height="64" style="width:64px;height:64px;border-radius:14px;display:block;object-fit:contain;background:#0a0e17;padding:6px;border:0;outline:none;text-decoration:none" />` : `<div style="width:64px;height:64px;border-radius:14px;background:#6366f1;color:#fff;display:inline-block;line-height:64px;text-align:center;font-weight:800;font-size:22px">${siteName.charAt(0).toUpperCase()}</div>`}
            <div style="margin-top:12px;color:#ffffff;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.9">${siteName}</div>
          </td></tr>
          <tr><td class="email-pad" style="padding:20px 24px 8px">
            <h1 style="margin:0;color:#ffffff;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:22px;line-height:1.3;font-weight:700">${title}</h1>
          </td></tr>
          <tr><td class="email-pad" style="padding:0 24px 24px;color:#d1d5db;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.7">
            ${opts.bodyHtml}
            ${ctaHtml}
            ${footerNote}
          </td></tr>
          <tr><td class="email-pad" style="padding:16px 24px;border-top:1px solid rgba(255,255,255,0.06);color:#6b7280;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:11px;text-align:center">
            Sent by ${siteName}${opts.siteUrl ? ` · <a href="${escapeHtml(opts.siteUrl.trim())}" style="color:#9ca3af;text-decoration:none">${escapeHtml(opts.siteUrl.trim())}</a>` : ''}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </center>
</body>
</html>`;
}
