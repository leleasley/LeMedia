import { Context, InlineKeyboard } from "grammy";
import { searchMedia } from "../api";
import {
  disableAllWatchAlerts,
  disableWatchAlertById,
  getLinkedUser,
  listActiveWatchAlerts,
  upsertWatchAlert,
} from "../db";
import { decryptSecret } from "../encryption";
import {
  consumeAwaitingWatchQuery,
  clearPendingWatchSearch,
  getLastSelected,
  getPendingWatchSearch,
  setAwaitingWatchQuery,
  setPendingWatchSearch,
} from "../state";

const SERVICES_SECRET_KEY = process.env.SERVICES_SECRET_KEY ?? "";

function escHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function normalizeWatchQuery(text: string): string {
  return text.replace(/^\/watch\s*/i, "").trim();
}

async function requireLinked(ctx: Context) {
  const telegramId = String(ctx.from?.id ?? "");
  const linked = await getLinkedUser(telegramId);
  if (!linked) {
    await ctx.reply("❌ Please link your LeMedia account first.\n\nSend /link to get started.");
    return null;
  }
  const apiToken = decryptSecret(linked.apiTokenEncrypted, SERVICES_SECRET_KEY);
  return { telegramId, linked, apiToken };
}

async function saveAlert(ctx: Context, params: {
  telegramId: string;
  userId: number;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  alreadyAvailable: boolean;
  requestStatus: string | null;
}) {
  if (params.alreadyAvailable || params.requestStatus === "available") {
    await ctx.reply(
      `✅ <b>${escHtml(params.title)}</b> is already available, so no alert is needed.`,
      { parse_mode: "HTML" }
    );
    return;
  }

  const { created } = await upsertWatchAlert({
    telegramId: params.telegramId,
    userId: params.userId,
    mediaType: params.mediaType,
    tmdbId: params.tmdbId,
    title: params.title,
  });

  await ctx.reply(
    created
      ? `🔔 Alert saved for <b>${escHtml(params.title)}</b>. I’ll message you when it’s available.`
      : `🔁 Alert was already set for <b>${escHtml(params.title)}</b> and remains active.`,
    { parse_mode: "HTML" }
  );
}

export async function handleWatch(ctx: Context) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const linkedCtx = await requireLinked(ctx);
  if (!linkedCtx) return;

  const raw = ctx.message?.text ?? "";
  const query = normalizeWatchQuery(raw);

  if (!query || /^(this|that)$/i.test(query) || /alert me when available/i.test(query)) {
    const last = await getLastSelected(chatId);
    if (!last) {
      await setAwaitingWatchQuery(linkedCtx.telegramId);
      await ctx.reply(
        "🔔 What would you like to put on your watchlist?"
      );
      return;
    }

    await saveAlert(ctx, {
      telegramId: linkedCtx.telegramId,
      userId: linkedCtx.linked.userId,
      mediaType: last.mediaType,
      tmdbId: last.id,
      title: last.title,
      alreadyAvailable: last.available,
      requestStatus: last.requestStatus,
    });
    return;
  }

  await ctx.reply(`🔍 Searching for <b>${escHtml(query)}</b> to set an alert…`, { parse_mode: "HTML" });

  let results;
  try {
    results = await searchMedia(query, linkedCtx.apiToken);
  } catch {
    await ctx.reply("❌ Search failed. Please try again.");
    return;
  }

  if (results.length === 0) {
    await ctx.reply(`😕 No results found for "<b>${escHtml(query)}</b>".`, { parse_mode: "HTML" });
    return;
  }

  const picks = results.slice(0, 5);
  await setPendingWatchSearch(chatId, picks);

  const lines = picks.map((item, index) => {
    const icon = item.mediaType === "movie" ? "🎬" : "📺";
    const year = item.year ? ` (${item.year})` : "";
    const status = item.available || item.requestStatus === "available"
      ? " — ✅ already available"
      : "";
    return `${index + 1}. ${icon} <b>${escHtml(item.title)}</b>${escHtml(year)}${escHtml(status)}`;
  });

  const keyboard = new InlineKeyboard();
  for (let i = 0; i < picks.length; i++) {
    keyboard.text(`Alert ${i + 1}`, `watchpick:${i}`);
    if ((i + 1) % 2 === 0 || i === picks.length - 1) keyboard.row();
  }
  keyboard.text("❌ Cancel", "watchpick:cancel");

  await ctx.reply(
    `🔔 <b>Set availability alert</b>\n\n${lines.join("\n")}\n\n<i>Tap an item to alert when available:</i>`,
    { parse_mode: "HTML", reply_markup: keyboard }
  );
}

