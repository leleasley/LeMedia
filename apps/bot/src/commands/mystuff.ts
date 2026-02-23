import { Context } from "grammy";
import { getLinkedUser } from "../db";
import { decryptSecret } from "../encryption";
import { getMyRequests } from "../api";

const SERVICES_SECRET_KEY = process.env.SERVICES_SECRET_KEY ?? "";
const APP_BASE_URL = (process.env.APP_BASE_URL ?? "").replace(/\/$/, "");

const STATUS_LABELS: Record<string, string> = {
  pending: "⏳ Awaiting approval",
  queued: "📋 Queued",
  submitted: "📤 Submitted",
  downloading: "⬇️ Downloading",
  available: "✅ Available",
  denied: "❌ Denied",
  failed: "⚠️ Failed",
  already_exists: "✅ Already exists"
};

function escHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function handleMyStuff(ctx: Context) {
  const telegramId = String(ctx.from?.id ?? "");

  const linked = await getLinkedUser(telegramId);
  if (!linked) {
    await ctx.reply("❌ Please link your LeMedia account first.\n\nSend /link to get started.");
    return;
  }

  const apiToken = decryptSecret(linked.apiTokenEncrypted, SERVICES_SECRET_KEY);

  let requests;
  try {
    requests = await getMyRequests(apiToken);
  } catch {
    await ctx.reply("❌ Couldn't fetch your requests. Please try again.");
    return;
  }

  if (requests.length === 0) {
    await ctx.reply("You haven't made any requests yet.\n\nUse /request to find something!");
    return;
  }

  const lines = requests.map(r => {
    const type = r.requestType === "movie" ? "🎬" : "📺";
    const status = STATUS_LABELS[r.status] ?? `📌 ${r.status}`;
    const mediaPath = r.requestType === "movie" ? "movie" : "tv";
    const link = APP_BASE_URL && r.tmdbId ? `\n    <a href="${APP_BASE_URL}/${mediaPath}/${r.tmdbId}">View in LeMedia →</a>` : "";
    return `${type} <b>${escHtml(r.title)}</b>\n    ${escHtml(status)}${link}`;
  });

  await ctx.reply(
    `📋 <b>Your Recent Requests</b>\n\n${lines.join("\n\n")}`,
    { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
  );
}
