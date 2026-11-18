/**
 * Optional host helper: lets LeMedia restart and update the containers on the Docker host that
 * runs Radarr / Sonarr / Prowlarr / Zurg, and read their logs.
 *
 * LeMedia owns an ed25519 key (private half encrypted at rest). The admin adds the public half to
 * the host's authorized_keys as a forced command, so the key can only ever run
 * tools/lemedia-host-helper, which accepts a fixed set of commands for known containers.
 */
import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prisma } from '../utils/prisma.js';
import { decryptSecretValue, encryptSecretValue } from '../utils/secrets.js';

const ID = 'rex-docker-helper';
const KNOWN_HOSTS = process.env.LEMEDIA_DATA_DIR ? path.join(process.env.LEMEDIA_DATA_DIR, 'ssh_rex_known_hosts') : '/data/ssh_rex_known_hosts';
export const HELPER_PATH = '/usr/local/bin/lemedia-rex-docker-helper';

interface StoredConfig {
  host?: string;
  port?: number;
  user?: string;
  privateKey?: string; // encrypted
  publicKey?: string;
  verifiedAt?: string;
  hostname?: string;
  helperVersion?: number;
  apps?: string[];
  install?: { hash: string; expires: number; apps: Record<string, { container?: string; mode?: string }> };
}

/** Where the installer reads the helper from inside the LeMedia image (see the Dockerfile). */
const HELPER_SOURCE = path.resolve(process.cwd(), 'tools/lemedia-host-helper');
const INSTALL_TTL_MS = 60 * 60_000;
export const DEFAULT_HELPER_APPS: Record<string, { container?: string; mode?: string }> = {
  rex: { mode: 'tag' },
};

async function readConfig(): Promise<StoredConfig> {
  const row = await prisma.integration.findUnique({ where: { id: ID } });
  try { return row ? JSON.parse(row.config) as StoredConfig : {}; } catch { return {}; }
}
async function writeConfig(cfg: StoredConfig) {
  const config = JSON.stringify(cfg);
  await prisma.integration.upsert({ where: { id: ID }, update: { config }, create: { id: ID, config } });
}

export class HelperError extends Error {}

const authorizedLine = (pub: string) => `restrict,command="${HELPER_PATH}" ${pub.trim()}`;

export async function helperStatus() {
  const c = await readConfig();
  return {
    configured: !!(c.host && c.privateKey),
    host: c.host ?? '',
    port: c.port ?? 22,
    user: c.user ?? 'root',
    hasKey: !!c.privateKey,
    authorizedKeysLine: c.publicKey ? authorizedLine(c.publicKey) : null,
    verifiedAt: c.verifiedAt ?? null,
    hostname: c.hostname ?? null,
    helperVersion: c.helperVersion ?? null,
    apps: c.apps ?? null,
  };
}

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1) : 0;
      resolve({ code, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
    });
  });
}

/** Make a fresh key pair (replacing any old one). The host must be given the new public key. */
export async function generateKey() {
  const dir = await mkdtemp(path.join(tmpdir(), 'lmkey-'));
  try {
    const file = path.join(dir, 'id');
    const r = await run('ssh-keygen', ['-t', 'ed25519', '-N', '', '-C', 'lemedia-host-helper', '-f', file, '-q'], 15_000);
    if (r.code !== 0) throw new HelperError(`ssh-keygen failed: ${r.stderr.trim()}`);
    const [priv, pub] = await Promise.all([readFile(file, 'utf8'), readFile(`${file}.pub`, 'utf8')]);
    const cfg = await readConfig();
    await writeConfig({ ...cfg, privateKey: encryptSecretValue(priv) ?? undefined, publicKey: pub.trim(), verifiedAt: undefined, hostname: undefined });
  } finally { await rm(dir, { recursive: true, force: true }); }
  return helperStatus();
}

export async function setTarget(input: { host: string; port?: number; user?: string }) {
  const host = input.host.trim();
  if (!/^[A-Za-z0-9.-]{1,253}$/.test(host)) throw new HelperError('Enter a host name or IP address');
  const user = (input.user ?? 'root').trim();
  if (!/^[a-z_][a-z0-9_-]{0,31}$/i.test(user)) throw new HelperError('Enter a valid user name');
  const port = Math.trunc(Number(input.port ?? 22));
  if (!(port > 0 && port < 65536)) throw new HelperError('Enter a valid port');
  const cfg = await readConfig();
  await writeConfig({ ...cfg, host, user, port, verifiedAt: undefined, hostname: undefined });
  return helperStatus();
}

