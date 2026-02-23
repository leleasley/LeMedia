import { Context, InlineKeyboard } from "grammy";
import { getLinkedUser } from "../db";
import { decryptSecret } from "../encryption";
import { searchMedia, requestMovie, requestTv, type SearchResult } from "../api";

const SERVICES_SECRET_KEY = process.env.SERVICES_SECRET_KEY ?? "";
const APP_BASE_URL = (process.env.APP_BASE_URL ?? "").replace(/\/$/, "");

// Users who typed /request with no query — waiting for them to send the title
const awaitingQuery = new Set<string>();

function appLink(mediaType: "movie" | "tv", tmdbId: number): string {
  if (!APP_BASE_URL) return "";
  return `${APP_BASE_URL}/${mediaType}/${tmdbId}`;
}

// In-memory search session state: maps chatId → last search results
const pendingSearches = new Map<number, SearchResult[]>();

function escHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function statusText(r: SearchResult): string {
  if (r.available) return "Already in library";
  if (r.requestStatus === "available") return "Available";
  if (r.requestStatus === "downloading") return "Downloading…";
  if (r.requestStatus === "pending") return "Awaiting approval";
  if (r.requestStatus) return "Requested";
  return "";
}

function formatResult(r: SearchResult, index: number): string {
  const year = r.year ? ` (${r.year})` : "";
  const type = r.mediaType === "movie" ? "🎬" : "📺";
  const rating = r.voteAverage ? ` ⭐ ${r.voteAverage}` : "";
  const status = statusText(r);
  return (
    `${index + 1}. ${type} <b>${escHtml(r.title)}</b>${escHtml(year)}${escHtml(rating)}` +
    (status ? `\n    <i>${escHtml(status)}</i>` : "")
  );
}

export async function handleRequest(ctx: Context) {
  const telegramId = String(ctx.from?.id ?? "");
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const text = ctx.message?.text ?? "";
  const query = text.replace(/^\/(?:request|movie|tv|search)\s*/i, "").trim();

  if (!query) {
    awaitingQuery.add(telegramId);
    await ctx.reply(
      "🎬 What would you like to request?\n\nJust type the movie or TV show name:",
      { parse_mode: "HTML" }
    );
    return;
  }

  await runSearch(ctx, query);
}

/** Check if this user is in the "awaiting query" state. Returns true if handled. */
export async function handleAwaitingQuery(ctx: Context): Promise<boolean> {
  const telegramId = String(ctx.from?.id ?? "");
  if (!awaitingQuery.has(telegramId)) return false;
  awaitingQuery.delete(telegramId);
  const query = (ctx.message?.text ?? "").trim();
  if (!query) {
    await ctx.reply("Please type a movie or TV show name to search for.");
    return true;
  }
  await runSearch(ctx, query);
  return true;
}

/** Core search+display logic — callable from command or natural language handler */
export async function runSearch(ctx: Context, query: string) {
  const telegramId = String(ctx.from?.id ?? "");
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const linked = await getLinkedUser(telegramId);
  if (!linked) {
    await ctx.reply("❌ Please link your LeMedia account first.\n\nSend /link to get started.");
    return;
  }

  const apiToken = decryptSecret(linked.apiTokenEncrypted, SERVICES_SECRET_KEY);

  await ctx.reply(`🔍 Searching for <b>${escHtml(query)}</b>…`, { parse_mode: "HTML" });

  let results: SearchResult[];
  try {
    results = await searchMedia(query, apiToken);
  } catch {
    await ctx.reply("❌ Search failed. Please try again.");
    return;
  }

  if (results.length === 0) {
    await ctx.reply(`😕 No results found for "<b>${escHtml(query)}</b>"\n\nTry a different spelling or title.`, { parse_mode: "HTML" });
    return;
  }

  pendingSearches.set(chatId, results);

  const lines = results.map((r, i) => formatResult(r, i));
  const keyboard = new InlineKeyboard();

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const label = r.available ? `✅ ${i + 1}` : r.requestStatus ? `⏳ ${i + 1}` : `Request ${i + 1}`;
    keyboard.text(label, `req:${i}`);
    if ((i + 1) % 3 === 0 || i === results.length - 1) keyboard.row();
  }
  keyboard.text("❌ Cancel", "req:cancel");

  await ctx.reply(
    lines.join("\n\n") + "\n\n<i>Tap a number to request it:</i>",
    { parse_mode: "HTML", reply_markup: keyboard }
  );
}

export async function handleSearchCallback(ctx: Context) {
  const telegramId = String(ctx.from?.id ?? "");
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  await ctx.answerCallbackQuery();

  const data = ctx.callbackQuery?.data ?? "";
  const indexStr = data.replace("req:", "");

  if (indexStr === "cancel") {
    pendingSearches.delete(chatId);
    await ctx.editMessageText("Request cancelled.");
    return;
  }

  const index = parseInt(indexStr);
  const results = pendingSearches.get(chatId);

  if (!results || isNaN(index) || index < 0 || index >= results.length) {
    await ctx.editMessageText("❌ Session expired. Please search again.");
    return;
  }

  const result = results[index];
  pendingSearches.delete(chatId);

  if (result.available) {
    const link = appLink(result.mediaType, result.id);
    const linkLine = link ? ` <a href="${link}">View in LeMedia →</a>` : "";
    await ctx.editMessageText(
      `✅ <b>${escHtml(result.title)}</b> is already in the library!${linkLine}`,
      { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
    );
    return;
  }

  if (result.requestStatus) {
    const link = appLink(result.mediaType, result.id);
    const linkLine = link ? ` <a href="${link}">View in LeMedia →</a>` : "";
    await ctx.editMessageText(
      `⏳ <b>${escHtml(result.title)}</b> has already been requested.\nStatus: <i>${escHtml(statusText(result))}</i>${linkLine}`,
      { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
    );
    return;
  }

  const linked = await getLinkedUser(telegramId);
  if (!linked) {
    await ctx.editMessageText("❌ Session expired. Please /link your account again.");
    return;
  }

  const apiToken = decryptSecret(linked.apiTokenEncrypted, SERVICES_SECRET_KEY);

  try {
    const res = result.mediaType === "movie"
      ? await requestMovie(result.id, apiToken)
      : await requestTv(result.id, apiToken);

    if (res.message === "already_requested") {
      await ctx.editMessageText(
        `⏳ <b>${escHtml(result.title)}</b> has already been requested.`,
        { parse_mode: "HTML" }
      );
    } else if (res.ok) {
      const type = result.mediaType === "movie" ? "Movie" : "TV Show";
      const year = result.year ? ` (${result.year})` : "";
      const link = appLink(result.mediaType, result.id);
      const linkLine = link ? `\n\n<a href="${link}">View in LeMedia →</a>` : "";
      await ctx.editMessageText(
        `✅ <b>${type} requested!</b>\n\n` +
        `📽 <b>${escHtml(result.title)}${escHtml(year)}</b>\n\n` +
        `You'll be notified when it's available.${linkLine}`,
        { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
      );
    } else {
      await ctx.editMessageText(`❌ Request failed: ${escHtml(res.message)}`);
    }
  } catch {
    await ctx.editMessageText("❌ Something went wrong. Please try again.");
  }
}

