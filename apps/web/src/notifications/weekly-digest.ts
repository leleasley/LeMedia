import "server-only";
import { listWeeklyDigestRecipients } from "@/db";
import { tmdbImageUrl, getUpcomingMoviesAccurateCombined, getUpcomingTvAccurate } from "@/lib/tmdb";
import { sendEmail } from "@/notifications/email";
import { createUnsubscribeToken } from "@/lib/unsubscribe";
import { logger } from "@/lib/logger";

const WEEK_DAYS = 7;
const SOON_DAYS = 30;
const MAX_ITEMS = 8;

type DigestItem = {
  id: number;
  title: string;
  date: string;
  posterUrl: string | null;
  type: "movie" | "tv";
};

function getBaseUrl() {
  const explicit = process.env.APP_BASE_URL?.trim();
  return (explicit || "http://localhost:3010").replace(/\/+$/, "");
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function formatDate(value: string) {
  const date = parseDate(value);
  if (!date) return "TBA";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function filterByWindow(items: DigestItem[], start: Date, end: Date) {
  return items.filter((item) => {
    const date = parseDate(item.date);
    if (!date) return false;
    return date >= start && date <= end;
  });
}

function mapMovie(item: any): DigestItem | null {
  if (!item?.id || !item?.title) return null;
  return {
    id: item.id,
    title: item.title,
    date: item.release_date,
    posterUrl: tmdbImageUrl(item.poster_path, "w500"),
    type: "movie"
  };
}

function mapTv(item: any): DigestItem | null {
  if (!item?.id || !item?.name) return null;
  return {
    id: item.id,
    title: item.name,
    date: item.first_air_date,
    posterUrl: tmdbImageUrl(item.poster_path, "w500"),
    type: "tv"
  };
}

function buildSection(title: string, items: DigestItem[], baseUrl: string) {
  if (!items.length) {
    return `
      <div style="padding:12px 0;color:#94a3b8;font-size:14px;">No ${title.toLowerCase()} items this week.</div>
    `;
  }

  // Build grid with 2 columns for better layout
  const gridItems = items.map((item) => {
    const link = `${baseUrl}/${item.type}/${item.id}`;
    const dateLabel = formatDate(item.date);
    return `
      <td style="width:50%;padding:8px;vertical-align:top;" width="50%">
        <table cellpadding="0" cellspacing="0" width="100%" style="background:#1e293b;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:0;">
              ${item.posterUrl ? `
                <a href="${link}" style="display:block;">
                  <img src="${item.posterUrl}" alt="${item.title}" width="100%" style="display:block;width:100%;height:auto;max-height:280px;object-fit:cover;" />
                </a>
              ` : `<div style="width:100%;height:280px;background:#334155;"></div>`}
            </td>
          </tr>
          <tr>
            <td style="padding:14px;">
              <div style="font-size:15px;font-weight:700;color:#f8fafc;margin-bottom:6px;line-height:1.3;">${item.title}</div>
              <div style="font-size:12px;color:#94a3b8;margin-bottom:12px;">${dateLabel}</div>
              <a href="${link}" style="display:inline-block;padding:8px 16px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none;font-size:13px;font-weight:600;">View Details</a>
            </td>
          </tr>
        </table>
      </td>
    `;
  });

  // Create rows with 2 items each
  let rows = "";
  for (let i = 0; i < gridItems.length; i += 2) {
    const item1 = gridItems[i] || "";
    const item2 = gridItems[i + 1] || `<td style="width:50%;padding:8px;" width="50%"></td>`;
    rows += `<tr>${item1}${item2}</tr>`;
  }

  return `
    <table cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      ${rows}
    </table>
  `;
}

function buildEmailHtml(params: {
  weekMovies: DigestItem[];
  weekTv: DigestItem[];
  soonMovies: DigestItem[];
  soonTv: DigestItem[];
  unsubscribeUrl: string;
  baseUrl: string;
}) {
  const appName = process.env.NEXT_PUBLIC_APP_NAME || "LeMedia";
  const logoUrl = `${params.baseUrl}/login-logo.png`;

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="dark">
    <meta name="supported-color-schemes" content="dark">
    <!--[if mso]>
    <noscript>
      <xml>
        <o:OfficeDocumentSettings>
          <o:PixelsPerInch>96</o:PixelsPerInch>
        </o:OfficeDocumentSettings>
      </xml>
    </noscript>
    <![endif]-->
  </head>
  <body style="margin:0;padding:0;background:#0b1220;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0b1220;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:680px;margin:0 auto;background:#111827;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">

            <!-- Header with Logo -->
            <tr>
              <td style="padding:32px 24px;background:linear-gradient(135deg,#0f172a,#1e293b);text-align:center;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td align="center">
                      <img src="${logoUrl}" alt="${appName}" width="64" height="64" style="display:block;margin:0 auto 16px;border-radius:12px;" />
                      <div style="font-size:28px;font-weight:700;color:#f8fafc;margin-bottom:8px;line-height:1.2;">${appName}</div>
                      <div style="font-size:16px;font-weight:600;color:#60a5fa;margin-bottom:8px;letter-spacing:0.05em;">Weekly Coming Soon</div>
                      <div style="font-size:14px;color:#94a3b8;line-height:1.5;max-width:480px;margin:0 auto;">Discover the latest movies and TV shows releasing this week and beyond.</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Content -->
            <tr>
              <td style="padding:24px 16px;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                  <!-- Out this week - Movies -->
                  <tr>
                    <td style="padding:8px;">
                      <div style="font-size:20px;font-weight:700;color:#f8fafc;margin-bottom:16px;padding:0 8px;">🎬 Out This Week — Movies</div>
                      ${buildSection("Out this week movies", params.weekMovies, params.baseUrl)}
                    </td>
                  </tr>

                  <!-- Spacer -->
                  <tr><td style="height:24px;"></td></tr>

                  <!-- Out this week - TV -->
                  <tr>
                    <td style="padding:8px;">
                      <div style="font-size:20px;font-weight:700;color:#f8fafc;margin-bottom:16px;padding:0 8px;">📺 Out This Week — TV</div>
                      ${buildSection("Out this week tv", params.weekTv, params.baseUrl)}
                    </td>
                  </tr>

                  <!-- Divider -->
                  <tr><td style="height:32px;padding:0 8px;"><div style="border-bottom:2px solid rgba(148,163,184,0.2);"></div></td></tr>

                  <!-- Coming soon - Movies -->
                  <tr>
                    <td style="padding:8px;">
                      <div style="font-size:20px;font-weight:700;color:#f8fafc;margin-bottom:16px;padding:0 8px;">🍿 Coming Soon — Movies</div>
                      ${buildSection("Coming soon movies", params.soonMovies, params.baseUrl)}
                    </td>
                  </tr>

                  <!-- Spacer -->
                  <tr><td style="height:24px;"></td></tr>

                  <!-- Coming soon - TV -->
                  <tr>
                    <td style="padding:8px;">
                      <div style="font-size:20px;font-weight:700;color:#f8fafc;margin-bottom:16px;padding:0 8px;">📡 Coming Soon — TV</div>
                      ${buildSection("Coming soon tv", params.soonTv, params.baseUrl)}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:24px;background:#0f172a;border-top:1px solid rgba(148,163,184,0.15);">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td align="center">
                      <div style="font-size:13px;color:#94a3b8;margin-bottom:16px;line-height:1.6;">
                        You're receiving this because you opted in to weekly release digests.
                      </div>
                      <a href="${params.unsubscribeUrl}" style="display:inline-block;padding:10px 20px;border-radius:8px;background:#1e293b;border:1px solid rgba(148,163,184,0.3);color:#e2e8f0;text-decoration:none;font-weight:600;font-size:13px;">Unsubscribe</a>
                      <div style="font-size:12px;color:#64748b;margin-top:16px;">
                        © ${new Date().getFullYear()} ${appName} • Weekly Digest
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
  </body>
  </html>`;
}

function buildTextDigest(params: {
  weekMovies: DigestItem[];
  weekTv: DigestItem[];
  soonMovies: DigestItem[];
  soonTv: DigestItem[];
  unsubscribeUrl: string;
  baseUrl: string;
}) {
  const renderList = (title: string, items: DigestItem[]) => {
    if (!items.length) return `${title}: None\n`;
    const lines = items
      .map((item) => `- ${item.title} (${formatDate(item.date)}) - ${params.baseUrl}/${item.type}/${item.id}`)
      .join("\n");
    return `${title}:\n${lines}\n`;
  };
  return [
    "LeMedia Weekly Coming Soon",
    "",
    renderList("Out this week — Movies", params.weekMovies),
    renderList("Out this week — TV", params.weekTv),
    renderList("Coming soon — Movies", params.soonMovies),
    renderList("Coming soon — TV", params.soonTv),
    "",
    `Unsubscribe: ${params.unsubscribeUrl}`
  ].join("\n");
}

async function buildDigestContent() {
  const [movieData, tvData] = await Promise.all([
    getUpcomingMoviesAccurateCombined(1),
    getUpcomingTvAccurate(1)
  ]);

  const movies = (movieData.results ?? [])
    .map(mapMovie)
    .filter(Boolean) as DigestItem[];
  const tv = (tvData.results ?? [])
    .map(mapTv)
    .filter(Boolean) as DigestItem[];

  const today = new Date();
  const weekEnd = daysFromNow(WEEK_DAYS);
  const soonEnd = daysFromNow(SOON_DAYS);

  return {
    weekMovies: filterByWindow(movies, today, weekEnd).slice(0, MAX_ITEMS),
    weekTv: filterByWindow(tv, today, weekEnd).slice(0, MAX_ITEMS),
    soonMovies: filterByWindow(movies, weekEnd, soonEnd).slice(0, MAX_ITEMS),
    soonTv: filterByWindow(tv, weekEnd, soonEnd).slice(0, MAX_ITEMS)
  };
}

export async function sendWeeklyDigest() {
  const baseUrl = getBaseUrl();
  const [digestContent, recipients] = await Promise.all([
    buildDigestContent(),
    listWeeklyDigestRecipients()
  ]);

  if (!recipients.length) {
    logger.info("[Job] weekly-digest skipped: no recipients");
    return;
  }

  const failures: Array<{ userId: number; error: string }> = [];
  const expiresAt = daysFromNow(90);

  for (const user of recipients) {
    try {
      const token = createUnsubscribeToken(user.id, expiresAt);
      const unsubscribeUrl = `${baseUrl}/unsubscribe/${encodeURIComponent(token)}`;
      const html = buildEmailHtml({
        ...digestContent,
        unsubscribeUrl,
        baseUrl
      });
      const text = buildTextDigest({
        ...digestContent,
        unsubscribeUrl,
        baseUrl
      });
      await sendEmail({
        to: user.email,
        subject: "LeMedia Weekly Digest — Coming Soon",
        text,
        html
      });
    } catch (error: any) {
      failures.push({ userId: user.id, error: error?.message ?? "Failed to send" });
    }
  }

  if (failures.length) {
    logger.error(`[Job] weekly-digest failures: ${failures.length}`);
    throw new Error(`Failed to send ${failures.length} digest emails`);
  }
}

export async function sendWeeklyDigestPreview(user: { id: number; email: string }) {
  const baseUrl = getBaseUrl();
  const digestContent = await buildDigestContent();
  const expiresAt = daysFromNow(90);
  const token = createUnsubscribeToken(user.id, expiresAt);
  const unsubscribeUrl = `${baseUrl}/unsubscribe/${encodeURIComponent(token)}`;
  const html = buildEmailHtml({
    ...digestContent,
    unsubscribeUrl,
    baseUrl
  });
  const text = buildTextDigest({
    ...digestContent,
    unsubscribeUrl,
    baseUrl
  });

  await sendEmail({
    to: user.email,
    subject: "LeMedia Weekly Digest — Test Email",
    text,
    html
  });
}
