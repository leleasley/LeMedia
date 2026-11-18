import { rexDockerVersion } from '../../services/rexDockerUpdate.js';
import type { FastifyInstance } from 'fastify';
import { connectGithub, disconnectGithub, githubStatus, releaseNotes, setReleaseRepos, updateStatus } from '../../services/githubIntegration.js';
import { getZurgConn, zurgGet } from '../../services/zurg/client.js';
import { getRexHostReport } from '../../services/rexHost.js';

const REPO = '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$';

/** Admin → GitHub connection (for release feeds) and the Zurg / rex update check. */
export async function githubAdminRoutes(app: FastifyInstance) {
  app.get('/github', async () => githubStatus());

  // Paste-a-token alternative to "Connect with GitHub" (works without a GitHub OAuth app, and a
  // fine-grained token can be limited to the two repos).
  app.post('/github/token', {
    schema: { body: { type: 'object' as const, required: ['token'], properties: { token: { type: 'string' as const, minLength: 20, maxLength: 300 } } } },
  }, async (request, reply) => {
    try {
      const login = await connectGithub((request.body as { token: string }).token.trim(), 'token', request.user?.email ?? 'admin');
      return { ok: true, login };
    } catch (err) {
      return reply.status(400).send({ error: 'GITHUB_TOKEN_INVALID', message: (err as Error).message });
    }
  });

  app.delete('/github', async (request) => {
    await disconnectGithub(request.user?.email ?? 'admin');
    return { ok: true };
  });

  app.put('/github/repos', {
    schema: {
      body: {
        type: 'object' as const,
        properties: { zurg: { type: 'string' as const, pattern: REPO }, rex: { type: 'string' as const, pattern: REPO }, app: { type: 'string' as const, pattern: REPO } },
      },
    },
  }, async (request) => {
    await setReleaseRepos(request.body as { zurg?: string; rex?: string; app?: string });
    return githubStatus();
  });

  // Installed versions come from the services themselves: zurg's /stats, and the rex host
  // reporter (which reads the tag rex-update.sh records). `?fresh=1` skips the hourly cache.
  app.get('/updates', async (request) => {
    const fresh = (request.query as { fresh?: string }).fresh === '1';
    const conn = await getZurgConn().catch(() => null);
    const zurgVersion = conn ? (await zurgGet<{ version?: string }>(conn, '/stats', 8_000).catch(() => null))?.version ?? null : null;
    const rexVersion = await rexDockerVersion() ?? getRexHostReport()?.report.rexVersion ?? null;
    const [zurg, rex] = await Promise.all([
      conn ? updateStatus('zurg', zurgVersion, fresh) : null,
      updateStatus('rex', rexVersion, fresh),
    ]);
    return { zurg, rex };
  });

  // Changelog dialog: recent releases with their notes (same hourly cache as the update check).
  app.get('/updates/:kind/releases', {
    schema: { params: { type: 'object' as const, required: ['kind'], properties: { kind: { type: 'string' as const, enum: ['zurg', 'rex'] } } } },
  }, async (request) => {
    const kind = (request.params as { kind: 'zurg' | 'rex' }).kind;
    let installed: string | null = null;
    if (kind === 'zurg') {
      const conn = await getZurgConn().catch(() => null);
      installed = conn ? (await zurgGet<{ version?: string }>(conn, '/stats', 8_000).catch(() => null))?.version ?? null : null;
    } else {
      installed = await rexDockerVersion() ?? getRexHostReport()?.report.rexVersion ?? null;
    }
    return releaseNotes(kind, installed);
  });
}
