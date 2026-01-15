import { z } from "zod";

const UrlSchema = z.string().trim().url();

export async function sendGenericWebhook(input: { url: string; body: any; headers?: Record<string, string> }) {
  const url = UrlSchema.parse(input.url);

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

