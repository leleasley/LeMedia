import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { setSeriesMonitoringOption } from "@/lib/sonarr";
import { requireCsrf } from "@/lib/csrf";

const Body = z.object({
  seriesId: z.coerce.number().int().positive(),
  monitoringOption: z.enum([
    "all",
    "future",
    "missing",
    "existing",
    "recent",
    "pilot",
    "firstSeason",
    "lastSeason",
    "monitorSpecials",
    "unmonitorSpecials",
    "none"
  ])
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (user instanceof NextResponse) return user;
    if (!user.isAdmin) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    const body = Body.parse(await req.json());
    await setSeriesMonitoringOption(body.seriesId, body.monitoringOption);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      console.warn("[API] Invalid sonarr monitoring request", { issues: error.issues });
      return NextResponse.json({ ok: false, error: "Invalid request data" }, { status: 400 });
    }
    const message = error?.message ?? String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
