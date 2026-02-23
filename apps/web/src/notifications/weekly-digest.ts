import "server-only";
import { listWeeklyDigestRecipients } from "@/db";
import { tmdbImageUrl, getUpcomingMoviesAccurateCombined, getUpcomingTvAccurate, getTrendingAll } from "@/lib/tmdb";
import { sendEmail } from "@/notifications/email";
import { createUnsubscribeToken } from "@/lib/unsubscribe";
import { logger } from "@/lib/logger";

const WEEK_DAYS = 7;
const SOON_DAYS = 30;
const MAX_ITEMS = 8;
const MOVIE_PAGES = 3;

type DigestItem = {
  id: number;
  title: string;
  date: string;
  posterUrl: string | null;
  type: "movie" | "tv";
  genres?: string[];
  rating?: number;
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
    type: "movie",
    genres: (item.genre_ids || []).slice(0, 2).map((id: number) => getGenreName(id)),
    rating: item.vote_average ? Math.round(item.vote_average * 10) / 10 : undefined
  };
}

function mapTv(item: any): DigestItem | null {
  if (!item?.id || !item?.name) return null;
  return {
    id: item.id,
    title: item.name,
    date: item.first_air_date,
    posterUrl: tmdbImageUrl(item.poster_path, "w500"),
    type: "tv",
    genres: (item.genre_ids || []).slice(0, 2).map((id: number) => getGenreName(id)),
    rating: item.vote_average ? Math.round(item.vote_average * 10) / 10 : undefined
  };
}

// Map genre IDs to names (common ones)
function getGenreName(id: number): string {
  const genreMap: Record<number, string> = {
    28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
    99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
    27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Sci-Fi",
    10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
    10759: "Action & Adventure", 10762: "Kids", 10763: "News", 10764: "Reality",
    10765: "Sci-Fi & Fantasy", 10766: "Soap", 10767: "Talk", 10768: "War & Politics"
  };
  return genreMap[id] || "";
}

