import { Context } from "grammy";
import { getLinkedUser, isUserAdmin } from "../db";
import { decryptSecret } from "../encryption";
import { getServiceHealth, type ServiceDetail } from "../api";
import { runSearch } from "./request";

const SERVICES_SECRET_KEY = process.env.SERVICES_SECRET_KEY ?? "";

function escHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Patterns that indicate a service/health check intent
const SERVICE_PATTERNS = [
  /\b(service|services)\b/i,
  /\b(are|is).{0,20}\b(running|working|up|down|fine|ok|okay|good)\b/i,
  /\b(status|health|check)\b.{0,30}\b(service|sonarr|radarr|jellyfin|prowlarr)\b/i,
  /\b(sonarr|radarr|jellyfin|prowlarr)\b.{0,30}\b(status|health|check|running|working|fine|ok)\b/i,
  /everything (running|working|fine|ok|okay|up)\b/i,
  /\b(check).{0,20}\b(service|everything|system|status)\b/i,
];

// Patterns that indicate a media request intent — must have a title after
const REQUEST_PATTERNS = [
  /(?:can (?:i|we|you) (?:request|get|have|watch|add))\s+(.+)/i,
  /(?:i(?:'d| would) like(?: to watch| to get| to request)?)\s+(.+)/i,
  /(?:i want(?: to watch| to see| to request| to get)?)\s+(.+)/i,
  /(?:(?:please |can you )?(?:add|find|get|fetch|request|search for|look up))\s+(.+)/i,
  /(?:looking for|find me|get me)\s+(.+)/i,
  /(?:want to watch)\s+(.+)/i,
];

function extractRequestTitle(text: string): string | null {
  for (const pattern of REQUEST_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      // Strip trailing noise like "please", "for me", "thanks", "?"
      return match[1].replace(/\s*(?:please|for me|thanks?|[?!.]+)\s*$/i, "").trim();
    }
  }
  return null;
}

function isServiceQuery(text: string): boolean {
  return SERVICE_PATTERNS.some(p => p.test(text));
}

async function handleNaturalServices(ctx: Context) {
  const telegramId = String(ctx.from?.id ?? "");

  const linked = await getLinkedUser(telegramId);
  if (!linked) {
    await ctx.reply("❌ Please link your LeMedia account first.\n\nSend /link to get started.");
    return;
  }

  const admin = await isUserAdmin(linked.userId);
  if (!admin) {
    await ctx.reply("⛔ Service status is only available to admins.");
    return;
  }

  const apiToken = decryptSecret(linked.apiTokenEncrypted, SERVICES_SECRET_KEY);

  let services: ServiceDetail[];
  try {
    services = await getServiceHealth(apiToken);
  } catch {
    await ctx.reply("❌ Couldn't fetch service status right now. Please try again.");
    return;
  }

  if (services.length === 0) {
    await ctx.reply("🖥 No services are configured yet.");
    return;
  }

  const healthy = services.filter(s => s.healthy);
  const unhealthy = services.filter(s => !s.healthy);

  let summary: string;
  if (unhealthy.length === 0) {
    summary = `✅ All ${services.length} service${services.length === 1 ? "" : "s"} are running absolutely fine! 🎉`;
  } else if (healthy.length === 0) {
    const names = unhealthy.map(s => `<b>${escHtml(s.name)}</b>`).join(", ");
    summary = `🔴 All services appear to be down: ${names}. You may want to check your setup.`;
  } else {
    const downNames = unhealthy.map(s => `<b>${escHtml(s.name)}</b>`).join(", ");
    const okNames = healthy.map(s => `<b>${escHtml(s.name)}</b>`).join(", ");
    summary =
      `⚠️ ${downNames} ${unhealthy.length === 1 ? "is" : "are"} currently down, ` +
      `but ${okNames} ${healthy.length === 1 ? "is" : "are"} running fine.`;
  }

  // Full breakdown
  const lines = services.map(svc => {
    const icon = svc.healthy ? "🟢" : "🔴";
    return `${icon} ${escHtml(svc.name)}`;
  });

  await ctx.reply(
    `${summary}\n\n<b>Full status:</b>\n${lines.join("\n")}`,
    { parse_mode: "HTML" }
  );
}

/** Handle free-text messages that look like service checks or media requests. Returns true if handled. */
export async function handleNaturalLanguage(ctx: Context): Promise<boolean> {
  const text = (ctx.message?.text ?? "").trim();
  if (!text) return false;

  // Service status check
  if (isServiceQuery(text)) {
    await handleNaturalServices(ctx);
    return true;
  }

  // Media request
  const title = extractRequestTitle(text);
  if (title) {
    await runSearch(ctx, title);
    return true;
  }

  return false;
}
