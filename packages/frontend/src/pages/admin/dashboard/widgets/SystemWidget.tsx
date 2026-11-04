import { useEffect, useState } from 'react';
import { HardDrive, Info, MonitorPlay } from 'lucide-react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import api from '@/lib/api';

interface VersionResp { current: string; latest?: string; updateAvailable?: boolean }
interface RexResp { configured: boolean; reachable?: boolean; nowPlaying?: unknown[] }
interface ZurgResp { configured: boolean; reachable?: boolean; activeStreams?: number; mount?: { state?: string } | null }
interface Upd { installed: string | null; latest: { tag: string } | null; behind: number | null; upToDate: boolean | null; connected: boolean }
interface UpdatesResp { zurg: Upd | null; rex: Upd | null }

/** Version on the right, and the update note under the status when there is one. */
function versionBits(u: Upd | null | undefined) {
  const version = u?.installed ?? null;
  const update = u?.connected && u.upToDate === false && u.latest
    ? (u.behind ? `update available (${u.behind} behind)` : 'update available')
    : null;
  return { version, update };
}

export function SystemWidget() {
  const [v, setV] = useState<VersionResp | null>(null);
  const [rex, setRex] = useState<RexResp | null>(null);
  const [zurg, setZurg] = useState<ZurgResp | null>(null);
  const [upd, setUpd] = useState<UpdatesResp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<VersionResp>('/app/version').then(({ data }) => { if (!cancelled) setV(data); }).catch(() => {});
    api.get<RexResp>('/admin/rex/health').then(({ data }) => { if (!cancelled) setRex(data); })
      .catch(() => { if (!cancelled) setRex({ configured: true, reachable: false }); });
    api.get<ZurgResp>('/admin/zurg/overview').then(({ data }) => { if (!cancelled) setZurg(data); })
      .catch(() => { if (!cancelled) setZurg({ configured: true, reachable: false }); });
    api.get<UpdatesResp>('/admin/updates').then(({ data }) => { if (!cancelled) setUpd(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const watching = rex?.nowPlaying?.length ?? 0;
  const streams = zurg?.activeStreams ?? 0;
  const rexV = versionBits(upd?.rex);
  const zurgV = versionBits(upd?.zurg);

  const tone = (ok: boolean | undefined) => clsx('admin-icon-tile', ok === true && 'bg-emerald-500/15 text-emerald-400', ok === false && 'bg-red-500/15 text-red-400');

  return (
    <div className="card h-full overflow-auto">
      <div className="divide-y divide-white/[0.06]">
        <div className="admin-row !min-h-0 !py-2">
          <span className="admin-icon-tile"><Info className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium text-ndp-text">LeMedia</p>
            <p className="text-xs text-ndp-text-dim">{v?.updateAvailable && v.latest ? `Update available: ${v.latest}` : 'Running'}</p>
          </div>
          <span className="font-mono text-xs text-ndp-text-muted">{v?.current ?? '-'}</span>
        </div>
        {zurg?.configured !== false && (
          <Link to="/admin?tab=zurg" className="admin-row !min-h-0 !py-2 hover:bg-white/[0.03] transition-colors">
            <span className={tone(zurg ? zurg.reachable === true : undefined)}><HardDrive className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium text-ndp-text">Zurg</p>
              <p className="text-xs text-ndp-text-dim">
                {!zurg ? 'Checking…' : !zurg.reachable ? 'Not answering'
                  : [zurg.mount?.state && zurg.mount.state !== 'running' ? `mount ${zurg.mount.state}` : 'Online', streams > 0 ? `${streams} streaming` : null, zurgV.update].filter(Boolean).join(' · ')}
              </p>
            </div>
            {zurgV.version && <span className={clsx('font-mono text-xs max-w-[9rem] truncate', zurgV.update ? 'text-amber-300/90' : 'text-ndp-text-muted')} title={zurgV.version}>{zurgV.version}</span>}
          </Link>
        )}
        {rex?.configured !== false && (
          <Link to="/admin?tab=rex" className="admin-row !min-h-0 !py-2 hover:bg-white/[0.03] transition-colors">
            <span className={tone(rex ? rex.reachable === true : undefined)}><MonitorPlay className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium text-ndp-text">rex</p>
              <p className="text-xs text-ndp-text-dim">
                {!rex ? 'Checking…' : !rex.reachable ? 'Not answering'
                  : [watching > 0 ? `Online · ${watching} watching` : 'Online · nobody watching', rexV.update].filter(Boolean).join(' · ')}
              </p>
            </div>
            {rexV.version && <span className={clsx('font-mono text-xs max-w-[9rem] truncate', rexV.update ? 'text-amber-300/90' : 'text-ndp-text-muted')} title={rexV.version}>{rexV.version}</span>}
          </Link>
        )}
      </div>
    </div>
  );
}
