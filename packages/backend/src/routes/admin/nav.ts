import type { FastifyInstance } from 'fastify';
import { prisma } from '../../utils/prisma.js';
import { parseServiceConfig } from '../../utils/services.js';
import { getRexConn } from '../../services/rex.js';

/** Which service pages make sense on this install. */
export interface NavServices {
  arr: boolean;
  prowlarr: boolean;
  zurg: boolean;
  rex: boolean;
  dmm: boolean;
}

/**
 * Admin navigation should only offer pages the install can actually use — a Zurg page on an
 * install without Zurg is a dead end, and the same goes for Rex, Prowlarr, DMM and the *arrs.
 *
 * Computed server-side because "configured" is not the same as "a row exists": DMM needs an API
 * key, and Rex is usually a Plex service carrying a token (see services/rex.ts), not a `rex` row.
 */
export async function navRoutes(app: FastifyInstance) {
  app.get('/nav-services', async (): Promise<NavServices> => {
    const rows = await prisma.service.findMany({
      where: { enabled: true },
      select: { type: true, config: true },
    });
    const enabled = new Set(rows.map((row) => row.type));
    const hasDmmKey = rows.some((row) => row.type === 'dmm' && !!parseServiceConfig(row.config).apiKey?.trim());
    const rex = await getRexConn().catch(() => null);

    return {
      arr: enabled.has('radarr') || enabled.has('sonarr'),
      prowlarr: enabled.has('prowlarr'),
      zurg: enabled.has('zurg'),
      rex: !!rex,
      dmm: hasDmmKey,
    };
  });
}
