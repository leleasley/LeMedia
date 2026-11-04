import { afterEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { connectDiscoveredPlexServer, discoverPlexServers } from '../src/providers/plex/discovery.js';

const resources = [
  { name: 'My Plex', clientIdentifier: 'my-server', provides: 'server', owned: true, accessToken: 'server-token', connections: [
    { uri: 'http://10.0.0.5:32400', local: true },
    { uri: 'https://plex.example.com:32400', local: false },
  ] },
  { name: 'Shared', clientIdentifier: 'shared-server', provides: 'server', owned: false, accessToken: 'shared-token' },
  { name: 'Player', clientIdentifier: 'player', provides: 'player' },
];

afterEach(() => { vi.restoreAllMocks(); });

describe('Plex server discovery', () => {
  it('returns server choices without exposing their connection tokens', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: resources });
    expect(await discoverPlexServers('account-token')).toEqual([
      { name: 'My Plex', machineId: 'my-server', owned: true },
      { name: 'Shared', machineId: 'shared-server', owned: false },
    ]);
  });

  it('checks identity and library access, falling back when a local connection is unreachable', async () => {
    const get = vi.spyOn(axios, 'get').mockImplementation(async (url, options) => {
      if (url === 'https://plex.tv/api/v2/resources') return { data: resources };
      if (String(url).startsWith('http://10.0.0.5')) throw new Error('unreachable');
      if (String(url).endsWith('/identity')) {
        expect(options?.headers?.['X-Plex-Token']).toBeUndefined();
        return { data: { MediaContainer: { machineIdentifier: 'my-server' } } };
      }
      if (String(url).endsWith('/library/sections')) {
        expect(options?.headers?.['X-Plex-Token']).toBe('server-token');
        return { data: { MediaContainer: {} } };
      }
      throw new Error('unexpected request');
    });
    await expect(connectDiscoveredPlexServer('account-token', 'my-server')).resolves.toEqual({ url: 'https://plex.example.com:32400', machineId: 'my-server', token: 'server-token' });
    expect(get).toHaveBeenCalledTimes(4);
  });

  it('does not accept a different server or an unauthenticated library', async () => {
    const get = vi.spyOn(axios, 'get').mockImplementation(async (url) => {
      if (url === 'https://plex.tv/api/v2/resources') return { data: resources };
      if (String(url).startsWith('http://10.0.0.5')) return { data: { MediaContainer: { machineIdentifier: 'wrong-server' } } };
      if (String(url).endsWith('/identity')) return { data: { MediaContainer: { machineIdentifier: 'my-server' } } };
      throw new Error('unauthorized');
    });
    await expect(connectDiscoveredPlexServer('account-token', 'my-server')).rejects.toThrow('No reachable Plex server connection');
    expect(get.mock.calls.some(([url]) => String(url) === 'http://10.0.0.5:32400/library/sections')).toBe(false);
  });

  it('does not send the account token to a shared server without its own token', async () => {
    const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: [{ ...resources[1], accessToken: null }] });
    await expect(connectDiscoveredPlexServer('account-token', 'shared-server')).rejects.toThrow('Plex did not provide a server token');
    expect(get).toHaveBeenCalledTimes(1);
  });
});
