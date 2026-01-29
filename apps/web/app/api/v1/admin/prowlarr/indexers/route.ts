import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { requireCsrf } from "@/lib/csrf";
import { getActiveMediaService } from "@/lib/media-services";
import { createProwlarrFetcher, listProwlarrIndexers } from "@/lib/prowlarr";
import { ServiceHttpError } from "@/lib/fetch-utils";

export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  id: z.coerce.number().int(),
  enable: z.boolean().optional(),
  priority: z.coerce.number().int().optional()
});

export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    const indexers = await listProwlarrIndexers();
    return NextResponse.json({ indexers });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to load indexers" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
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

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const service = await getActiveMediaService("prowlarr");
    if (!service) {
      return NextResponse.json({ error: "No Prowlarr service configured" }, { status: 400 });
    }
    const fetcher = createProwlarrFetcher(service.base_url, service.apiKey);
    const indexer = await fetcher(`/api/v1/indexer/${parsed.data.id}`);
    if (!indexer) {
      return NextResponse.json({ error: "Indexer not found" }, { status: 404 });
    }
    if (!Array.isArray(indexer?.fields)) {
      return NextResponse.json(
        { error: "Prowlarr returned incomplete indexer details; open Prowlarr to edit this indexer." },
        { status: 400 }
      );
    }
    const payload = {
      ...indexer,
      id: parsed.data.id,
      enable: parsed.data.enable ?? indexer.enable,
      priority: parsed.data.priority ?? indexer.priority
    };
    const updated = await fetcher(`/api/v1/indexer/${parsed.data.id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    return NextResponse.json({ indexer: updated ?? payload });
  } catch (err: any) {
    if (err instanceof ServiceHttpError) {
      return NextResponse.json(
        { error: err.message, status: err.status, body: err.body },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: err?.message ?? "Failed to update indexer" }, { status: 500 });
  }
}
