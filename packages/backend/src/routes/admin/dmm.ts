import type { FastifyInstance } from 'fastify';
import {
  DmmImportError, MAX_COMPRESSED_BYTES,
  dmmOverview, importFromArrBackup, importWantedFromBackup, recordImport,
} from '../../services/dmmWantedImport.js';
import { ArrBackupError, createBackup } from '../../services/arrBackups.js';

/**
 * Admin → Media → DMM. Lists the backups Radarr/Sonarr already have, imports one without a file
 * picker, and still accepts an uploaded zip for a backup that lives elsewhere.
 *
 * Uploads are raw binary (no multipart dependency); authentication is checked before the body is
 * read so an anonymous POST cannot make the server buffer 200 MB just to reject it.
 */
export async function dmmAdminRoutes(app: FastifyInstance) {
  app.addContentTypeParser(
    ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
    { parseAs: 'buffer', bodyLimit: MAX_COMPRESSED_BYTES },
    (_request, body, done) => done(null, body),
  );

  app.addHook('preParsing', async (request, reply) => {
    if (!request.url.includes('/dmm/wanted-import') || request.method !== 'POST') return;
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'UNAUTHORIZED' });
    }
  });

  app.get('/dmm/overview', async () => dmmOverview());

  app.post('/dmm/import-backup', {
    schema: { body: { type: 'object', required: ['app', 'name'], properties: {
      app: { type: 'string', enum: ['radarr', 'sonarr'] },
      name: { type: 'string', minLength: 1, maxLength: 255 },
    } } },
    // DMM allows 10 imports an hour per sponsorship; mirror it so the limit is ours to explain.
    config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    const body = request.body as { app: 'radarr' | 'sonarr'; name: string };
    try {
      return await importFromArrBackup(body.app, body.name);
    } catch (err) {
      if (err instanceof DmmImportError || err instanceof ArrBackupError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });

  app.post('/dmm/backup-now', {
    schema: { body: { type: 'object', required: ['app'], properties: {
      app: { type: 'string', enum: ['radarr', 'sonarr'] },
    } } },
    config: { rateLimit: { max: 4, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    const body = request.body as { app: 'radarr' | 'sonarr' };
    try {
      await createBackup(body.app);
      return { ok: true };
    } catch (err) {
      if (err instanceof ArrBackupError) return reply.status(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  // Upload fallback: a zip from a machine that is not running Radarr/Sonarr here.
  app.post('/dmm/wanted-import', {
    bodyLimit: MAX_COMPRESSED_BYTES,
    config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
      return reply.status(400).send({ error: 'Upload a Radarr or Sonarr backup zip' });
    }
    const name = (request.query as { name?: string }).name?.slice(0, 255) || 'upload.zip';
    try {
      const result = await importWantedFromBackup(request.body);
      await recordImport(result.app, name, 'upload', result);
      return result;
    } catch (err) {
      if (err instanceof DmmImportError) return reply.status(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
