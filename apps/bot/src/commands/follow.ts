import { Context, InlineKeyboard } from "grammy";
import {
  followMedia,
  getTvNextEpisodeInfo,
  getMovieReleaseInfo,
  listFollowing,
  searchMedia,
  type FollowedMediaItem,
  type SearchResult,
  unfollowMedia,
} from "../api";
import { getLinkedUser, getUserEpisodeReminderTimezone } from "../db";
import { decryptSecret } from "../encryption";
import {
  clearPendingReleaseSearch,
  clearPendingFollowSearch,
  consumeAwaitingReleaseQuery,
  getLastSelected,
  getPendingReleaseSearch,
  getPendingFollowSearch,
  setAwaitingReleaseQuery,
  setPendingReleaseSearch,
  setPendingFollowSearch,
  type AwaitingReleaseMode,
} from "../state";

const SERVICES_SECRET_KEY = process.env.SERVICES_SECRET_KEY ?? "";

function escHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function formatDate(date: string | null): string {
  if (!date) return "TBA";
  const value = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(value.getTime())) return date;
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(value);
}

function formatCountdownToDate(date: string | null): string | null {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00Z`).getTime();
  if (!Number.isFinite(target)) return null;

  const now = Date.now();
  const deltaMs = target - now;
  if (deltaMs <= 0) return "already aired or airs today";

  const totalHours = Math.round(deltaMs / (60 * 60 * 1000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (days > 0 && hours > 0) return `in about ${days} day${days === 1 ? "" : "s"} and ${hours} hour${hours === 1 ? "" : "s"}`;
  if (days > 0) return `in about ${days} day${days === 1 ? "" : "s"}`;
  return `in about ${Math.max(1, totalHours)} hour${Math.max(1, totalHours) === 1 ? "" : "s"}`;
}

function removeCommandPrefix(text: string, command: string): string {
  return text.replace(new RegExp(`^\\/${command}\\s*`, "i"), "").trim();
}

function removeAnyCommandPrefix(text: string, commands: string[]): string {
  for (const command of commands) {
    const next = removeCommandPrefix(text, command);
    if (next !== text.trim()) return next;
  }
  return text.trim();
}

async function resolveReleaseQueryFromCommand(ctx: Context, query: string): Promise<string | null> {
  const chatId = ctx.chat?.id;
  if (!chatId) return null;

  const trimmed = query.trim();
  if (trimmed && !/^(this|that)$/i.test(trimmed)) {
    return trimmed;
  }

  const last = await getLastSelected(chatId);
  if (!last) {
    return null;
  }

  return last.title;
}

async function resolveEpisodeQueryFromCommand(ctx: Context, query: string): Promise<string | null> {
  const chatId = ctx.chat?.id;
  if (!chatId) return null;

  const trimmed = query.trim();
  if (trimmed && !/^(this|that|it)$/i.test(trimmed)) {
    return trimmed;
  }

  const last = await getLastSelected(chatId);
  if (!last) return null;
  return last.title;
}

function releasePrompt(mode: AwaitingReleaseMode): string {
  return mode === "digital"
    ? "Which movie or TV show would you like the digital release date for?"
    : "Which movie or TV show would you like release info for?";
}

function releasePickerTitle(mode: AwaitingReleaseMode): string {
  return mode === "digital" ? "Digital release lookup" : "Release lookup";
}

async function requireLinked(ctx: Context): Promise<null | {
  apiToken: string;
  telegramId: string;
  userId: number;
}> {
  const telegramId = String(ctx.from?.id ?? "");
  const linked = await getLinkedUser(telegramId);
  if (!linked) {
    await ctx.reply("❌ Please link your LeMedia account first.\n\nSend /link to get started.");
    return null;
  }
  return {
    apiToken: decryptSecret(linked.apiTokenEncrypted, SERVICES_SECRET_KEY),
    telegramId,
    userId: linked.userId,
  };
}

function getEpisodeReminderAnchorTime(): { hour: number; minute: number } {
  const hour = Number(process.env.EPISODE_AIR_REMINDER_LOCAL_HOUR ?? "23");
  const minute = Number(process.env.EPISODE_AIR_REMINDER_LOCAL_MINUTE ?? "59");
  const safeHour = Number.isFinite(hour) ? Math.max(0, Math.min(23, Math.floor(hour))) : 23;
  const safeMinute = Number.isFinite(minute) ? Math.max(0, Math.min(59, Math.floor(minute))) : 59;
  return { hour: safeHour, minute: safeMinute };
}

function formatApproximateAirTimeLine(reminderTimezone: string | null): string {
  const { hour, minute } = getEpisodeReminderAnchorTime();
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  if (reminderTimezone) {
    return `Approx time: <b>${hh}:${mm}</b> in <b>${escHtml(reminderTimezone)}</b> (estimated)`;
  }
  return `Approx time: <b>${hh}:${mm}</b> in your app timezone (estimated)`;
}

function renderFollowingLine(item: FollowedMediaItem, index: number): string {
  const icon = item.mediaType === "movie" ? "🎬" : "📺";
  const theatrical = item.theatricalReleaseDate
    ? `Premiere: ${formatDate(item.theatricalReleaseDate)}`
    : "Premiere: TBA";
  const digital = item.mediaType === "movie"
    ? (item.digitalReleaseDate ? `Digital: ${formatDate(item.digitalReleaseDate)}` : "Digital: TBA")
    : "Digital: n/a";
  return `${index + 1}. ${icon} <b>${escHtml(item.title)}</b>\n   ${escHtml(theatrical)} • ${escHtml(digital)}`;
}

async function followPickedResult(ctx: Context, apiToken: string, selected: SearchResult, editMessage = false) {
  const response = await followMedia({
    mediaType: selected.mediaType,
    tmdbId: selected.id,
    notifyOnTheatrical: true,
    notifyOnDigital: selected.mediaType === "movie",
  }, apiToken);

  if (!response.ok) {
    const text = `❌ Could not follow <b>${escHtml(selected.title)}</b>: ${escHtml(response.message ?? "unknown error")}`;
    if (editMessage) {
      await ctx.editMessageText(text, { parse_mode: "HTML" });
    } else {
      await ctx.reply(text, { parse_mode: "HTML" });
    }
    return;
  }

  const item = response.item;
  const lines = [
    `🔔 You are now following <b>${escHtml(selected.title)}</b>.`,
  ];
  if (item?.theatricalReleaseDate) {
    lines.push(`Premiere date: <b>${escHtml(formatDate(item.theatricalReleaseDate))}</b>`);
  }
  if (selected.mediaType === "movie") {
    if (item?.digitalReleaseDate) {
      lines.push(`Digital date: <b>${escHtml(formatDate(item.digitalReleaseDate))}</b>`);
    } else {
      lines.push("Digital date: <i>not announced yet</i>");
    }
  }

  const text = lines.join("\n");
  if (editMessage) {
    await ctx.editMessageText(text, { parse_mode: "HTML" });
  } else {
    await ctx.reply(text, { parse_mode: "HTML" });
  }
}

async function promptFollowSearch(ctx: Context, apiToken: string, query: string) {
  await ctx.reply(`🔍 Searching for <b>${escHtml(query)}</b> to follow…`, { parse_mode: "HTML" });

  let results: SearchResult[];
  try {
    results = await searchMedia(query, apiToken);
  } catch {
    await ctx.reply("❌ Search failed. Please try again.");
    return;
  }

  if (results.length === 0) {
    await ctx.reply(`😕 No results found for \"<b>${escHtml(query)}</b>\".`, { parse_mode: "HTML" });
    return;
  }

  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const picks = results.slice(0, 5);
  await setPendingFollowSearch(chatId, picks);

  const lines = picks.map((item, index) => {
    const icon = item.mediaType === "movie" ? "🎬" : "📺";
    const year = item.year ? ` (${item.year})` : "";
    return `${index + 1}. ${icon} <b>${escHtml(item.title)}</b>${escHtml(year)}`;
  });

  const keyboard = new InlineKeyboard();
  for (let i = 0; i < picks.length; i++) {
    keyboard.text(`Follow ${i + 1}`, `followpick:${i}`);
    if ((i + 1) % 2 === 0 || i === picks.length - 1) keyboard.row();
  }
  keyboard.text("❌ Cancel", "followpick:cancel");

  await ctx.reply(
    `🔔 <b>Follow a title</b>\n\n${lines.join("\n")}\n\n<i>Tap a title to follow it:</i>`,
    { parse_mode: "HTML", reply_markup: keyboard }
  );
}

