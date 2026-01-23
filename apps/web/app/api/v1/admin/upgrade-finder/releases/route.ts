import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { getUpgradeFinderReleases, mapReleaseToRow } from "@/lib/upgrade-finder";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  mediaType: z.enum(["movie", "tv"]),
  id: z.coerce.number().int()
});

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const parsed = QuerySchema.safeParse({
    mediaType: req.nextUrl.searchParams.get("mediaType"),
    id: req.nextUrl.searchParams.get("id")
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const releases = await getUpgradeFinderReleases(parsed.data.mediaType, parsed.data.id);
    const items = releases.map(mapReleaseToRow);
    return NextResponse.json({ items });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to load releases" }, { status: 500 });
  }
}
