import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { deleteMediaIssueById, getMediaIssueById, updateMediaIssueStatus } from "@/db";
import { notifyIssueEvent } from "@/notifications/issue-events";
import { requireCsrf } from "@/lib/csrf";

const ParamsSchema = z.object({ id: z.string().uuid() });
const BodySchema = z.object({ status: z.enum(["resolved"]) });
type ParamsInput = { id: string } | Promise<{ id: string }>;

async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as any).then === "function") return await (params as Promise<{ id: string }>);
  return params as { id: string };
}

export async function PATCH(req: NextRequest, { params }: { params: ParamsInput }) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const parsedParams = ParamsSchema.safeParse(await resolveParams(params));
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid issue id" }, { status: 400 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.warn("[API] Invalid issue status payload", { issues: error.issues });
    } else {
      console.warn("[API] Invalid issue status payload", { error });
    }
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const existing = await getMediaIssueById(parsedParams.data.id);
  if (!existing) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  if (existing.status === body.status) {
    return NextResponse.json({ issue: existing });
  }

  const updated = await updateMediaIssueStatus(existing.id, body.status);
  if (!updated) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  if (body.status === "resolved") {
    const base = process.env.APP_BASE_URL?.trim();
    const url = base
      ? `${base.replace(/\/+$/, "")}/${updated.media_type}/${updated.tmdb_id}`
      : null;
    await notifyIssueEvent("issue_resolved", {
      issueId: updated.id,
      mediaType: updated.media_type,
      tmdbId: updated.tmdb_id,
      title: updated.title,
      category: updated.category,
      description: updated.description,
      username: updated.reporter_username ?? "Unknown",
      userId: updated.reporter_id,
      imageUrl: null,
      url
    });
  }

  return NextResponse.json({ issue: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: ParamsInput }) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const parsedParams = ParamsSchema.safeParse(await resolveParams(params));
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid issue id" }, { status: 400 });
  }

  const existing = await getMediaIssueById(parsedParams.data.id);
  if (!existing) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  await deleteMediaIssueById(existing.id);
  return NextResponse.json({ ok: true });
}
