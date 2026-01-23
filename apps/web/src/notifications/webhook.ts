import { validateExternalServiceUrl } from "@/lib/url-validation";
import { z } from "zod";

const UrlSchema = z.string().trim().url();

export async function sendGenericWebhook(input: { url: string; body: any; headers?: Record<string, string> }) {
  const rawUrl = UrlSchema.parse(input.url);
  const allowHttpRaw = process.env.WEBHOOK_ALLOW_HTTP;
  const allowPrivateIpsRaw = process.env.WEBHOOK_ALLOW_PRIVATE_IPS;
  const allowedCidrsRaw = process.env.WEBHOOK_ALLOWED_CIDRS;
  const allowHttp = allowHttpRaw ? allowHttpRaw === "true" : undefined;
  const allowPrivateIPs = allowPrivateIpsRaw ? allowPrivateIpsRaw === "true" : undefined;
  const allowedCidrs = allowedCidrsRaw ? allowedCidrsRaw.split(",").map(part => part.trim()).filter(Boolean) : undefined;
  const url = validateExternalServiceUrl(rawUrl, "Webhook", {
    allowHttp,
    allowPrivateIPs,
    allowedCidrs,
    requireHttps: !(allowHttpRaw === "true") && process.env.NODE_ENV === "production"
  });

  // Add 10 second timeout for webhook calls
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(input.headers ?? {})
      },
      body: JSON.stringify(input.body ?? {}),
      signal: controller.signal
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Webhook failed: ${res.status} ${res.statusText}${text ? ` - ${text.slice(0, 200)}` : ""}`);
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('Webhook request timed out after 10 seconds');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
