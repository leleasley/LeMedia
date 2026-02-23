import { Context } from "grammy";
import { createLinkToken, getLinkedUser, unlinkTelegramUser } from "../db";

const APP_URL = process.env.APP_BASE_URL ?? "https://media.leleasley.uk";

function escHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function handleLink(ctx: Context) {
  const telegramId = String(ctx.from?.id ?? "");
  const telegramUsername = ctx.from?.username;

  if (!telegramId) {
    await ctx.reply("❌ Could not identify your Telegram account.");
    return;
  }

  const existing = await getLinkedUser(telegramId);
  if (existing) {
    await ctx.reply(
      "✅ Your Telegram account is already linked to LeMedia.\n\nTo unlink, send /unlink"
    );
    return;
  }

  const code = await createLinkToken(telegramId, telegramUsername);

  await ctx.reply(
    `🔗 <b>Link your LeMedia account</b>\n\n` +
    `1. Visit: <a href="${escHtml(APP_URL)}/telegram-link">${escHtml(APP_URL)}/telegram-link</a>\n` +
    `2. Log in if needed\n` +
    `3. Enter this code:\n\n` +
    `<code>${escHtml(code)}</code>\n\n` +
    `⏱ This code expires in <b>10 minutes</b>`,
    { parse_mode: "HTML" }
  );
}

export async function handleUnlink(ctx: Context) {
  const telegramId = String(ctx.from?.id ?? "");

  const existing = await getLinkedUser(telegramId);
  if (!existing) {
    await ctx.reply("You don't have a linked LeMedia account.");
    return;
  }

  await unlinkTelegramUser(telegramId);
  await ctx.reply("✅ Your Telegram account has been unlinked from LeMedia.");
}
