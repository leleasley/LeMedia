import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { requireCsrf } from "@/lib/csrf";
import { getActiveMediaService } from "@/lib/media-services";
import { createRadarrFetcher } from "@/lib/radarr";

export const dynamic = "force-dynamic";

const GrabSchema = z.object({
  mediaType: z.enum(["movie", "tv"]),
  mediaId: z.number().int(),
  guid: z.string().min(1).optional(),
  indexerId: z.number().int().optional(),
  downloadUrl: z.string().url().optional(),
  title: z.string().optional(),
  protocol: z.string().optional()
});

function buildGrabPayload(input: z.infer<typeof GrabSchema>) {
  const payload: Record<string, unknown> = {
    guid: input.guid,
    indexerId: input.indexerId,
    downloadUrl: input.downloadUrl,
    title: input.title,
    protocol: input.protocol,
    movieId: input.mediaType === "movie" ? input.mediaId : undefined,
    seriesId: input.mediaType === "tv" ? input.mediaId : undefined
  };

  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = GrabSchema.safeParse(body);
  if (!parsed.success) {
    console.warn("[API] Invalid upgrade-finder grab payload", { issues: parsed.error.issues });
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (!parsed.data.guid && !parsed.data.downloadUrl) {
    return NextResponse.json({ error: "Missing release identifier" }, { status: 400 });
  }

  try {
    if (parsed.data.mediaType === "movie") {
      const service = await getActiveMediaService("radarr");
      if (!service) return NextResponse.json({ error: "No Radarr service configured" }, { status: 400 });
      const fetcher = createRadarrFetcher(service.base_url, service.apiKey);

      let originalMovie: any = null;
      let originalProfileId: number | null = null;

      // Always use Ultra-HD profile for grabbing from interactive search
      try {
        // Get current movie data
        originalMovie = await fetcher(`/api/v3/movie/${parsed.data.mediaId}`);
        originalProfileId = originalMovie.qualityProfileId;

        // Get all quality profiles
        const profiles = await fetcher("/api/v3/qualityprofile");

        // Find the "Ultra-HD" profile
        const ultraHdProfile = Array.isArray(profiles)
          ? profiles.find((p: any) => p.name === "Ultra-HD")
          : null;

        if (!ultraHdProfile) {
          throw new Error("Ultra-HD quality profile not found in Radarr");
        }

        // Temporarily update the movie to use the "Ultra-HD" profile
        if (originalProfileId !== ultraHdProfile.id) {
          await fetcher(`/api/v3/movie/${parsed.data.mediaId}`, {
            method: "PUT",
            body: JSON.stringify({
              ...originalMovie,
              qualityProfileId: ultraHdProfile.id
            })
          });
        }
      } catch (profileErr: any) {
        throw new Error(`Failed to set Ultra-HD profile: ${profileErr.message}`);
      }

      try {
        // Grab the release
        await fetcher("/api/v3/release", {
          method: "POST",
          body: JSON.stringify(buildGrabPayload(parsed.data))
        });

        // Restore original profile
        if (originalMovie && originalProfileId) {
          try {
            await fetcher(`/api/v3/movie/${parsed.data.mediaId}`, {
              method: "PUT",
              body: JSON.stringify({
                ...originalMovie,
                qualityProfileId: originalProfileId
              })
            });
          } catch (restoreErr) {
            console.warn("Could not restore original quality profile:", restoreErr);
          }
        }

        return NextResponse.json({ ok: true, message: "Release queued successfully" });
      } catch (grabErr: any) {
        // Restore original profile even if grab failed
        if (originalMovie && originalProfileId) {
          try {
            await fetcher(`/api/v3/movie/${parsed.data.mediaId}`, {
              method: "PUT",
              body: JSON.stringify({
                ...originalMovie,
                qualityProfileId: originalProfileId
              })
            });
          } catch (restoreErr) {
            console.warn("Could not restore original quality profile after error:", restoreErr);
          }
        }
        throw grabErr;
      }
    }

    // TV shows are not supported in upgrade finder
    return NextResponse.json({
      error: "Only movies are supported for upgrade finder"
    }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to grab release" }, { status: 500 });
  }
}
