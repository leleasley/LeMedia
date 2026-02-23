import { Context, InlineKeyboard } from "grammy";
import { getLinkedUser } from "../db";
import { decryptSecret } from "../encryption";
import { getTrending, searchMedia, type TrendingItem } from "../api";
import { runSearch } from "./request";

const SERVICES_SECRET_KEY = process.env.SERVICES_SECRET_KEY ?? "";
const APP_BASE_URL = (process.env.APP_BASE_URL ?? "").replace(/\/$/, "");

// chatId → trending items for callback
const pendingTrending = new Map<number, TrendingItem[]>();

function escHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

    pendingTrending.set(chatId, items);

    const lines = items.map((r, i) => {
      const icon = mediaType === "movie" ? "🎬" : "📺";
      const year = r.year ? ` (${r.year})` : "";
      const rating = r.voteAverage ? ` ⭐ ${r.voteAverage}` : "";
      return `${i + 1}. ${icon} <b>${escHtml(r.title)}</b>${escHtml(year)}${escHtml(rating)}`;
    });

    const keyboard = new InlineKeyboard();
    for (let i = 0; i < items.length; i++) {
      keyboard.text(`${i + 1}`, `trend:pick:${i}`);
      if ((i + 1) % 4 === 0 || i === items.length - 1) keyboard.row();
    }
    keyboard.text("❌ Cancel", "trend:cancel");

    await ctx.editMessageText(
      `📈 <b>Trending ${mediaType === "movie" ? "Movies" : "TV Shows"}</b>\n\n${lines.join("\n")}\n\n<i>Tap a number to request it:</i>`,
      { parse_mode: "HTML", reply_markup: keyboard }
    );
    return;
  }

  // Handle item pick: trend:pick:{index}
  if (data.startsWith("trend:pick:")) {
    const index = parseInt(data.replace("trend:pick:", ""));
    const items = pendingTrending.get(chatId);

    if (!items || isNaN(index) || index < 0 || index >= items.length) {
      await ctx.editMessageText("❌ Session expired. Use /trending to start again.");
      return;
    }

    const item = items[index];
    pendingTrending.delete(chatId);

    // Close the trending message then run a real search for this title
    await ctx.editMessageText(`🔍 Searching for <b>${escHtml(item.title)}</b>…`, { parse_mode: "HTML" });
    await runSearch(ctx, item.title);
    return;
  }

  if (data === "trend:cancel") {
    pendingTrending.delete(chatId);
    await ctx.editMessageText("Cancelled.");
  }
}