export async function handleAwaitingWatchQuery(ctx: Context): Promise<boolean> {
  const telegramId = String(ctx.from?.id ?? "");
  const awaiting = await consumeAwaitingWatchQuery(telegramId);
  if (!awaiting) return false;

  const text = (ctx.message?.text ?? "").trim();
  if (!text) {
    await ctx.reply("🔔 What would you like to put on your watchlist?");
    return true;
  }

  const linkedCtx = await requireLinked(ctx);
  if (!linkedCtx) return true;

  await ctx.reply(`🔍 Searching for <b>${escHtml(text)}</b> to set an alert…`, { parse_mode: "HTML" });

  let results;
  try {
    results = await searchMedia(text, linkedCtx.apiToken);
  } catch {
    await ctx.reply("❌ Search failed. Please try again.");
    return true;
  }

  if (results.length === 0) {
    await ctx.reply(`😕 No results found for "<b>${escHtml(text)}</b>".`, { parse_mode: "HTML" });
    return true;
  }

  const chatId = ctx.chat?.id;
  if (!chatId) return true;

  const picks = results.slice(0, 5);
  await setPendingWatchSearch(chatId, picks);

  const lines = picks.map((item, index) => {
    const icon = item.mediaType === "movie" ? "🎬" : "📺";
    const year = item.year ? ` (${item.year})` : "";
    const status = item.available || item.requestStatus === "available"
      ? " — ✅ already available"
      : "";
    return `${index + 1}. ${icon} <b>${escHtml(item.title)}</b>${escHtml(year)}${escHtml(status)}`;
  });

  const keyboard = new InlineKeyboard();
  for (let i = 0; i < picks.length; i++) {
    keyboard.text(`Alert ${i + 1}`, `watchpick:${i}`);
    if ((i + 1) % 2 === 0 || i === picks.length - 1) keyboard.row();
  }
  keyboard.text("❌ Cancel", "watchpick:cancel");

  await ctx.reply(
    `🔔 <b>Set availability alert</b>\n\n${lines.join("\n")}\n\n<i>Tap an item to alert when available:</i>`,
    { parse_mode: "HTML", reply_markup: keyboard }
  );
  return true;
}

export async function handleWatchPickCallback(ctx: Context) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  await ctx.answerCallbackQuery();

  const linkedCtx = await requireLinked(ctx);
  if (!linkedCtx) {
    await ctx.editMessageText("❌ Session expired. Please /link again.");
    return;
  }

  const data = ctx.callbackQuery?.data ?? "";
  const raw = data.replace("watchpick:", "");

  if (raw === "cancel") {
    await clearPendingWatchSearch(chatId);
    await ctx.editMessageText("Cancelled.");
    return;
  }

  const index = Number(raw);
  const results = await getPendingWatchSearch(chatId);
  if (!results || !Number.isFinite(index) || index < 0 || index >= results.length) {
    await ctx.editMessageText("❌ Session expired. Try /watch again.");
    return;
  }

  const selected = results[index];
  await clearPendingWatchSearch(chatId);

  if (selected.available || selected.requestStatus === "available") {
    await ctx.editMessageText(
      `✅ <b>${escHtml(selected.title)}</b> is already available. No alert needed.`,
      { parse_mode: "HTML" }
    );
    return;
  }

  const { created } = await upsertWatchAlert({
    telegramId: linkedCtx.telegramId,
    userId: linkedCtx.linked.userId,
    mediaType: selected.mediaType,
    tmdbId: selected.id,
    title: selected.title,
  });

  await ctx.editMessageText(
    created
      ? `🔔 Alert saved for <b>${escHtml(selected.title)}</b>. I’ll notify you when it’s available.`
      : `🔁 Alert is already active for <b>${escHtml(selected.title)}</b>.`,
    { parse_mode: "HTML" }
  );
}

