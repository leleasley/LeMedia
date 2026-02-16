import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { syncRequestById } from "@/lib/request-sync";
import { clearCache } from "@/lib/local-cache";
import { requireCsrf } from "@/lib/csrf";

type ParamsInput = { requestId: string } | Promise<{ requestId: string }>;

async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as any).then === "function") return await (params as Promise<{ requestId: string }>);
  return params as { requestId: string };
}

export async function POST(req: NextRequest, { params }: { params: ParamsInput }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  if (!user.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const { requestId } = await resolveParams(params);
  if (!requestId) {
    return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
  }

  const summary = await syncRequestById(requestId);
  if (summary.processed === 0 && summary.errors === 0) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  clearCache("recent_requests");

  let message = `Synced ${summary.processed} request(s)`;
  const details: string[] = [];
  if (summary.available) details.push(`available ${summary.available}`);
  if (summary.partiallyAvailable) details.push(`partial ${summary.partiallyAvailable}`);
  if (summary.downloading) details.push(`downloading ${summary.downloading}`);
  if (summary.removed) details.push(`removed ${summary.removed}`);
  if (details.length) message += ` (${details.join(", ")})`;
  if (summary.errors) message += ` [${summary.errors} errors]`;

  return NextResponse.json({ summary, message });
}
