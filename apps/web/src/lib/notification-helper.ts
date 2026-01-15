import { createNotification } from "@/db";

type NotificationType = 
  | "request_approved" 
  | "request_denied" 
  | "request_available" 
  | "request_failed"
  | "request_submitted"
  | "request_removed"
  | "issue_comment"
  | "system";

export async function sendUserNotification(params: {
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  metadata?: any;
}): Promise<void> {
  try {
    await createNotification({
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      link: params.link ?? null,
      metadata: params.metadata
    });
  } catch (error) {
    console.error("Failed to create notification:", error);
  }
}

// Helper functions for common notification types
export async function notifyRequestApproved(userId: number, title: string, requestId: string): Promise<void> {
  await sendUserNotification({
    userId,
    type: "request_approved",
    title: "Request Approved",
    message: `Your request for "${title}" has been approved and is being processed`,
    link: `/requests#${requestId}`,
    metadata: { requestId, title }
  });
}

export async function notifyRequestDenied(userId: number, title: string, requestId: string, reason?: string): Promise<void> {
  await sendUserNotification({
    userId,
    type: "request_denied",
    title: "Request Denied",
    message: reason ? `Your request for "${title}" was denied: ${reason}` : `Your request for "${title}" was denied`,
    link: `/requests#${requestId}`,
    metadata: { requestId, title, reason }
  });
}

export async function notifyRequestAvailable(userId: number, title: string, requestId: string, mediaType: "movie" | "tv", tmdbId: number): Promise<void> {
  await sendUserNotification({
    userId,
    type: "request_available",
    title: "Now Available!",
    message: `"${title}" is now available to watch`,
    link: mediaType === "movie" ? `/movie/${tmdbId}` : `/tv/${tmdbId}`,
    metadata: { requestId, title, mediaType, tmdbId }
  });
}

export async function notifyRequestFailed(userId: number, title: string, requestId: string, error?: string): Promise<void> {
  await sendUserNotification({
    userId,
    type: "request_failed",
    title: "Request Failed",
    message: error ? `Your request for "${title}" failed: ${error}` : `Your request for "${title}" failed to process`,
    link: `/requests#${requestId}`,
    metadata: { requestId, title, error }
  });
}

export async function notifyRequestSubmitted(userId: number, title: string, requestId: string): Promise<void> {
  await sendUserNotification({
    userId,
    type: "request_submitted",
    title: "Request Submitted",
    message: `Your request for "${title}" has been submitted to the download server`,
    link: `/requests#${requestId}`,
    metadata: { requestId, title }
  });
}