export async function handleAlerts(ctx: Context) {
  const telegramId = String(ctx.from?.id ?? "");
  const linked = await getLinkedUser(telegramId);
  if (!linked) {
    await ctx.reply("❌ Please link your LeMedia account first.\n\nSend /link to get started.");
    return;
  }

  const alerts = await listActiveWatchAlerts(telegramId);
  if (alerts.length === 0) {
    await ctx.reply("🔕 You have no active alerts. Use /watch <title> to add one.");
    return;
  }

  const keyboard = new InlineKeyboard();
  const lines = alerts.map((alert, index) => {
    const icon = alert.mediaType === "movie" ? "🎬" : "📺";
    keyboard.text(`Stop ${index + 1}`, `watchstop:${alert.id}`);
    if ((index + 1) % 2 === 0 || index === alerts.length - 1) keyboard.row();
    return `${index + 1}. ${icon} <b>${escHtml(alert.title)}</b> (TMDB ${alert.tmdbId})`;
  });
  keyboard.text("Stop all", "watchstop:all");

  await ctx.reply(
    `🔔 <b>Your Active Alerts</b>\n\n${lines.join("\n")}\n\nTap a button to stop alerts:`,
    { parse_mode: "HTML", reply_markup: keyboard }
  );
}

export async function handleStopAlerts(ctx: Context) {
  const telegramId = String(ctx.from?.id ?? "");
  const linked = await getLinkedUser(telegramId);
  if (!linked) {
    await ctx.reply("❌ Please link your LeMedia account first.\n\nSend /link to get started.");
    return;
  }

  const text = (ctx.message?.text ?? "").replace(/^\/stopalerts\s*/i, "").trim();
  if (!text || /^all$/i.test(text)) {
    const count = await disableAllWatchAlerts(telegramId);
    await ctx.reply(count > 0 ? `🛑 Stopped ${count} alert${count === 1 ? "" : "s"}.` : "🔕 You had no active alerts.");
    return;
  }

  const id = Number(text);
  if (!Number.isFinite(id) || id <= 0) {
    await ctx.reply("Use /stopalerts or /stopalerts <alert-id>. You can get IDs from /alerts.");
    return;
  }

  const removed = await disableWatchAlertById(telegramId, id);
  await ctx.reply(removed ? "🛑 Alert stopped." : "Couldn’t find that active alert ID.");
}

export async function handleWatchStopCallback(ctx: Context) {
  await ctx.answerCallbackQuery();
  const telegramId = String(ctx.from?.id ?? "");
  const linked = await getLinkedUser(telegramId);
  if (!linked) {
    await ctx.editMessageText("❌ Session expired. Please /link again.");
    return;
  }

  const data = ctx.callbackQuery?.data ?? "";
  const payload = data.replace("watchstop:", "");
  if (payload === "all") {
    const count = await disableAllWatchAlerts(telegramId);
    await ctx.editMessageText(count > 0 ? `🛑 Stopped ${count} alert${count === 1 ? "" : "s"}.` : "🔕 You had no active alerts.");
    return;
  }

  const id = Number(payload);
  if (!Number.isFinite(id) || id <= 0) {
    await ctx.editMessageText("Invalid alert selection.");
    return;
  }

  const removed = await disableWatchAlertById(telegramId, id);
  await ctx.editMessageText(removed ? "🛑 Alert stopped." : "Couldn’t find that active alert.");
}