export async function runFollowByQuery(ctx: Context, query: string): Promise<boolean> {
  const linked = await requireLinked(ctx);
  if (!linked) return true;

  const chatId = ctx.chat?.id;
  if (!chatId) return true;

  const trimmed = query.trim();
  if (!trimmed || /^(this|that)$/i.test(trimmed)) {
    const last = await getLastSelected(chatId);
    if (!last) {
      await ctx.reply("🔔 Tell me what to follow, for example: /follow dune");
      return true;
    }

    await followPickedResult(ctx, linked.apiToken, {
      id: last.id,
      mediaType: last.mediaType,
      title: last.title,
      year: last.year,
      releaseDate: null,
      firstAirDate: null,
      overview: null,
      posterPath: null,
      requestStatus: last.requestStatus,
      available: last.available,
      voteAverage: null,
    });
    return true;
  }

  await promptFollowSearch(ctx, linked.apiToken, trimmed);
  return true;
}

export async function runUnfollowByQuery(ctx: Context, query: string): Promise<boolean> {
  const linked = await requireLinked(ctx);
  if (!linked) return true;

  const chatId = ctx.chat?.id;
  if (!chatId) return true;

  const trimmed = query.trim();
  if (!trimmed || /^(this|that)$/i.test(trimmed)) {
    const last = await getLastSelected(chatId);
    if (!last) {
      await ctx.reply("Tell me what to unfollow, for example: /unfollow dune");
      return true;
    }

    const result = await unfollowMedia({ mediaType: last.mediaType, tmdbId: last.id }, linked.apiToken);
    if (!result.ok) {
      await ctx.reply(`❌ Could not unfollow <b>${escHtml(last.title)}</b>.`, { parse_mode: "HTML" });
      return true;
    }

    await ctx.reply(`🧹 Unfollowed <b>${escHtml(last.title)}</b>.`, { parse_mode: "HTML" });
    return true;
  }

  let items: FollowedMediaItem[];
  try {
    items = await listFollowing(linked.apiToken);
  } catch {
    await ctx.reply("❌ Couldn't fetch your following list.");
    return true;
  }

  const queryNorm = normalizeText(trimmed);
  const match = items.find(item => normalizeText(item.title) === queryNorm)
    ?? items.find(item => normalizeText(item.title).includes(queryNorm));

  if (!match) {
    await ctx.reply(`I couldn't find \"${escHtml(trimmed)}\" in your following list.`, { parse_mode: "HTML" });
    return true;
  }

  const result = await unfollowMedia({ id: match.id }, linked.apiToken);
  if (!result.ok) {
    await ctx.reply(`❌ Could not unfollow <b>${escHtml(match.title)}</b>.`, { parse_mode: "HTML" });
    return true;
  }

  await ctx.reply(`🧹 Unfollowed <b>${escHtml(match.title)}</b>.`, { parse_mode: "HTML" });
  return true;
}