function buildSection(title: string, items: DigestItem[], baseUrl: string, emptyMessage: string) {
  if (!items.length) {
    return `
      <div style="padding:12px 0;color:#94a3b8;font-size:14px;">${emptyMessage}</div>
    `;
  }

  // Build grid with 2 columns for better layout
  const gridItems = items.map((item) => {
    const link = `${baseUrl}/${item.type}/${item.id}`;
    const dateLabel = formatDate(item.date);
    const genreTags = item.genres?.filter(Boolean).map((genre) => 
      `<span style="display:inline-block;padding:3px 8px;background:rgba(168,85,247,0.2);border:1px solid rgba(168,85,247,0.3);border-radius:4px;font-size:10px;color:#c084fc;margin-right:4px;margin-top:4px;">${genre}</span>`
    ).join('') || '';
    const ratingBadge = item.rating ? 
      `<span style="display:inline-block;padding:3px 8px;background:rgba(34,197,94,0.2);border:1px solid rgba(34,197,94,0.3);border-radius:4px;font-size:10px;color:#4ade80;margin-left:4px;">⭐ ${item.rating}</span>` 
      : '';
    return `
      <td style="width:50%;padding:8px;vertical-align:top;" width="50%">
        <table cellpadding="0" cellspacing="0" width="100%" style="background:linear-gradient(135deg, #1e293b 0%, #334155 100%);border-radius:12px;overflow:hidden;border:1px solid rgba(148,163,184,0.1);">
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
              <div style="font-size:12px;color:#94a3b8;margin-bottom:8px;">${dateLabel}${ratingBadge}</div>
              <div style="margin-top:8px;line-height:1.5;">${genreTags}</div>
              <a href="${link}" style="display:inline-block;margin-top:12px;padding:8px 16px;background:linear-gradient(135deg, #9333ea 0%, #7e22ce 100%);color:#ffffff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;border:1px solid rgba(147,51,234,0.3);">View Details</a>
            </td>
          </tr>
        </table>
      </td>
    `;
  });

  // Build rows with 2 items per row
  let rows = "";
  for (let i = 0; i < gridItems.length; i += 2) {
    rows += `<tr>${gridItems[i]}${gridItems[i + 1] || '<td style="width:50%;"></td>'}</tr>`;
  }

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding:0 8px;">
      ${rows}
    </table>
  `;
}

function buildEmailHtml(params: {
  trending: DigestItem[];
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
                      <div style="font-size:16px;font-weight:600;color:#60a5fa;margin-bottom:8px;letter-spacing:0.05em;">Weekly Digest</div>
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
                  <!-- Trending This Week -->
                  <tr>
                    <td style="padding:8px;">
                      <div style="font-size:22px;font-weight:700;background:linear-gradient(135deg, #f59e0b 0%, #ef4444 50%, #ec4899 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:16px;padding:0 8px;">🔥 Trending This Week</div>
                      ${buildSection("Trending", params.trending, params.baseUrl, "No trending content this week.")}
                    </td>
                  </tr>

                  <!-- Divider -->
                  <tr><td style="height:32px;padding:0 8px;"><div style="border-bottom:2px solid rgba(148,163,184,0.2);"></div></td></tr>

                  <!-- Out this week - Movies -->
                  <tr>
                    <td style="padding:8px;">
                      <div style="font-size:20px;font-weight:700;color:#f8fafc;margin-bottom:16px;padding:0 8px;">🎬 Out This Week — Movies</div>
                      ${buildSection("Out this week movies", params.weekMovies, params.baseUrl, "No movies releasing in the next 7 days.")}
                    </td>
                  </tr>

                  <!-- Spacer -->
                  <tr><td style="height:24px;"></td></tr>

                  <!-- Out this week - TV -->
                  <tr>
                    <td style="padding:8px;">
                      <div style="font-size:20px;font-weight:700;color:#f8fafc;margin-bottom:16px;padding:0 8px;">📺 Out This Week — TV</div>
                      ${buildSection("Out this week tv", params.weekTv, params.baseUrl, "No TV releases in the next 7 days.")}
                    </td>
                  </tr>

                  <!-- Divider -->
                  <tr><td style="height:32px;padding:0 8px;"><div style="border-bottom:2px solid rgba(148,163,184,0.2);"></div></td></tr>

                  <!-- Coming soon - Movies -->
                  <tr>
                    <td style="padding:8px;">
                      <div style="font-size:20px;font-weight:700;color:#f8fafc;margin-bottom:16px;padding:0 8px;">🍿 Coming Soon — Movies</div>
                      ${buildSection("Coming soon movies", params.soonMovies, params.baseUrl, "No movies scheduled in the next 30 days.")}
                    </td>
                  </tr>

                  <!-- Spacer -->
                  <tr><td style="height:24px;"></td></tr>

                  <!-- Coming soon - TV -->
                  <tr>
                    <td style="padding:8px;">
                      <div style="font-size:20px;font-weight:700;color:#f8fafc;margin-bottom:16px;padding:0 8px;">📡 Coming Soon — TV</div>
                      ${buildSection("Coming soon tv", params.soonTv, params.baseUrl, "No TV releases scheduled in the next 30 days.")}
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
  trending: DigestItem[];
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
    "LeMedia Weekly Digest",
    "",
    renderList("Trending this week", params.trending),
    renderList("Out this week — Movies", params.weekMovies),
    renderList("Out this week — TV", params.weekTv),
    renderList("Coming soon — Movies", params.soonMovies),
    renderList("Coming soon — TV", params.soonTv),
    "",
    `Unsubscribe: ${params.unsubscribeUrl}`
  ].join("\n");
}

async function buildDigestContent() {
  const moviePages = await Promise.all(
    Array.from({ length: MOVIE_PAGES }, (_, index) => getUpcomingMoviesAccurateCombined(index + 1))
  );
  const movieSeen = new Set<number>();
  const movieResults = moviePages
    .flatMap((page) => page.results ?? [])
    .filter((item: any) => {
      if (!item?.id) return false;
      if (movieSeen.has(item.id)) return false;
      movieSeen.add(item.id);
      return true;
    })
    .sort((a: any, b: any) => String(a.release_date).localeCompare(String(b.release_date)));

  const [tvData, trendingData] = await Promise.all([
    getUpcomingTvAccurate(1),
    getTrendingAll(1)
  ]);

  const movies = movieResults
    .map(mapMovie)
    .filter(Boolean) as DigestItem[];
  const tv = (tvData.results ?? [])
    .map(mapTv)
    .filter(Boolean) as DigestItem[];
  
  // Process trending items (mix of movies and TV)
  const trendingSeen = new Set<string>();
  const trending = (trendingData.results ?? [])
    .filter((item: any) => {
      const key = `${item.media_type}-${item.id}`;
      if (trendingSeen.has(key)) return false;
      trendingSeen.add(key);
      return item.media_type === 'movie' || item.media_type === 'tv';
    })
    .slice(0, 6)
    .map((item: any) => {
      if (item.media_type === 'movie') return mapMovie(item);
      if (item.media_type === 'tv') return mapTv(item);
      return null;
    })
    .filter(Boolean) as DigestItem[];

  const today = new Date();
  const weekEnd = daysFromNow(WEEK_DAYS);
  const soonStart = daysFromNow(WEEK_DAYS + 1);
  const soonEnd = daysFromNow(SOON_DAYS);

  return {
    trending,
    weekMovies: filterByWindow(movies, today, weekEnd).slice(0, MAX_ITEMS),
    weekTv: filterByWindow(tv, today, weekEnd).slice(0, MAX_ITEMS),
    soonMovies: filterByWindow(movies, soonStart, soonEnd).slice(0, MAX_ITEMS),
    soonTv: filterByWindow(tv, soonStart, soonEnd).slice(0, MAX_ITEMS)
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
        subject: "LeMedia Weekly Digest",
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
