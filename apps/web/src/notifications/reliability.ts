import { logger } from "@/lib/logger";
import { recordNotificationDeliveryAttempt } from "@/db";

export class NotificationDeliverySkipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotificationDeliverySkipError";
  }
}

export type DeliveryResult = {
  status: "success" | "failure" | "skipped";
  attempts: number;
  retries: number;
  error?: string | null;
};

type DeliveryOptions = {
  endpointId: number;
  endpointType: string;
  eventType: string;
  targetUserId?: number | null;
  metadata?: Record<string, unknown>;
  maxRetries?: number;
  baseBackoffMs?: number;
};

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export async function deliverWithReliability(
  options: DeliveryOptions,
  send: () => Promise<void>
): Promise<DeliveryResult> {
  const configuredRetries = Number(process.env.NOTIFICATION_DELIVERY_MAX_RETRIES ?? options.maxRetries ?? 1);
  const maxRetries = Number.isFinite(configuredRetries) ? Math.max(0, Math.floor(configuredRetries)) : 1;
  const baseBackoffMsRaw = Number(process.env.NOTIFICATION_DELIVERY_RETRY_BACKOFF_MS ?? options.baseBackoffMs ?? 600);
  const baseBackoffMs = Number.isFinite(baseBackoffMsRaw) ? Math.max(100, Math.floor(baseBackoffMsRaw)) : 600;
  const totalAttemptsAllowed = maxRetries + 1;
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= totalAttemptsAllowed; attempt += 1) {
    const startedAt = Date.now();
    try {
      await send();
      await recordNotificationDeliveryAttempt({
        endpointId: options.endpointId,
        endpointType: options.endpointType,
        eventType: options.eventType,
        status: "success",
        attemptNumber: attempt,
        durationMs: Date.now() - startedAt,
        targetUserId: options.targetUserId ?? null,
        metadata: options.metadata ?? {},
      });
      return { status: "success", attempts: attempt, retries: Math.max(0, attempt - 1), error: null };
    } catch (error) {
      const isSkip = error instanceof NotificationDeliverySkipError;
      const errorMessage = normalizeError(error);
      lastError = errorMessage;
      await recordNotificationDeliveryAttempt({
        endpointId: options.endpointId,
        endpointType: options.endpointType,
        eventType: options.eventType,
        status: isSkip ? "skipped" : "failure",
        attemptNumber: attempt,
        durationMs: Date.now() - startedAt,
        errorMessage,
        targetUserId: options.targetUserId ?? null,
        metadata: options.metadata ?? {},
      });

      if (isSkip) {
        return { status: "skipped", attempts: attempt, retries: Math.max(0, attempt - 1), error: errorMessage };
      }

      const shouldRetry = attempt < totalAttemptsAllowed;
      if (!shouldRetry) {
        logger.error(
          `[notify] delivery failed endpoint=${options.endpointId} type=${options.endpointType} event=${options.eventType}`,
          error
        );
        return { status: "failure", attempts: attempt, retries: Math.max(0, attempt - 1), error: errorMessage };
      }

      const backoffMs = Math.min(5000, baseBackoffMs * Math.pow(2, attempt - 1));
      await wait(backoffMs);
    }
  }

  return { status: "failure", attempts: totalAttemptsAllowed, retries: maxRetries, error: lastError };
}