export async function replyFollowingUpdate(ctx: Context): Promise<boolean> {
  const linked = await requireLinked(ctx);
  if (!linked) return true;

  let items: FollowedMediaItem[];
  try {
    items = await listFollowing(linked.apiToken);
  } catch {
    await ctx.reply("❌ I couldn't fetch your following list right now.");
    return true;
  }

  if (items.length === 0) {
    await ctx.reply("📭 You are not following anything yet. Use /follow <title> to start.");
    return true;
  }

  const upcoming = items.filter(item => {
    const today = new Date().toISOString().slice(0, 10);
    const theatricalUpcoming = item.theatricalReleaseDate && item.theatricalReleaseDate >= today;
    const digitalUpcoming = item.mediaType === "movie" && item.digitalReleaseDate && item.digitalReleaseDate >= today;
    return Boolean(theatricalUpcoming || digitalUpcoming);
  });

  const lines = items.slice(0, 12).map((item, index) => renderFollowingLine(item, index));
  const extra = items.length > 12 ? `\n\n…and ${items.length - 12} more.` : "";

  await ctx.reply(
    `📌 <b>Your Following Update</b>\n` +
    `Tracking <b>${items.length}</b> title${items.length === 1 ? "" : "s"}. ` +
    `${upcoming.length} with upcoming release dates.\n\n` +
    `${lines.join("\n\n")}${extra}`,
    { parse_mode: "HTML" }
  );
  return true;
}

