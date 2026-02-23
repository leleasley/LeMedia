import { Context, InlineKeyboard } from "grammy";
import { getLinkedUser, isUserAdmin } from "../db";
import { decryptSecret } from "../encryption";
import { getServiceHealth, getPendingRequests } from "../api";

const SERVICES_SECRET_KEY = process.env.SERVICES_SECRET_KEY ?? "";

function escHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function serviceIcon(healthy: boolean): string {
  return healthy ? "🟢" : "🔴";
}

function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    radarr: "Movies",
    sonarr: "TV Shows",
    jellyfin: "Media Server",
    prowlarr: "Indexers",
    lidarr: "Music",
    readarr: "Books",
    whisparr: "Adult",
    qbittorrent: "Torrent",
    deluge: "Torrent",
    transmission: "Torrent",
    nzbget: "Usenet",
    sabnzbd: "Usenet",
  };
  return labels[type.toLowerCase()] ?? type;
}

export async function handleServices(ctx: Context) {
  const telegramId = String(ctx.from?.id ?? "");

  const linked = await getLinkedUser(telegramId);
  if (!linked) {
    await ctx.reply("❌ Please link your LeMedia account first.\n\nSend /link to get started.");
    return;
  }

  const admin = await isUserAdmin(linked.userId);
  if (!admin) {
    await ctx.reply("⛔ This command is only available to admins.");
    return;
  }

  const apiToken = decryptSecret(linked.apiTokenEncrypted, SERVICES_SECRET_KEY);

  let services;
  try {
    services = await getServiceHealth(apiToken);
  } catch {
    await ctx.reply("❌ Couldn't fetch service status. Please try again.");
    return;
  }

  if (services.length === 0) {
    await ctx.reply("🖥 <b>Service Status</b>\n\nNo services configured.", { parse_mode: "HTML" });
    return;
  }

  const lines = services.map(svc => {
    const icon = serviceIcon(svc.healthy);
    const label = typeLabel(svc.type);
    let line = `${icon} <b>${escHtml(svc.name)}</b> <i>(${label})</i>`;
    if (svc.queueSize !== undefined && svc.queueSize > 0) {
      line += ` — Queue: ${svc.queueSize}`;
    }
    if (!svc.healthy && svc.statusText) {
      line += `\n   ⚠️ ${escHtml(svc.statusText)}`;
    }
    return line;
  });

  await ctx.reply(
    `🖥 <b>Service Status</b>\n\n${lines.join("\n")}`,
    { parse_mode: "HTML" }
  );
}

export async function handlePending(ctx: Context) {
  const telegramId = String(ctx.from?.id ?? "");

  const linked = await getLinkedUser(telegramId);
  if (!linked) {
    await ctx.reply("❌ Please link your LeMedia account first.\n\nSend /link to get started.");
    return;
  }

  const admin = await isUserAdmin(linked.userId);
  if (!admin) {
    await ctx.reply("⛔ This command is only available to admins.");
    return;
  }

  const apiToken = decryptSecret(linked.apiTokenEncrypted, SERVICES_SECRET_KEY);

  let requests;
  try {
    requests = await getPendingRequests(apiToken);
  } catch {
    await ctx.reply("❌ Couldn't fetch pending requests. Please try again.");
    return;
  }

  if (requests.length === 0) {
    await ctx.reply("✅ No pending requests.");
    return;
  }

  // Send one message per request with approve/deny buttons
  for (const r of requests) {
    const type = r.requestType === "movie" ? "🎬" : "📺";
    const keyboard = new InlineKeyboard()
      .text("✅ Approve", `appr:${r.id}`)
      .text("❌ Deny", `deny:${r.id}`);
    await ctx.reply(
      `${type} <b>${escHtml(r.title)}</b>\n<i>Status: ${escHtml(r.status)}</i>`,
      { parse_mode: "HTML", reply_markup: keyboard }
    );
  }
}

export async function handleApproveCallback(ctx: Context) {
  const telegramId = String(ctx.from?.id ?? "");
  await ctx.answerCallbackQuery();

  const requestId = (ctx.callbackQuery?.data ?? "").replace("appr:", "");

  const linked = await getLinkedUser(telegramId);
  if (!linked) { await ctx.editMessageText("❌ Session expired. Please /link again."); return; }

  const admin = await isUserAdmin(linked.userId);
  if (!admin) { await ctx.editMessageText("⛔ Admins only."); return; }

  const { approveRequest } = await import("../api");
  const apiToken = decryptSecret(linked.apiTokenEncrypted, SERVICES_SECRET_KEY);
  const res = await approveRequest(requestId, apiToken);

  if (res.ok) {
    const text = ctx.callbackQuery?.message?.text ?? "";
    await ctx.editMessageText(`✅ Approved!\n${text}`, { parse_mode: "HTML" });
  } else {
    await ctx.editMessageText(`❌ Failed to approve: ${escHtml(res.message)}`, { parse_mode: "HTML" });
  }
}

export async function handleDenyCallback(ctx: Context) {
  const telegramId = String(ctx.from?.id ?? "");
  await ctx.answerCallbackQuery();

  const requestId = (ctx.callbackQuery?.data ?? "").replace("deny:", "");

  const linked = await getLinkedUser(telegramId);
  if (!linked) { await ctx.editMessageText("❌ Session expired. Please /link again."); return; }

  const admin = await isUserAdmin(linked.userId);
  if (!admin) { await ctx.editMessageText("⛔ Admins only."); return; }

  const { denyRequest } = await import("../api");
  const apiToken = decryptSecret(linked.apiTokenEncrypted, SERVICES_SECRET_KEY);
  const res = await denyRequest(requestId, apiToken);

  if (res.ok) {
    const text = ctx.callbackQuery?.message?.text ?? "";
    await ctx.editMessageText(`❌ Denied.\n${text}`, { parse_mode: "HTML" });
  } else {
    await ctx.editMessageText(`❌ Failed to deny: ${escHtml(res.message)}`, { parse_mode: "HTML" });
  }
}