export async function clearHelper() {
  await prisma.integration.deleteMany({ where: { id: ID } });
}

/** Run one helper command on the host and return its JSON reply. */
export async function helperCall<T = Record<string, unknown>>(args: string[], timeoutMs = 60_000): Promise<T & { ok: boolean; error?: string }> {
  const cfg = await readConfig();
  const key = decryptSecretValue(cfg.privateKey);
  if (!cfg.host || !key) throw new HelperError('The REX host helper is not set up (Admin → REX → Settings)');
  for (const a of args) if (!/^(?:[A-Za-z0-9._-]{1,128}|sha256:[a-f0-9]{64})$/.test(a)) throw new HelperError('Bad helper argument');
  const dir = await mkdtemp(path.join(tmpdir(), 'lmssh-'));
  try {
    const keyFile = path.join(dir, 'id');
    await writeFile(keyFile, key.endsWith('\n') ? key : `${key}\n`, { mode: 0o600 });
    await mkdir(path.dirname(KNOWN_HOSTS), { recursive: true }).catch(() => {});
    const r = await run('ssh', [
      '-i', keyFile, '-p', String(cfg.port ?? 22),
      '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'ConnectTimeout=10',
      // First connection pins the host key; a changed key afterwards is refused.
      '-o', 'StrictHostKeyChecking=accept-new', '-o', `UserKnownHostsFile=${KNOWN_HOSTS}`,
      '-o', 'LogLevel=ERROR',
      `${cfg.user ?? 'root'}@${cfg.host}`, '--', ...args,
    ], timeoutMs);
    const line = r.stdout.trim().split('\n').filter(Boolean).pop() ?? '';
    let reply: T & { ok: boolean; error?: string };
    try { reply = JSON.parse(line); }
    catch {
      const err = r.stderr.trim() || r.stdout.trim() || `ssh exited with ${r.code}`;
      if (/Permission denied/i.test(err)) throw new HelperError('The host refused LeMedia\'s key. Add the key line shown in Settings to the host\'s authorized_keys.');
      if (/REMOTE HOST IDENTIFICATION HAS CHANGED|Host key verification failed/i.test(err)) throw new HelperError('The host\'s SSH key changed since LeMedia first connected, so it was refused');
      throw new HelperError(`Could not reach the host helper: ${err.slice(0, 300)}`);
    }
    return reply;
  } finally { await rm(dir, { recursive: true, force: true }); }
}

/** Connect once and record that it works. */
export async function testHelper() {
  const reply = await helperCall<{ host?: string; version?: number; apps?: string[] }>(['ping'], 20_000);
  if (!reply.ok) throw new HelperError(reply.error ?? 'The helper answered with an error');
  if (!reply.apps?.includes('rex')) throw new HelperError('The helper does not manage REX');
  const cfg = await readConfig();
  await writeConfig({ ...cfg, verifiedAt: new Date().toISOString(), hostname: reply.host ?? cfg.host, helperVersion: reply.version, apps: reply.apps });
  return helperStatus();
}

export async function helperReady() {
  const c = await readConfig();
  return !!(c.host && c.privateKey && c.verifiedAt);
}

// ─── One-line installer ──────────────────────────────────────────────

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const APP_NAME = /^[a-z][a-z0-9_-]{0,31}$/;
const CONTAINER = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

/** A one-hour token for the install command, plus the containers the helper may manage. */
export async function createInstallToken(apps: Record<string, { container?: string; mode?: string }>) {
  const cfg = await readConfig();
  if (!cfg.publicKey || !cfg.privateKey) throw new HelperError('Create LeMedia\'s key first');
  const clean: Record<string, { container?: string; mode?: string }> = {};
  for (const [name, v] of Object.entries(apps ?? {})) {
    if (!APP_NAME.test(name)) throw new HelperError(`Bad app name ${name}`);
    const container = v?.container?.trim();
    if (container && !CONTAINER.test(container)) throw new HelperError(`Bad container name ${container}`);
    const mode = ['tag', 'pull', 'none'].includes(String(v?.mode)) ? String(v.mode) : 'tag';
    clean[name] = { ...(container && container !== name ? { container } : {}), mode };
  }
  if (!Object.keys(clean).length) throw new HelperError('Pick at least one container');
  const token = randomBytes(24).toString('base64url');
  await writeConfig({ ...cfg, install: { hash: sha(token), expires: Date.now() + INSTALL_TTL_MS, apps: clean } });
  return { token, expiresAt: new Date(Date.now() + INSTALL_TTL_MS).toISOString() };
}