export async function answerReleaseDateQuestion(
  ctx: Context,
  query: string,
  options?: { digitalOnly?: boolean }
): Promise<boolean> {
  const mode: AwaitingReleaseMode = options?.digitalOnly ? "digital" : "all";
  return runReleaseLookupByQuery(ctx, query, mode);
}

async function answerReleaseForResult(
  ctx: Context,
  linkedApiToken: string,
  target: SearchResult,
  mode: AwaitingReleaseMode,
  editMessage = false
): Promise<void> {
  const reply = async (text: string) => {
    if (editMessage) {
      await ctx.editMessageText(text, { parse_mode: "HTML" });
      return;
    }
    await ctx.reply(text, { parse_mode: "HTML" });
  };

  if (target.mediaType === "tv") {
    const premiere = target.firstAirDate ?? target.releaseDate ?? null;
    if (mode === "digital") {
      await reply(
        `📺 <b>${escHtml(target.title)}</b> is a TV series, so there isn't one universal digital release date.\n` +
        `First air date: <b>${escHtml(formatDate(premiere))}</b>.`
      );
      return;
    }

    await reply(
      `📺 Release date for <b>${escHtml(target.title)}</b>: <b>${escHtml(formatDate(premiere))}</b>.`
    );
    return;
  }

  let movieInfo;
  try {
    movieInfo = await getMovieReleaseInfo(target.id, linkedApiToken);
  } catch {
    movieInfo = {
      theatricalReleaseDate: target.releaseDate ?? null,
      digitalReleaseDate: null,
    };
  }

  if (mode === "digital") {
    const digital = movieInfo.digitalReleaseDate;
    await reply(
      digital
        ? `💿 Digital release for <b>${escHtml(target.title)}</b>: <b>${escHtml(formatDate(digital))}</b>.`
        : `💿 Digital release for <b>${escHtml(target.title)}</b> has not been announced yet.`
    );
    return;
  }

  const theatricalLine = movieInfo.theatricalReleaseDate
    ? `Theatrical: <b>${escHtml(formatDate(movieInfo.theatricalReleaseDate))}</b>`
    : "Theatrical: <i>TBA</i>";
  const digitalLine = movieInfo.digitalReleaseDate
    ? `Digital: <b>${escHtml(formatDate(movieInfo.digitalReleaseDate))}</b>`
    : "Digital: <i>TBA</i>";

  await reply(`🎬 Release dates for <b>${escHtml(target.title)}</b>\n${theatricalLine}\n${digitalLine}`);
}

async function runReleaseLookupByQuery(
  ctx: Context,
  query: string,
  mode: AwaitingReleaseMode
): Promise<boolean> {
  const linked = await requireLinked(ctx);
  if (!linked) return true;

  const trimmed = query.trim();
  if (!trimmed || /^(this|that)$/i.test(trimmed)) {
    const resolved = await resolveReleaseQueryFromCommand(ctx, trimmed);
    if (!resolved) {
      await setAwaitingReleaseQuery(linked.telegramId, mode);
      await ctx.reply(releasePrompt(mode));
      return true;
    }
    return runReleaseLookupByQuery(ctx, resolved, mode);
  }

  let results: SearchResult[];
  try {
    results = await searchMedia(trimmed, linked.apiToken);
  } catch {
    await ctx.reply("❌ Search failed. Please try again.");
    return true;
  }

  if (results.length === 0) {
    await setAwaitingReleaseQuery(linked.telegramId, mode);
    await ctx.reply(
      `😕 I couldn't find anything for \"${escHtml(trimmed)}\".\n${releasePrompt(mode)}`,
      { parse_mode: "HTML" }
    );
    return true;
  }

  const exact = results.find(r => normalizeText(r.title) === normalizeText(trimmed));
  if (exact) {
    await answerReleaseForResult(ctx, linked.apiToken, exact, mode);
    return true;
  }

  if (results.length === 1) {
    await answerReleaseForResult(ctx, linked.apiToken, results[0], mode);
    return true;
  }

  const chatId = ctx.chat?.id;
  if (!chatId) return true;

  const picks = results.slice(0, 10);
  await setPendingReleaseSearch(chatId, mode, picks);

  const lines = picks.map((item, index) => {
    const icon = item.mediaType === "movie" ? "🎬" : "📺";
    const year = item.year ? ` (${item.year})` : "";
    return `${index + 1}. ${icon} <b>${escHtml(item.title)}</b>${escHtml(year)}`;
  });

  const keyboard = new InlineKeyboard();
  for (let i = 0; i < picks.length; i++) {
    keyboard.text(`Pick ${i + 1}`, `releasepick:${i}`);
    if ((i + 1) % 2 === 0 || i === picks.length - 1) keyboard.row();
  }
  keyboard.text("❌ Cancel", "releasepick:cancel");

  await ctx.reply(
    `🔎 <b>${releasePickerTitle(mode)}</b>\n\n` +
    `Did you mean one of these for <b>${escHtml(trimmed)}</b>?\n` +
    `${lines.join("\n")}\n\n` +
    `<i>Tap one to continue:</i>`,
    { parse_mode: "HTML", reply_markup: keyboard }
  );
  return true;
}

