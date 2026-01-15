import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { clearRequestsForTmdb } from "@/db";
import { deleteMovie, getMovieByTmdbId } from "@/lib/radarr";
import { requireCsrf } from "@/lib/csrf";

const BodySchema = z.object({
  tmdbId: z.coerce.number().int().positive(),
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
      const movie = await getMovieByTmdbId(body.tmdbId);
      if (!movie?.id) {
        return NextResponse.json({ error: "Movie not found in Radarr" }, { status: 404 });
      }
      await deleteMovie(movie.id, { deleteFiles: true });
      return NextResponse.json({ ok: true });
    }

    await clearRequestsForTmdb("movie", body.tmdbId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
