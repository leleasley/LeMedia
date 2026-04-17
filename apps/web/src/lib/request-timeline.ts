import { listRequestTimelineSnapshots, type RequestLifecycleEventType } from "@/db";

export type RequestTimelineEntry = {
  id: string;
  type: RequestLifecycleEventType | "requested";
  label: string;
  detail?: string;
  createdAt: string;
  exact: boolean;
};

type TimelineRequestShape = {
  id: string;
  request_type: string;
  tmdb_id: number;
  status: string;
  created_at: string;
};

function eventLabel(type: RequestLifecycleEventType | "requested") {
  switch (type) {
    case "requested":
      return "Requested";
    case "auto_approved":
      return "Auto-approved";
    case "submitted_to_service":
      return "Sent to service";
    case "downloading":
      return "Grabbed and downloading";
    case "partially_available":
      return "Partially available";
    case "available":
      return "Available";
    case "already_exists":
      return "Already in library";
    case "denied":
      return "Denied";
    case "failed":
      return "Sync failed";
    case "removed":
      return "Removed";
    case "issue_reported":
      return "Issue reported";
  }
}

function pushOnce(target: RequestTimelineEntry[], seen: Set<string>, entry: RequestTimelineEntry) {
  if (seen.has(entry.type)) return;
  seen.add(entry.type);
  target.push(entry);
}

export async function attachRequestTimelines<T extends TimelineRequestShape>(requests: T[]): Promise<Array<T & { timeline: RequestTimelineEntry[] }>> {
  const snapshots = await listRequestTimelineSnapshots(
    requests.map((request) => ({
      id: request.id,
      request_type: request.request_type,
      tmdb_id: request.tmdb_id,
      created_at: request.created_at,
    }))
  );

  return requests.map((request) => {
    const snapshot = snapshots.get(request.id) ?? { items: [], events: [], issues: [] };
    const timeline: RequestTimelineEntry[] = [];
    const seen = new Set<string>();

    pushOnce(timeline, seen, {
      id: `${request.id}:requested`,
      type: "requested",
      label: eventLabel("requested"),
      createdAt: request.created_at,
      exact: true,
    });

    for (const event of snapshot.events) {
      pushOnce(timeline, seen, {
        id: `${request.id}:${event.eventType}:${event.createdAt}`,
        type: event.eventType,
        label: eventLabel(event.eventType),
        detail:
          event.eventType === "issue_reported"
            ? typeof event.metadata.category === "string"
              ? `${event.metadata.category} issue`
              : undefined
            : typeof event.metadata.reason === "string"
              ? event.metadata.reason
              : undefined,
        createdAt: event.createdAt,
        exact: true,
      });
    }

    if (!seen.has("submitted_to_service") && ["submitted", "downloading", "partially_available", "available", "already_exists", "removed"].includes(request.status)) {
      pushOnce(timeline, seen, {
        id: `${request.id}:submitted:fallback`,
        type: "submitted_to_service",
        label: eventLabel("submitted_to_service"),
        detail: "Older request: exact submission time was not recorded.",
        createdAt: request.created_at,
        exact: false,
      });
    }

    if (!seen.has("downloading") && request.status === "downloading") {
      pushOnce(timeline, seen, {
        id: `${request.id}:downloading:fallback`,
        type: "downloading",
        label: eventLabel("downloading"),
        detail: "Older request: exact grab time was not recorded.",
        createdAt: request.created_at,
        exact: false,
      });
    }

    if (!seen.has("partially_available") && request.status === "partially_available") {
      pushOnce(timeline, seen, {
        id: `${request.id}:partial:fallback`,
        type: "partially_available",
        label: eventLabel("partially_available"),
        detail: "Availability was inferred from the current library state.",
        createdAt: request.created_at,
        exact: false,
      });
    }

    const terminalStatus = request.status === "available"
      ? "available"
      : request.status === "already_exists"
        ? "already_exists"
        : request.status === "denied"
          ? "denied"
          : request.status === "failed"
            ? "failed"
            : request.status === "removed"
              ? "removed"
              : null;

    if (terminalStatus && !seen.has(terminalStatus)) {
      pushOnce(timeline, seen, {
        id: `${request.id}:${terminalStatus}:fallback`,
        type: terminalStatus,
        label: eventLabel(terminalStatus),
        detail: terminalStatus === "available" ? "Availability was inferred from the current library state." : undefined,
        createdAt: request.created_at,
        exact: false,
      });
    }

    for (const issue of snapshot.issues) {
      pushOnce(timeline, seen, {
        id: `${request.id}:issue:${issue.id}`,
        type: "issue_reported",
        label: eventLabel("issue_reported"),
        detail: `${issue.category} issue`,
        createdAt: issue.createdAt,
        exact: true,
      });
    }

    timeline.sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());

    return {
      ...request,
      timeline,
    };
  });
}