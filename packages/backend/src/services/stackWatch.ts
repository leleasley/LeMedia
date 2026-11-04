/**
 * Admin notifications about the stack (Admin → Notifications decides which providers get them):
 * - app_update: a newer Sonarr / Radarr / Prowlarr / Zurg / rex is out (once per version), and the
 *   result of an automatic update.
 * - zurg_broken: Zurg has releases that stopped working (only ones not already reported).
 * - list_added: a list added titles (sent from the lists engine).
 */
import { prisma } from '../utils/prisma.js';
import { safeNotify } from '../utils/safeNotify.js';
import { sendPushToUsers, type PushType } from './pushService.js';
import { ARR_APPS, appOverview } from './arrAdmin.js';
import { updateStatus } from './githubIntegration.js';
import { getRexHostReport } from './rexHost.js';
import { getZurgConn, zurgGet } from './zurg/client.js';
import { listBroken } from './zurg/repairQueue.js';

const ID = 'stack-watch';
interface State { updates?: Record<string, string>; broken?: string[]; brokenSeeded?: boolean }

async function read(): Promise<State> {
  const row = await prisma.integration.findUnique({ where: { id: ID } });
  try { return row ? JSON.parse(row.config) : {}; } catch { return {}; }
}
async function write(s: State) {
  const config = JSON.stringify(s);
  await prisma.integration.upsert({ where: { id: ID }, update: { config }, create: { id: ID, config } });
}

/** Every admin's phone (the iOS / Android web app), unless they switched this type off in
 *  their profile, alongside the instance's Telegram / Discord / email providers. */
function notifyAdmins(type: PushType & ('list_added' | 'app_update' | 'zurg_broken'), title: string, message: string, url: string) {
  safeNotify(type, { title, message, url });
  void prisma.user.findMany({ where: { role: 'admin', disabled: false }, select: { id: true } })
    .then((admins) => (admins.length ? sendPushToUsers(admins.map((a) => a.id), { title, body: message, url }, type) : null))
    .catch(() => { /* a push failure never blocks the job */ });
}

export function notifyAppUpdate(title: string, message: string, url = '/admin?tab=arr') {
  notifyAdmins('app_update', title, message, url);
}

export function notifyListAdded(listName: string, titles: string[]) {
  if (!titles.length) return;
  // One title: "Added The Wrecker", from <list>. Several: "<list> added 3 titles" and the names.
  if (titles.length === 1) {
    notifyAdmins('list_added', `Added ${titles[0]}`, `From your ${listName} list`, '/admin?tab=lists');
    return;
  }
  const shown = titles.slice(0, 8).join(', ');
  notifyAdmins('list_added', `${listName} added ${titles.length} titles`,
    titles.length > 8 ? `${shown} and ${titles.length - 8} more` : shown, '/admin?tab=lists');
}

/** Scheduler (every 30 minutes): new versions and newly broken Zurg releases. */
export async function watchStack() {
  const state = await read();
  const updates = { ...(state.updates ?? {}) };
  const sent: string[] = [];

  for (const app of ARR_APPS) {
    const ov = await appOverview(app, true).catch(() => null) as { name?: string; version?: string; update?: { available: boolean; latest: { version: string } | null; blocker?: string | null }; auto?: { enabled: boolean } } | null;
    const latest = ov?.update?.available ? ov.update.latest?.version : null;
    if (!latest || updates[app] === latest) continue;
    updates[app] = latest;
    notifyAppUpdate(`${ov!.name} ${latest} is available`, [
      `Running ${ov!.version}.`,
      ov!.update!.blocker ? ov!.update!.blocker : ov!.auto?.enabled ? 'It will update in its overnight window.' : 'Update it from Admin, Radarr & Sonarr.',
    ].join(' '), app === 'prowlarr' ? '/admin?tab=prowlarr' : '/admin?tab=arr');
    sent.push(app);
  }

  const conn = await getZurgConn().catch(() => null);
  const zurgVersion = conn ? (await zurgGet<{ version?: string }>(conn, '/stats', 8_000).catch(() => null))?.version ?? null : null;
  for (const [kind, installed, url] of [['zurg', zurgVersion, '/admin?tab=zurg'], ['rex', getRexHostReport()?.report.rexVersion ?? null, '/admin?tab=rex']] as const) {
    if (!installed) continue;
    const st = await updateStatus(kind, installed).catch(() => null);
    const tag = st?.connected && st.upToDate === false ? st.latest?.tag : null;
    if (!tag || updates[kind] === tag) continue;
    updates[kind] = tag;
    notifyAppUpdate(`${kind === 'zurg' ? 'Zurg' : 'rex'} ${tag} is available`, `Running ${installed}.`, url);
    sent.push(kind);
  }

  let brokenNew = 0;
  let broken = state.broken ?? [];
  if (conn) {
    const list = await listBroken(conn).catch(() => null);
    if (list) {
      const now = list.filter((b) => b.state !== 'under_repair');
      const known = new Set(broken);
      const fresh = now.filter((b) => !known.has(b.hash));
      // The first run only records what's already broken, so switching this on isn't a flood.
      if (state.brokenSeeded && fresh.length) {
        brokenNew = fresh.length;
        const names = fresh.slice(0, 5).map((b) => b.name);
        notifyAdmins('zurg_broken', `${fresh.length} release${fresh.length === 1 ? '' : 's'} broke in Zurg`,
          `${names.join(', ')}${fresh.length > 5 ? ` and ${fresh.length - 5} more` : ''}. ${now.length} broken in total; repair them in Zurg, Cleanup, Broken.`,
          '/admin?tab=zurg&section=cleanup&view=broken');
      }
      broken = now.map((b) => b.hash);
    }
  }

  await write({ updates, broken, brokenSeeded: state.brokenSeeded || !!conn });
  return { updatesNotified: sent, brokenNew };
}
