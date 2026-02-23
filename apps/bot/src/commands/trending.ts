import { Context, InlineKeyboard } from "grammy";
import { getLinkedUser } from "../db";
import { decryptSecret } from "../encryption";
import { getTrending, type TrendingItem } from "../api";

const SERVICES_SECRET_KEY = process.env.SERVICES_SECRET_KEY ?? "";
const APP_BASE_URL = (process.env.APP_BASE_URL ?? "").replace(/\/$/, "");

function escHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function appLink(mediaType: "movie" | "tv", tmdbId: number): string {
  if (!APP_BASE_URL) return "";
  return `${APP_BASE_URL}/${mediaType}/${tmdbId}`;
}

export async function handleTrending(ctx: Context) {
  const telegramId = String(ctx.from?.id ?? "");
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const linked = await getLinkedUser(telegramId);
  if (!linked) {
    await ctx.reply("❌ Please link your LeMedia account first.\n\nSend /link to get started.");
    return;
  }

  const keyboard = new InlineKeyboard()
    .text("🎬 Movies", "trend:movie")
    .text("📺 TV Shows", "trend:tv");

  await ctx.reply(
    "📈 <b>What's Popular</b>\n\nChoose a category:",
    { parse_mode: "HTML", reply_markup: keyboard }
  );
}

export async function handleTrendingCallback(ctx: Context) {
  const telegramId = String(ctx.from?.id ?? "");
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  await ctx.answerCallbackQuery();

  const data = (ctx.callbackQuery?.data ?? "");

  // Handle category selection: trend:movie or trend:tv
  if (data === "trend:movie" || data === "trend:tv") {
    const mediaType = data === "trend:movie" ? "movie" : "tv";

    const linked = await getLinkedUser(telegramId);
    if (!linked) { await ctx.editMessageText("❌ Session expired. Please /link again."); return; }

    const apiToken = decryptSecret(linked.apiTokenEncrypted, SERVICES_SECRET_KEY);

    let items: TrendingItem[];
    try {
      items = await getTrending(mediaType, apiToken);
    } catch {
      await ctx.editMessageText("❌ Couldn't fetch trending. Please try again.");
      return;
    }

    if (items.length === 0) {
      await ctx.editMessageText("😕 No trending results found.");
      return;
    }

    const lines = items.map((r, i) => {
      const icon = mediaType === "movie" ? "🎬" : "📺";
      const year = r.year ? ` (${r.year})` : "";
      const rating = r.voteAverage ? ` ⭐ ${r.voteAverage}` : "";
      const link = appLink(mediaType, r.id);
      const linkLine = link ? `\n    <a href="${link}">View in LeMedia →</a>` : "";
      return `${i + 1}. ${icon} <b>${escHtml(r.title)}</b>${escHtml(year)}${escHtml(rating)}${linkLine}`;
    });

    await ctx.editMessageText(
      `📈 <b>Trending ${mediaType === "movie" ? "Movies" : "TV Shows"}</b>\n\n${lines.join("\n\n")}`,
      { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
    );
    return;
  }

  if (data === "trend:cancel") {
    await ctx.editMessageText("Cancelled.");
  }
}