export async function handleAwaitingReleaseQuery(ctx: Context): Promise<boolean> {
  const telegramId = String(ctx.from?.id ?? "");
  const mode = await consumeAwaitingReleaseQuery(telegramId);
  if (!mode) return false;

  const text = (ctx.message?.text ?? "").trim();
  if (!text) {
    await setAwaitingReleaseQuery(telegramId, mode);
    await ctx.reply(releasePrompt(mode));
    return true;
  }

  await runReleaseLookupByQuery(ctx, text, mode);
  return true;
}

export async function handleReleasePickCallback(ctx: Context) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  await ctx.answerCallbackQuery();

  const linked = await requireLinked(ctx);
  if (!linked) {
    await ctx.editMessageText("❌ Session expired. Please /link again.");
    return;
  }

  const data = ctx.callbackQuery?.data ?? "";
  const raw = data.replace("releasepick:", "");

  if (raw === "cancel") {
    await clearPendingReleaseSearch(chatId);
    await ctx.editMessageText("Cancelled.");
    return;
  }

  const index = Number(raw);
  const pending = await getPendingReleaseSearch(chatId);
  if (!pending || !Number.isFinite(index) || index < 0 || index >= pending.results.length) {
    await ctx.editMessageText("❌ Session expired. Try /release or /digitalrelease again.");
    return;
  }

  await clearPendingReleaseSearch(chatId);
  const selected = pending.results[index];
  await answerReleaseForResult(ctx, linked.apiToken, selected, pending.mode, true);
}

export async function handleFollow(ctx: Context) {
  const raw = ctx.message?.text ?? "";
  const query = removeAnyCommandPrefix(raw, ["follow", "track"]);
  await runFollowByQuery(ctx, query);
}

export async function handleUnfollow(ctx: Context) {
  const raw = ctx.message?.text ?? "";
  const query = removeAnyCommandPrefix(raw, ["unfollow", "untrack"]);
  await runUnfollowByQuery(ctx, query);
}

export async function handleFollowing(ctx: Context) {
  await replyFollowingUpdate(ctx);
}

export async function handleRelease(ctx: Context) {
  const raw = ctx.message?.text ?? "";
  const query = removeAnyCommandPrefix(raw, ["release", "releasedate"]);
  await runReleaseLookupByQuery(ctx, query, "all");
}

export async function handleDigitalRelease(ctx: Context) {
  const raw = ctx.message?.text ?? "";
  const query = removeAnyCommandPrefix(raw, ["digitalrelease", "digital"]);
  await runReleaseLookupByQuery(ctx, query, "digital");
}

