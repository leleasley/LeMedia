import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/auth";
import { createDiscoverPreset, getUserWithHash, listDiscoverPresetsForUser } from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { jsonResponseWithETag } from "@/lib/api-optimization";

const FilterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  z.object({ id: z.number(), name: z.string() }),
]);

const FiltersSchema = z.record(z.string(), FilterValueSchema);

const CreatePresetSchema = z.object({
  mediaType: z.enum(["movie", "tv"]),
  name: z.string().trim().min(1).max(60),
  filters: FiltersSchema,
  alertsEnabled: z.boolean().optional(),
  pinned: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getUser();
    const dbUser = await getUserWithHash(user.username);
    if (!dbUser) return new NextResponse("Unauthorized", { status: 401 });

    const pinnedOnly = req.nextUrl.searchParams.get("pinned") === "1";
    const mediaType = req.nextUrl.searchParams.get("mediaType");
    const presets = await listDiscoverPresetsForUser(dbUser.id, {
      pinnedOnly,
      mediaType: mediaType === "movie" || mediaType === "tv" ? mediaType : undefined,
    });

    return jsonResponseWithETag(req, { presets });
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    const csrf = requireCsrf(req);
    if (csrf) return csrf;
    const dbUser = await getUserWithHash(user.username);
    if (!dbUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = CreatePresetSchema.parse(await req.json());
    const preset = await createDiscoverPreset({
      userId: dbUser.id,
      mediaType: body.mediaType,
      name: body.name,
      filters: body.filters,
      alertsEnabled: body.alertsEnabled,
      pinned: body.pinned,
    });
    return NextResponse.json({ preset }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid preset" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to save preset" }, { status: 500 });
  }
}