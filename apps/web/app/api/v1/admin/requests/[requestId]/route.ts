import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { getRequestWithItems } from "@/db";

const requestStatusPriority = [
  "pending",
  "submitted",
  "downloading",
  "partially_available",
  "available",
  "denied",
  "failed",
  "removed",
  "already_exists"
];

const itemStatusPriority = [
  "available",
  "downloading",
  "submitted",
  "pending",
  "denied",
  "failed"
];

function pickStatus(current: string, incoming: string, priority: string[]) {
  const a = priority.indexOf(current);
  const b = priority.indexOf(incoming);
  if (a === -1) return incoming;
  if (b === -1) return current;
  return b < a ? incoming : current;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  if (!user.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { requestId } = await params;
  if (!requestId) {
    return NextResponse.json({ error: "Missing request id" }, { status: 400 });
  }

  const extraIds = (req.nextUrl.searchParams.get("ids") || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const requestIds = Array.from(new Set([requestId, ...extraIds]));
  const rows = (await Promise.all(requestIds.map((id) => getRequestWithItems(id)))).filter(Boolean) as Array<NonNullable<Awaited<ReturnType<typeof getRequestWithItems>>>>;
  if (!rows.length) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const base = rows[0].request;
  let mergedStatus = base.status;
  let mergedReason = base.status_reason ?? null;

  const byEpisode = new Map<string, {
    id: number;
    provider: string;
    providerId: number | null;
    season: number | null;
    episode: number | null;
    status: string;
    createdAt: string;
  }>();
  const itemList: Array<{
    id: number;
    provider: string;
    providerId: number | null;
    season: number | null;
    episode: number | null;
    status: string;
    createdAt: string;
  }> = [];

  for (const row of rows) {
    mergedStatus = pickStatus(mergedStatus, row.request.status, requestStatusPriority);
    if (!mergedReason && row.request.status_reason) mergedReason = row.request.status_reason;
    for (const item of row.items || []) {
      const normalized = {
        id: Number(item.id),
        provider: item.provider,
        providerId: item.provider_id != null ? Number(item.provider_id) : null,
        season: item.season != null ? Number(item.season) : null,
        episode: item.episode != null ? Number(item.episode) : null,
        status: item.status,
        createdAt: item.created_at
      };
      if (normalized.season != null && normalized.episode != null) {
        const key = `${normalized.season}:${normalized.episode}`;
        const existing = byEpisode.get(key);
        if (!existing) {
          byEpisode.set(key, normalized);
        } else {
          existing.status = pickStatus(existing.status, normalized.status, itemStatusPriority);
          existing.providerId = existing.providerId ?? normalized.providerId;
        }
      } else {
        itemList.push(normalized);
      }
    }
  }

  const items = [...itemList, ...Array.from(byEpisode.values())].sort((a, b) => {
    const seasonA = a.season ?? 0;
    const seasonB = b.season ?? 0;
    if (seasonA !== seasonB) return seasonA - seasonB;
    const epA = a.episode ?? 0;
    const epB = b.episode ?? 0;
    return epA - epB;
  });

  const summary = {
    total: items.length,
    pending: items.filter((i) => i.status === "pending").length,
    submitted: items.filter((i) => i.status === "submitted").length,
    downloading: items.filter((i) => i.status === "downloading").length,
    available: items.filter((i) => i.status === "available").length,
    denied: items.filter((i) => i.status === "denied").length,
    failed: items.filter((i) => i.status === "failed").length
  };

  return NextResponse.json({
    request: {
      id: base.id,
      title: base.title,
      requestType: base.request_type,
      status: mergedStatus,
      statusReason: mergedReason,
      tmdbId: Number(base.tmdb_id),
      createdAt: base.created_at,
      requestedBy: base.username
    },
    summary,
    items
  });
}