const shQuote = (v: string) => `'${v.replaceAll("'", "'\\''")}'`;

/** The shell script the install command pipes into `sudo sh`. Null when the token is wrong or old. */
export async function installScript(token: string): Promise<string | null> {
  const cfg = await readConfig();
  const inst = cfg.install;
  if (!token || !inst || inst.expires < Date.now() || sha(token) !== inst.hash || !cfg.publicKey) return null;
  const source = (await readFile(HELPER_SOURCE, 'utf8'))
    .replaceAll('/etc/lemedia-host-helper.json', '/etc/lemedia-rex-docker-helper.json')
    .replaceAll('/var/log/lemedia-host-helper.log', '/var/log/lemedia-rex-docker-helper.log')
    .replace('DEFAULT_APPS = {"sonarr": {}, "radarr": {}, "prowlarr": {}, "zurg": {"mode": "pull"}}', 'DEFAULT_APPS = {"rex": {"mode": "tag"}}');
  const helper = Buffer.from(source).toString('base64');
  const user = cfg.user ?? 'root';
  const config = JSON.stringify({ apps: inst.apps }, null, 2);
  return `#!/bin/sh
# LeMedia host helper installer. Installs ${HELPER_PATH}, writes /etc/lemedia-rex-docker-helper.json and
# adds LeMedia's key to ${user}'s authorized_keys, locked to that helper. Re-running is safe.
set -eu
[ "$(id -u)" = 0 ] || { echo "Run this as root (pipe it into sudo sh)." >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "python3 is needed on this host." >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "docker is needed on this host." >&2; exit 1; }
command -v base64 >/dev/null 2>&1 || { echo "base64 is needed on this host." >&2; exit 1; }
U=${shQuote(user)}
H=$(getent passwd "$U" | cut -d: -f6 || true)
[ -n "$H" ] || { echo "User $U doesn't exist on this host." >&2; exit 1; }
if [ "$U" != root ] && ! id -nG "$U" | tr ' ' '\n' | grep -qx docker; then
  echo "$U must be in the docker group (and able to edit your compose files) to update containers." >&2; exit 1
fi
echo ${shQuote(helper)} | base64 -d > ${HELPER_PATH}.new
chmod 755 ${HELPER_PATH}.new && mv ${HELPER_PATH}.new ${HELPER_PATH}
[ -f /etc/lemedia-rex-docker-helper.json ] && cp /etc/lemedia-rex-docker-helper.json /etc/lemedia-rex-docker-helper.json.bak
cat > /etc/lemedia-rex-docker-helper.json <<'LEMEDIA_JSON'
${config}
LEMEDIA_JSON
chmod 644 /etc/lemedia-rex-docker-helper.json
touch /var/log/lemedia-rex-docker-helper.log && chown "$U" /var/log/lemedia-rex-docker-helper.log
mkdir -p "$H/.ssh" && chmod 700 "$H/.ssh" && touch "$H/.ssh/authorized_keys"
grep -v 'lemedia-rex-docker-helper"' "$H/.ssh/authorized_keys" > "$H/.ssh/authorized_keys.lemedia-tmp" || true
echo ${shQuote(authorizedLine(cfg.publicKey))} >> "$H/.ssh/authorized_keys.lemedia-tmp"
mv "$H/.ssh/authorized_keys.lemedia-tmp" "$H/.ssh/authorized_keys"
chmod 600 "$H/.ssh/authorized_keys" && chown "$U" "$H/.ssh" "$H/.ssh/authorized_keys"
echo "LeMedia host helper installed on $(hostname) for user $U."
echo "Containers it may manage: ${Object.entries(inst.apps).map(([a, v]) => (v.container ? `${a} (${v.container})` : a)).join(', ')}"
echo "Back in LeMedia, press Test connection."
`;
}
