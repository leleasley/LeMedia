import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { getDefaultRequestLimits, setSetting } from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";

function parseLimit(value: any) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
}

function parseDays(value: any) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return Math.floor(parsed);
}

export async function GET(req: NextRequest) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;

  const defaults = await getDefaultRequestLimits();
  return jsonResponseWithETag(req, {
    movie: defaults.movie,
    series: defaults.series
  });
}

export async function PUT(req: NextRequest) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const body = await req.json().catch(() => ({}));
  const movie = body?.movie ?? {};
  const series = body?.series ?? {};

  const movieLimit = parseLimit(movie.limit);
  const movieDays = parseDays(movie.days);
  const seriesLimit = parseLimit(series.limit);
  const seriesDays = parseDays(series.days);

  if (movieLimit === null || movieDays === null || seriesLimit === null || seriesDays === null) {
    return NextResponse.json({ error: "Invalid request limit values" }, { status: 400 });
  }

  await setSetting("request_limit_movie", String(movieLimit));
  await setSetting("request_limit_movie_days", String(movieDays));
  await setSetting("request_limit_series", String(seriesLimit));
  await setSetting("request_limit_series_days", String(seriesDays));

  await logAuditEvent({
    action: "admin.settings_changed",
    actor: user.username,
    metadata: {
      section: "user_limits",
      movie: { limit: movieLimit, days: movieDays },
      series: { limit: seriesLimit, days: seriesDays }
    },
    ip: getClientIp(req)
  });

  return NextResponse.json({ ok: true });
}
