import { Context } from "grammy";
import { getLinkedUser } from "../db";
import { decryptSecret } from "../encryption";
import { getNewStuff } from "../api";

const SERVICES_SECRET_KEY = process.env.SERVICES_SECRET_KEY ?? "";
const APP_BASE_URL = (process.env.APP_BASE_URL ?? "").replace(/\/$/, "");

function escHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function handleNewStuff(ctx: Context) {
  const telegramId = String(ctx.from?.id ?? "");

  const linked = await getLinkedUser(telegramId);
  if (!linked) {
    await ctx.reply("❌ Please link your LeMedia account first.\n\nSend /link to get started.");
    return;
  }

  const apiToken = decryptSecret(linked.apiTokenEncrypted, SERVICES_SECRET_KEY);

  let items;
  try {
    items = await getNewStuff(apiToken);
  } catch {
    await ctx.reply("❌ Couldn't fetch recent additions. Please try again.");
    return;
  }

  if (items.length === 0) {
    await ctx.reply("📭 Nothing new added recently.");
    return;
  }

  const lines = items.map((r, i) => {
    const icon = r.type === "movie" ? "🎬" : "📺";
    const year = r.year ? ` (${r.year})` : "";
    const status = r.available ? " ✅" : " ⏳";
    const mediaPath = r.type === "movie" ? "movie" : "tv";
    const link = APP_BASE_URL ? ` — <a href="${APP_BASE_URL}/${mediaPath}/${r.id}">View</a>` : "";
    return `${i + 1}. ${icon} <b>${escHtml(r.title)}</b>${escHtml(year)}${status}${link}`;
  });

  await ctx.reply(
    `🆕 <b>Recently Added to Library</b>\n\n${lines.join("\n")}\n\n<i>✅ = Available  ⏳ = Processing</i>`,
    { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
  );
}
