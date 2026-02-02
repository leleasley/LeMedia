import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAvailabilityByTmdbIds, getAvailabilityStatusByTmdbIds } from "@/lib/library-availability";
import { requireUser } from "@/auth";
import { verifyExternalApiKey } from "@/lib/external-api";
import { jsonResponseWithETag } from "@/lib/api-optimization";

const TypeSchema = z.enum(["movie", "tv"]);
const IdsSchema = z
  .string()
  .transform(value =>
    value
      .split(",")
      .map(v => Number(v))
      .filter(n => Number.isFinite(n) && n > 0)
  )
  .refine(list => list.length > 0 && list.length <= 50, "Invalid ids");

export async function GET(req: NextRequest) {
  try {
    const apiKey =
      req.headers.get("x-api-key")
      || req.headers.get("X-Api-Key")
      || req.headers.get("authorization")?.replace(/^Bearer\\s+/i, "")
      || req.nextUrl.searchParams.get("api_key")
      || "";
    const allowPublic = process.env.ALLOW_PUBLIC_AVAILABILITY === "1";
    const apiKeyOk = apiKey ? await verifyExternalApiKey(apiKey) : false;
    if (!apiKeyOk && !allowPublic) {
      const user = await requireUser();
      if (user instanceof NextResponse) return user;
    }
    const type = TypeSchema.parse(req.nextUrl.searchParams.get("type") ?? "");
    const ids = IdsSchema.parse(req.nextUrl.searchParams.get("ids") ?? "");
    const includeStatus = req.nextUrl.searchParams.get("includeStatus") === "1";

    if (includeStatus) {
      const statuses = await getAvailabilityStatusByTmdbIds(type, ids);
      const availability = Object.fromEntries(
        Object.entries(statuses).map(([id, status]) => [id, status !== "unavailable"])
      );
      return jsonResponseWithETag(req, { availability, statuses });
    }

    const availability = await getAvailabilityByTmdbIds(type, ids);
    return jsonResponseWithETag(req, { availability });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return jsonResponseWithETag(req, { error: "Invalid request" }, { status: 400 });
    }
    return jsonResponseWithETag(req, { error: "Availability lookup failed" }, { status: 502 });
  }
}
