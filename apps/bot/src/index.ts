import "dotenv/config";
import { Bot, GrammyError, HttpError } from "grammy";
import { handleLink, handleUnlink } from "./commands/link";
import { handleRequest, handleSearchCallback, handleAwaitingQuery } from "./commands/request";
import { handleMyStuff } from "./commands/mystuff";
import { handleServices, handlePending, handleApproveCallback, handleDenyCallback } from "./commands/services";
import { handleTrending, handleTrendingCallback } from "./commands/trending";
import { handleNewStuff } from "./commands/newstuff";
import { handleNaturalLanguage } from "./commands/natural";
import {
  handleDigitalRelease,
  handleAwaitingReleaseQuery,
  handleFollow,
  handleFollowPickCallback,
  handleFollowing,
  handleReleasePickCallback,
  handleRelease,
  handleUnfollow,
} from "./commands/follow";
import {
  handleAlerts,
  handleAwaitingWatchQuery,
  handleStopAlerts,
  handleWatch,
  handleWatchPickCallback,
  handleWatchStopCallback,
} from "./commands/watch";
import { closePool } from "./db";
import { closeState, ensureStateReady } from "./state";
import { mainShortcutKeyboard } from "./ui";
import { startSchedulers } from "./schedulers";

function escHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.APP_BASE_URL ?? "https://media.leleasley.uk";

if (!BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN is not set. Exiting.");
  process.exit(1);
}

if (!process.env.SERVICES_SECRET_KEY) {
  console.error("SERVICES_SECRET_KEY is not set. Exiting.");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Exiting.");
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

// ── /start ────────────────────────────────────────────────────────────────────
bot.command("start", async ctx => {
  const name = ctx.from?.first_name ?? "there";
  await ctx.reply(
    `👋 Hey ${escHtml(name)}! I'm the <b>LeMedia Bot</b>.\n\n` +
    `I can help you request movies and TV shows, check your request status, and more.\n\n` +
    `<b>Getting started:</b>\n` +
    `1. Send /link to connect your LeMedia account\n` +
    `2. Then use /request to find something to watch!\n\n` +
    `Send /help to see all commands.`,
    { parse_mode: "HTML", reply_markup: mainShortcutKeyboard() }
  );
});

// ── /help ─────────────────────────────────────────────────────────────────────
bot.command("help", async ctx => {
  await ctx.reply(
    `<b>LeMedia Bot Commands</b>\n\n` +
    `🔗 /link — Connect your LeMedia account\n` +
    `🔓 /unlink — Disconnect your account\n\n` +
    `🎬 /request — Search and request media\n` +
    `🔔 /follow [title|this] — Follow for release updates\n` +
    `📌 /following — See everything you follow\n` +
    `🧹 /unfollow [title|this] — Stop following a title\n` +
    `🗓 /release [title|this] — Theatrical/premiere + digital dates\n` +
    `💿 /digitalrelease [title|this] — Digital release date\n` +
    `🔔 /watch [title|this] — Alert me when available\n` +
    `🛎 /alerts — View active alerts\n` +
    `🛑 /stopalerts [all|id] — Stop alerts\n` +
    `📋 /mystuff — Your recent requests &amp; status\n` +
    `📈 /trending — Browse what's popular\n` +
    `🆕 /newstuff — Recently added to library\n\n` +
    `🖥 /services — Service health (admin)\n` +
    `⏳ /pending — Pending requests with approve/deny (admin)\n\n` +
    `💡 <i>Tip: You can also just type naturally!</i>\n` +
    `  • "I want to watch Dune"\n` +
    `  • "Can I get Breaking Bad?"\n` +
    `  • "Give me an update on my following"\n` +
    `  • "When is the digital release date for Dune?"\n` +
    `  • "Are my services running?"`,
    { parse_mode: "HTML", reply_markup: mainShortcutKeyboard() }
  );
});

// ── Account commands ──────────────────────────────────────────────────────────
bot.command("link", handleLink);
bot.command("unlink", handleUnlink);

// ── Media commands ────────────────────────────────────────────────────────────
bot.command(["request", "movie", "tv", "search"], handleRequest);
bot.command(["watch", "alert"], handleWatch);
bot.command(["alerts", "myalerts"], handleAlerts);
bot.command(["stopalerts", "stopalert"], handleStopAlerts);
bot.command(["follow", "track"], handleFollow);
bot.command(["following", "myfollowing"], handleFollowing);
bot.command(["unfollow", "untrack"], handleUnfollow);
bot.command(["release", "releasedate"], handleRelease);
bot.command(["digitalrelease", "digital"], handleDigitalRelease);
bot.command("mystuff", handleMyStuff);
bot.command(["trending", "popular"], handleTrending);
bot.command(["newstuff", "new", "recent"], handleNewStuff);

// ── Admin commands ────────────────────────────────────────────────────────────
bot.command("services", handleServices);
bot.command("pending", handlePending);

// ── Inline keyboard callbacks ─────────────────────────────────────────────────
bot.callbackQuery(/^req:/, handleSearchCallback);
bot.callbackQuery(/^trend:/, handleTrendingCallback);
bot.callbackQuery(/^watchpick:/, handleWatchPickCallback);
bot.callbackQuery(/^watchstop:/, handleWatchStopCallback);
bot.callbackQuery(/^followpick:/, handleFollowPickCallback);
bot.callbackQuery(/^releasepick:/, handleReleasePickCallback);
bot.callbackQuery(/^appr:/, handleApproveCallback);
bot.callbackQuery(/^deny:/, handleDenyCallback);

// ── Free-text message handler ─────────────────────────────────────────────────
bot.on("message:text", async ctx => {
  // Skip slash commands (handled above)
  if (ctx.message.text.startsWith("/")) return;

  // 1. User was prompted for /watch title
  const handledWatch = await handleAwaitingWatchQuery(ctx);
  if (handledWatch) return;

  // 2. User was prompted for a release lookup title (/release or /digitalrelease)
  const handledRelease = await handleAwaitingReleaseQuery(ctx);
  if (handledRelease) return;

  // 3. User was prompted "What would you like to request?" — treat as search query
  const handled = await handleAwaitingQuery(ctx);
  if (handled) return;

  // 4. Natural language: "I want to watch Dune" / "are services running?" etc.
  await handleNaturalLanguage(ctx);
});

// ── Error handling ────────────────────────────────────────────────────────────
bot.catch(err => {
  const ctx = err.ctx;
  console.error(`Error handling update ${ctx.update.update_id}:`);
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error("Error in request:", e.description);
  } else if (e instanceof HttpError) {
    console.error("Could not contact Telegram:", e);
  } else {
    console.error("Unknown error:", e);
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
console.log(`LeMedia Bot starting... (App: ${APP_URL})`);

async function boot() {
  await ensureStateReady();

  bot.start({
    onStart: info => {
      console.log(`Bot @${info.username} is running (long polling)`);
    }
  });

  startSchedulers(bot);
}

boot().catch(err => {
  console.error("Failed to start bot:", err);
  process.exit(1);
});

// Graceful shutdown
process.once("SIGINT", async () => {
  console.log("Shutting down...");
  await bot.stop();
  await closeState();
  await closePool();
});
process.once("SIGTERM", async () => {
  console.log("Shutting down...");
  await bot.stop();
  await closeState();
  await closePool();
});
