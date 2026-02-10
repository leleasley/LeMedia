import { NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { listAllUserSessions, deleteUserSessionByJti } from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { z } from "zod";

const DeleteSchema = z.object({
  jti: z.string().trim().min(1)
});

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const sessions = await listAllUserSessions();
  return NextResponse.json({ sessions });
}

export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  const csrf = requireCsrf(req as any);
  if (csrf) return csrf;

  let body: z.infer<typeof DeleteSchema>;
  try {
    body = DeleteSchema.parse(await req.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.warn("[API] Invalid devices payload", { issues: error.issues });
    } else {
      console.warn("[API] Invalid devices payload", { error });
    }
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const sessions = await listAllUserSessions();
  const target = sessions.find(session => session.jti === body.jti);
  if (!target) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (!target.revokedAt) {
    return NextResponse.json({ error: "Only revoked sessions can be deleted" }, { status: 400 });
  }

  const deleted = await deleteUserSessionByJti(body.jti);
  if (!deleted) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