async function answerNextEpisodeForResult(
  ctx: Context,
  linkedApiToken: string,
  linkedUserId: number,
  target: SearchResult,
  options?: { autopicked?: boolean }
): Promise<void> {
  if (target.mediaType !== "tv") {
    await ctx.reply(
      `📌 <b>${escHtml(target.title)}</b> is a movie. Try /release or /digitalrelease for movie release dates.`,
      { parse_mode: "HTML" }
    );
    return;
  }

  let info;
  try {
    info = await getTvNextEpisodeInfo(target.id, linkedApiToken);
  } catch {
    await ctx.reply("❌ I couldn't fetch next-episode details right now. Please try again.");
    return;
  }

  const next = info?.nextEpisodeToAir;
  const title = info?.name ?? target.title;

  if (!next || !next.airDate) {
    await ctx.reply(
      `📺 I couldn't find a confirmed next episode air date yet for <b>${escHtml(title)}</b>.`,
      { parse_mode: "HTML" }
    );
    return;
  }

  const episodeCode =
    Number.isFinite(Number(next.seasonNumber)) && Number.isFinite(Number(next.episodeNumber))
      ? `S${String(next.seasonNumber).padStart(2, "0")}E${String(next.episodeNumber).padStart(2, "0")}`
      : "Next episode";

  const countdown = formatCountdownToDate(next.airDate);
  const autopickedNote = options?.autopicked ? "\n<i>I matched the closest TV title.</i>" : "";
  let reminderTimezone: string | null = null;
  try {
    reminderTimezone = await getUserEpisodeReminderTimezone(linkedUserId);
  } catch {
    reminderTimezone = null;
  }

  await ctx.reply(
    `📺 <b>${escHtml(title)}</b>\n` +
    `${escHtml(episodeCode)}${next.name ? ` — <b>${escHtml(next.name)}</b>` : ""}\n` +
    `Air date: <b>${escHtml(formatDate(next.airDate))}</b>\n` +
    `${formatApproximateAirTimeLine(reminderTimezone)}\n` +
    `Time note: <i>TMDB usually provides date-only for episodes, so exact airtime may vary by region/network.</i>\n` +
    `${countdown ? `Countdown: <b>${escHtml(countdown)}</b>` : ""}${autopickedNote}`,
    { parse_mode: "HTML" }
  );
}

async function runNextEpisodeLookupByQuery(ctx: Context, query: string): Promise<boolean> {
  const linked = await requireLinked(ctx);
  if (!linked) return true;

  const trimmed = query.trim();
  const resolved = await resolveEpisodeQueryFromCommand(ctx, trimmed);
  if (!resolved) {
    await ctx.reply("Tell me which show, for example: /nextepisode the last of us");
    return true;
  }

  let results: SearchResult[];
  try {
    results = await searchMedia(resolved, linked.apiToken);
  } catch {
    await ctx.reply("❌ Search failed. Please try again.");
    return true;
  }

  if (!results.length) {
    await ctx.reply(`😕 I couldn't find anything for \"<b>${escHtml(resolved)}</b>\".`, { parse_mode: "HTML" });
    return true;
  }

  const tvResults = results.filter((r) => r.mediaType === "tv");
  if (!tvResults.length) {
    await ctx.reply(`📌 I found results for \"<b>${escHtml(resolved)}</b>\", but none were TV series.`, { parse_mode: "HTML" });
    return true;
  }

  const exactTv = tvResults.find((r) => normalizeText(r.title) === normalizeText(resolved));
  const picked = exactTv ?? tvResults[0];
  await answerNextEpisodeForResult(ctx, linked.apiToken, linked.userId, picked, {
    autopicked: !exactTv && tvResults.length > 1,
  });
  return true;
}

export async function answerNextEpisodeQuestion(ctx: Context, query: string): Promise<boolean> {
  return runNextEpisodeLookupByQuery(ctx, query);
}

export async function handleNextEpisode(ctx: Context) {
  const raw = ctx.message?.text ?? "";
  const query = removeAnyCommandPrefix(raw, ["nextepisode", "nextair"]);
  await runNextEpisodeLookupByQuery(ctx, query);
}

export async function handleFollowPickCallback(ctx: Context) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  await ctx.answerCallbackQuery();

  const linked = await requireLinked(ctx);
  if (!linked) {
    await ctx.editMessageText("❌ Session expired. Please /link again.");
    return;
  }

  const data = ctx.callbackQuery?.data ?? "";
  const raw = data.replace("followpick:", "");

  if (raw === "cancel") {
    await clearPendingFollowSearch(chatId);
    await ctx.editMessageText("Cancelled.");
    return;
  }

  const index = Number(raw);
  const results = await getPendingFollowSearch(chatId);
  if (!results || !Number.isFinite(index) || index < 0 || index >= results.length) {
    await ctx.editMessageText("❌ Session expired. Try /follow again.");
    return;
  }

  const selected = results[index];
  await clearPendingFollowSearch(chatId);
  await followPickedResult(ctx, linked.apiToken, selected, true);
}
