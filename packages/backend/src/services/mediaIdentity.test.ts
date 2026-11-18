import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/prisma.js', () => ({
  prisma: {
    media: {
      updateMany: vi.fn(async () => ({ count: 1 })),
      findUnique: vi.fn(async () => ({ tvdbId: 253138 })),
    },
  },
}));

import { resolveSeriesIdentity, SeriesIdentityError } from './mediaIdentity.js';

const client = (lookupMetadata: (...args: unknown[]) => unknown) => ({ lookupMetadata }) as never;

describe('resolveSeriesIdentity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses a stored TVDB id without asking the service', async () => {
    const lookup = vi.fn();
    await expect(resolveSeriesIdentity(client(lookup), { tmdbId: 93544, tvdbId: 253138 })).resolves.toBe(253138);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('classifies an empty lookup as not-found (split shows: Top Boy 2019)', async () => {
    const lookup = vi.fn(async () => null);
    const error = await resolveSeriesIdentity(client(lookup), { tmdbId: 93544, tvdbId: null }).catch((e) => e);
    expect(error).toBeInstanceOf(SeriesIdentityError);
    expect(error.reason).toBe('not-found');
  });

  it('classifies a transport failure as lookup-failed and keeps the HTTP status', async () => {
    const lookup = vi.fn(async () => { throw { response: { status: 401 } }; });
    const error = await resolveSeriesIdentity(client(lookup), { tmdbId: 93544, tvdbId: null }).catch((e) => e);
    expect(error.reason).toBe('lookup-failed');
    expect(error.upstreamStatus).toBe(401);
  });

  it('refuses metadata whose TMDB id is not the requested one', async () => {
    const lookup = vi.fn(async () => ({ tmdbId: 41889, tvdbId: 253138 }));
    const error = await resolveSeriesIdentity(client(lookup), { tmdbId: 93544, tvdbId: null }).catch((e) => e);
    expect(error.reason).toBe('invalid');
  });
});
