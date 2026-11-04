import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Server } from 'lucide-react';
import api from '@/lib/api';

interface PlexServer { machineId: string; name: string; owned: boolean }
export interface PlexConnection { url: string; machineId: string; token: string; accountToken: string }

interface Props {
  accountToken: string;
  endpointPrefix: '/admin' | '/setup';
  onConnected: (connection: PlexConnection) => void;
  onManual: (accountToken: string) => void;
  onCancel: () => void;
}

export function PlexServerDiscovery({ accountToken, endpointPrefix, onConnected, onManual, onCancel }: Readonly<Props>) {
  const { t } = useTranslation();
  const [servers, setServers] = useState<PlexServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<'discover' | 'connect' | 'empty' | null>(null);
  const [attempt, setAttempt] = useState(0);
  const callbacks = useRef({ onConnected, onManual });
  callbacks.current = { onConnected, onManual };
  const alive = useRef(false);

  const connect = async (machineId: string) => {
    setConnecting(machineId);
    setError(null);
    try {
      const { data } = await api.post<Omit<PlexConnection, 'accountToken'>>(`${endpointPrefix}/plex-connect`, { token: accountToken, machineId }, { timeout: 65000 });
      if (alive.current) callbacks.current.onConnected({ ...data, accountToken });
    } catch {
      if (alive.current) setError('connect');
    } finally {
      if (alive.current) setConnecting(null);
    }
  };

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setServers([]);
    void api.post<{ servers: PlexServer[] }>(`${endpointPrefix}/plex-discover`, { token: accountToken }, { signal: controller.signal })
      .then(({ data }) => {
        if (!alive.current || controller.signal.aborted) return;
        const found = data.servers;
        setServers(found);
        setLoading(false);
        if (found.length === 0) { setError('empty'); return; }
        const owned = found.filter((server) => server.owned);
        if (owned.length === 1) void connect(owned[0].machineId);
      })
      .catch(() => { if (!controller.signal.aborted && alive.current) { setLoading(false); setError('discover'); } });
    return () => { alive.current = false; controller.abort(); };
    // A fresh sign-in or an explicit retry starts a new discovery.
  }, [accountToken, endpointPrefix, attempt]);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-3">
      {(loading || connecting) && <p className="flex items-center gap-2 text-sm text-ndp-text-muted"><Loader2 className="w-4 h-4 animate-spin" />{connecting ? t('plex.discovery.connecting') : t('plex.discovery.searching')}</p>}
      {!loading && !connecting && servers.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-ndp-text">{t('plex.discovery.choose')}</p>
          {servers.map((server) => (
            <button key={server.machineId} type="button" onClick={() => void connect(server.machineId)} className="w-full flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-left text-sm text-ndp-text hover:bg-white/5">
              <Server className="w-4 h-4 text-ndp-accent flex-shrink-0" />
              <span className="flex-1 truncate">{server.name}</span>
              <span className="text-xs text-ndp-text-dim">{server.owned ? t('plex.discovery.owned') : t('plex.discovery.shared')}</span>
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-ndp-danger">{t(`plex.discovery.${error}`)}</p>}
      {!loading && !connecting && error && (
        <div className="flex flex-wrap gap-3 text-xs font-medium">
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="text-ndp-accent">{t('plex.discovery.retry')}</button>
          <button type="button" onClick={() => callbacks.current.onManual(accountToken)} className="text-ndp-text-muted">{t('plex.discovery.manual')}</button>
        </div>
      )}
      <button type="button" onClick={onCancel} className="text-xs text-ndp-text-dim hover:text-ndp-text">{t('common.cancel')}</button>
    </div>
  );
}
