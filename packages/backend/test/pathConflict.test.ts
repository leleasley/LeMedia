import { describe, it, expect, vi } from 'vitest';
import type { ArrClient } from '../src/providers/types.js';

/**
 * Regression cover for the "Animals (2026)" incident.
 *
 * Radarr held tmdbId 1599993 ("Animales") at the exact folder LeMedia computed for
 * tmdbId 1236045 ("Animals"). The external-id lookup missed (different id), the add
 * failed with a 400 MoviePathValidator, and the request died with a 500-char raw
 * validator blob in the log — retryable forever, explainable never.
 *
 * resolveAddConflict adopts the occupant when it IS the requested title and throws a
 * named ArrPathConflictError otherwise, so the log says what to do in Radarr.
 */

const logEvent = vi.hoisted(() => vi.fn());
vi.mock('../src/utils/logEvent.js', () => ({ logEvent }));

const { isPathConflictError, resolveAddConflict, ArrPathConflictError } = await import(
  '../src/services/requestService.js'
);

function axiosError(status: number, data: unknown) {
  return { isAxiosError: true, response: { status, data } };
}

const PATH_VALIDATOR_400 = axiosError(400, [
  {
    propertyName: 'Path',
    errorMessage: "Path '/mnt/zurg-embedded/zurg/__magic__/movies/Animals (2026)' is already configured for an existing movie",
    errorCode: 'MoviePathValidator',
  },
]);

function fakeClient(occupant: { id: number; externalId: number | null; title: string } | null, opts: { noFinder?: boolean } = {}) {
  return {
    ...(opts.noFinder ? {} : { findByPath: vi.fn().mockResolvedValue(occupant) }),
    searchMedia: vi.fn().mockResolvedValue(undefined),
  } as unknown as ArrClient;
}

describe('isPathConflictError', () => {
  it('detects the Radarr path-validator rejection', () => {
    expect(isPathConflictError(PATH_VALIDATOR_400)).toBe(true);
  });

  it('ignores non-400s, unrelated 400s and non-axios errors', () => {
    expect(isPathConflictError(axiosError(500, 'boom'))).toBe(false);
    expect(isPathConflictError(axiosError(400, [{ errorCode: 'RootFolderExistsValidator' }]))).toBe(false);
    expect(isPathConflictError(new Error('nope'))).toBe(false);
  });
});

describe('resolveAddConflict', () => {
  it('adopts the occupant when it is the same title (same external id)', async () => {
    const client = fakeClient({ id: 1473, externalId: 1236045, title: 'Animals' });
    const id = await resolveAddConflict(client, PATH_VALIDATOR_400, {
      title: 'Animals',
      externalId: 1236045,
      rootFolderPath: '/mnt/zurg-embedded/zurg/__magic__/movies/Animals (2026)',
    });
    expect(id).toBe(1473);
    expect(client.searchMedia).toHaveBeenCalledWith(1473);
  });

  it('throws a named conflict when the occupant is a different entry (the Animals incident)', async () => {
    const client = fakeClient({ id: 1473, externalId: 1599993, title: 'Animales' });
    const err = await resolveAddConflict(client, PATH_VALIDATOR_400, {
      title: 'Animals',
      externalId: 1236045,
      rootFolderPath: '/mnt/zurg-embedded/zurg/__magic__/movies/Animals (2026)',
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ArrPathConflictError);
    const conflict = err as InstanceType<typeof ArrPathConflictError>;
    expect(conflict.occupantTitle).toBe('Animales');
    expect(conflict.occupantExternalId).toBe(1599993);
    expect(client.searchMedia).not.toHaveBeenCalled();
  });

  it('rethrows the original error when it is not a path conflict', async () => {
    const client = fakeClient({ id: 1, externalId: 1, title: 'X' });
    const original = new Error('connection reset');
    await expect(resolveAddConflict(client, original, {
      title: 'X', externalId: 1, rootFolderPath: '/movies/X',
    })).rejects.toBe(original);
  });

  it('rethrows the original error when the connector cannot list paths', async () => {
    const client = fakeClient(null, { noFinder: true });
    await expect(resolveAddConflict(client, PATH_VALIDATOR_400, {
      title: 'X', externalId: 1, rootFolderPath: '/movies/X',
    })).rejects.toBe(PATH_VALIDATOR_400);
  });

  it('rethrows the original error when no occupant holds the path', async () => {
    const client = fakeClient(null);
    await expect(resolveAddConflict(client, PATH_VALIDATOR_400, {
      title: 'X', externalId: 1, rootFolderPath: '/movies/X',
    })).rejects.toBe(PATH_VALIDATOR_400);
  });
});
