import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { clearRequestsForTmdb } from "@/db";
import { deleteSeries, getSeriesByTmdbId, getSeriesByTvdbId } from "@/lib/sonarr";
import { requireCsrf } from "@/lib/csrf";

const BodySchema = z.object({
  tmdbId: z.coerce.number().int().positive(),
  tvdbId: z.coerce.number().int().positive().optional(),
  action: z.enum(["remove", "clear"])
});

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  try {
    const body = BodySchema.parse(await req.json());
    if (body.action === "remove") {
      const series =
        (body.tvdbId ? await getSeriesByTvdbId(body.tvdbId) : null) ??
        (await getSeriesByTmdbId(body.tmdbId));
      if (!series?.id) {
        return NextResponse.json({ error: "Series not found in Sonarr" }, { status: 404 });
      }
      await deleteSeries(series.id, { deleteFiles: true });
      return NextResponse.json({ ok: true });
    }

    await clearRequestsForTmdb("tv", body.tmdbId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
