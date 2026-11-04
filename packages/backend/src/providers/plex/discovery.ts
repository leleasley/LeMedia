import axios from 'axios';
import { assertPublicUrl } from '../../utils/ssrfGuard.js';

interface PlexConnection {
  uri?: string;
  local?: boolean | number;
  relay?: boolean | number;
}

interface PlexResource {
  name?: string;
  clientIdentifier?: string;
  provides?: string;
  owned?: boolean | number;
  accessToken?: string | null;
  connections?: PlexConnection[];
}

async function getServers(accountToken: string): Promise<PlexResource[]> {
  const { data } = await axios.get('https://plex.tv/api/v2/resources', {
    headers: { Accept: 'application/json', 'X-Plex-Token': accountToken, 'X-Plex-Client-Identifier': 'lemedia-client' },
    params: { includeHttps: 1, includeRelay: 1, includeIPv6: 1 },
    timeout: 10000,
    maxRedirects: 0,
  });
  if (!Array.isArray(data)) throw new Error('Invalid Plex server list');
  return (data as PlexResource[]).filter((item) =>
    typeof item.clientIdentifier === 'string' && !!item.clientIdentifier &&
    typeof item.provides === 'string' && item.provides.split(',').some((part) => part.trim() === 'server'),
  ).slice(0, 50);
}

export async function discoverPlexServers(accountToken: string) {
  const servers = await getServers(accountToken);
  return servers.map((server) => ({
    machineId: server.clientIdentifier!,
    name: server.name || 'Plex',
    owned: server.owned === true || server.owned === 1,
  }));
}

/** Check identity and authenticated library access before offering a server configuration. */
export async function connectDiscoveredPlexServer(accountToken: string, machineId: string) {
  const servers = await getServers(accountToken);
  const server = servers.find((item) => item.clientIdentifier === machineId);
  if (!server) throw new Error('Plex server not found');
  const serverToken = server.accessToken || (server.owned === true || server.owned === 1 ? accountToken : null);
  if (!serverToken) throw new Error('Plex did not provide a server token');
  const connections = [...(Array.isArray(server.connections) ? server.connections : [])]
    .sort((a, b) => Number(!!b.local) - Number(!!a.local) || Number(!!a.relay) - Number(!!b.relay))
    .slice(0, 8);
  for (const connection of connections) {
    try {
      if (typeof connection.uri !== 'string') continue;
      const url = new URL(connection.uri);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') continue;
      const origin = url.origin;
      await assertPublicUrl(origin);
      const config = {
        headers: { Accept: 'application/json', 'X-Plex-Client-Identifier': 'lemedia-client' },
        timeout: 3500,
        maxRedirects: 0,
      };
      const identity = await axios.get(`${origin}/identity`, config);
      if (identity.data?.MediaContainer?.machineIdentifier !== machineId) continue;
      const library = await axios.get(`${origin}/library/sections`, {
        ...config,
        headers: { ...config.headers, 'X-Plex-Token': serverToken },
      });
      if (!library.data?.MediaContainer || typeof library.data.MediaContainer !== 'object') continue;
      return { url: origin, machineId, token: serverToken };
    } catch {
      // An advertised connection may be unreachable from this host; try the next one.
    }
  }
  throw new Error('No reachable Plex server connection');
}
