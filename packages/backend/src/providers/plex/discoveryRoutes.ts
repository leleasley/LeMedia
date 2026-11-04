import type { FastifyInstance } from 'fastify';
import { connectDiscoveredPlexServer, discoverPlexServers } from './discovery.js';

/** Mounted under admin or the setup-secret-protected wizard. */
export function registerPlexDiscoveryRoutes(app: FastifyInstance) {
  app.post('/plex-discover', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    schema: { body: { type: 'object', required: ['token'], additionalProperties: false, properties: {
      token: { type: 'string', minLength: 1, maxLength: 4096 },
    } } },
  }, async (request, reply) => {
    try {
      const { token } = request.body as { token: string };
      return { servers: await discoverPlexServers(token) };
    } catch {
      return reply.status(502).send({ error: 'PLEX_DISCOVERY_FAILED' });
    }
  });

  app.post('/plex-connect', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    schema: { body: { type: 'object', required: ['token', 'machineId'], additionalProperties: false, properties: {
      token: { type: 'string', minLength: 1, maxLength: 4096 },
      machineId: { type: 'string', minLength: 1, maxLength: 256 },
    } } },
  }, async (request, reply) => {
    try {
      const { token, machineId } = request.body as { token: string; machineId: string };
      return await connectDiscoveredPlexServer(token, machineId);
    } catch {
      return reply.status(502).send({ error: 'PLEX_CONNECTION_FAILED' });
    }
  });
}
