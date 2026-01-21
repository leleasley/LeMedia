import { NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { syncPendingRequests } from "@/lib/request-sync";
import { clearCache } from "@/lib/local-cache";

export async function POST() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  if (!user.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const summary = await syncPendingRequests();

  // Clear request cache so UI shows updated data
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
