import { Context } from "grammy";
import { getLinkedUser, isUserAdmin } from "../db";
import { decryptSecret } from "../encryption";
import { getServiceHealth, type ServiceDetail } from "../api";
import { answerReleaseDateQuestion, replyFollowingUpdate, runFollowByQuery, runUnfollowByQuery } from "./follow";
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

const FOLLOWING_UPDATE_PATTERNS = [
  /\b(update|summary|status)\b.{0,40}\b(following|follow list)\b/i,
  /\b(show|list|view|check)\b.{0,20}\b(my\s+)?(following|follow list)\b/i,
  /\bwhat(?:'s| is)?\s+in\s+my\s+(following|follow list)\b/i,
  /\bwhat\s+am\s+i\s+following\b/i,
];

const DIGITAL_RELEASE_PATTERNS = [
  /(?:when is|what is|tell me)\s+(?:the\s+)?digital release date\s+(?:for\s+)?(.+)/i,
  /digital release(?: date)?\s+(?:for\s+)?(.+)/i,
];

const RELEASE_PATTERNS = [
  /(?:when is|what is|give me|tell me)\s+(?:the\s+)?release date\s+(?:for\s+)?(.+)/i,
  /release date\s+(?:for\s+)?(.+)/i,
  /(?:do you know\s+)?when\s+will\s+(.+?)\s+(?:be\s+released|come\s+out|be\s+out)/i,
  /when\s+does\s+(.+?)\s+(?:come\s+out|get\s+released|release)/i,
  /when\s+is\s+(.+?)\s+(?:coming\s+out|being\s+released|released)/i,
  /do\s+you\s+know\s+when\s+(.+?)\s+will\s+(?:be\s+released|come\s+out)/i,
  /(?:can you\s+)?(?:check|see)\s+if\s+(.+?)\s+has\s+been\s+released/i,
  /has\s+(.+?)\s+been\s+released/i,
  /is\s+(.+?)\s+released/i,
];

const FOLLOW_PATTERNS = [
  /(?:please\s+)?(?:follow|track|notify me about)\s+(.+)/i,
  /(?:please\s+)?(?:add|put)\s+(.+?)\s+(?:to|into)\s+my\s+(?:following|follow list)/i,
  /(?:please\s+)?(?:add|put)\s+(.+?)\s+to\s+following/i,
];

const UNFOLLOW_PATTERNS = [
  /(?:please\s+)?(?:unfollow|stop following|untrack)\s+(.+)/i,
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

function isFollowingUpdateQuery(text: string): boolean {
  return FOLLOWING_UPDATE_PATTERNS.some(p => p.test(text));
}

function extractFromPatterns(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].replace(/\s*(?:please|for me|thanks?|[?!.]+)\s*$/i, "").trim();
    }
  }
  return null;
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

  const digitalReleaseTitle = extractFromPatterns(text, DIGITAL_RELEASE_PATTERNS);
  if (digitalReleaseTitle) {
    await answerReleaseDateQuestion(ctx, digitalReleaseTitle, { digitalOnly: true });
    return true;
  }

  const releaseTitle = extractFromPatterns(text, RELEASE_PATTERNS);
  if (releaseTitle) {
    await answerReleaseDateQuestion(ctx, releaseTitle);
    return true;
  }

  const unfollowTitle = extractFromPatterns(text, UNFOLLOW_PATTERNS);
  if (unfollowTitle) {
    await runUnfollowByQuery(ctx, unfollowTitle);
    return true;
  }

  const followTitle = extractFromPatterns(text, FOLLOW_PATTERNS);
  if (followTitle) {
    await runFollowByQuery(ctx, followTitle);
    return true;
  }

  if (isFollowingUpdateQuery(text)) {
    await replyFollowingUpdate(ctx);
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
