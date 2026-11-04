import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { AudioLines, Captions, Film, HardDrive } from 'lucide-react';
import api from '@/lib/api';
import { languageName } from '@/utils/languageName';

interface FileInfo {
  release: string | null;
  sample: { season: number; episode: number | null } | null;
  sizeBytes: number | null;
  durationSec: number | null;
  bitrateKbps: number | null;
  container: string | null;
  video: { resolution: string; width: number; height: number; codec: string; bitDepth: number | null; hdr: string | null } | null;
  audio: { lang: string | null; codec: string; channels: string | null; atmos: boolean; title: string | null; isDefault: boolean }[];
  subtitles: { lang: string | null; forced: boolean; sdh: boolean; title: string | null }[];
}

const gb = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);
const hm = (s: number) => `${Math.floor(s / 3600)}h ${String(Math.round((s % 3600) / 60)).padStart(2, '0')}m`;

/** "Your copy" — the actual file on the server (resolution, HDR, audio, subtitles), from
 *  zurg's stored analysis. Renders nothing when there is no analysed file. */
export function MediaFileInfo({ mediaType, tmdbId }: Readonly<{ mediaType: 'movie' | 'tv'; tmdbId: number }>) {
  const { t } = useTranslation();
  const [info, setInfo] = useState<FileInfo | null>(null);
  const [showAllSubs, setShowAllSubs] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get<{ file: FileInfo | null }>(`/zurg/media/${mediaType}/${tmdbId}/file`)
      .then(({ data }) => { if (!cancelled) setInfo(data?.file ?? null); })
      .catch(() => { if (!cancelled) setInfo(null); });
    return () => { cancelled = true; };
  }, [mediaType, tmdbId]);

  if (!info || (!info.video && info.audio.length === 0)) return null;

  const lang = (code: string | null) => (code ? languageName(code) || code.toUpperCase() : t('fileinfo.unknown_lang', 'Unknown'));

  const chips: { label: string; tone: string }[] = [];
  if (info.video) {
    chips.push({ label: info.video.resolution, tone: 'bg-white/[0.09] text-ndp-text' });
    if (info.video.hdr) chips.push({ label: info.video.hdr, tone: info.video.hdr === 'Dolby Vision' ? 'text-ndp-text ring-1 ring-inset ring-white/25' : 'bg-amber-500/15 text-amber-300' });
    chips.push({ label: `${info.video.codec}${info.video.bitDepth && info.video.bitDepth > 8 ? ` ${info.video.bitDepth}-bit` : ''}`, tone: 'bg-white/[0.06] text-ndp-text-muted' });
  }
  if (info.audio.some((a) => a.atmos)) chips.push({ label: 'Dolby Atmos', tone: 'bg-sky-500/15 text-sky-300' });

  // Distinct audio languages in file order, with the best track for each.
  const audioByLang = new Map<string, FileInfo['audio'][number]>();
  for (const a of info.audio) {
    const k = a.lang ?? 'und';
    if (!audioByLang.has(k)) audioByLang.set(k, a);
  }
  const subLangs: { key: string; label: string }[] = [];
  const seenSub = new Set<string>();
  for (const s of info.subtitles) {
    const k = `${s.lang ?? 'und'}${s.forced ? ':f' : ''}${s.sdh ? ':sdh' : ''}`;
    if (seenSub.has(k)) continue;
    seenSub.add(k);
    const extra = [s.forced ? t('fileinfo.forced', 'forced') : null, s.sdh ? 'SDH' : null].filter(Boolean).join(', ');
    subLangs.push({ key: k, label: `${lang(s.lang)}${extra ? ` (${extra})` : ''}` });
  }
  const visibleSubs = showAllSubs ? subLangs : subLangs.slice(0, 6);

  const facts = [
    info.sizeBytes ? gb(info.sizeBytes) : null,
    info.durationSec ? hm(info.durationSec) : null,
    info.bitrateKbps ? `${(info.bitrateKbps / 1000).toFixed(1)} Mb/s` : null,
    info.container ? info.container.toUpperCase().replace('MATROSKA', 'MKV') : null,
  ].filter(Boolean).join(' · ');

  return (
    <section className="mt-6">
      <h3 className="font-display-title text-2xl text-ndp-text mb-3">
        {t('fileinfo.title', 'Your copy')}
        {info.sample && (
          <span className="ml-2 font-sans normal-case tracking-normal text-sm font-normal text-ndp-text-dim">
            {t('fileinfo.sample', 'from S{{s}}{{e}}', { s: String(info.sample.season).padStart(2, '0'), e: info.sample.episode ? `E${String(info.sample.episode).padStart(2, '0')}` : '' })}
          </span>
        )}
      </h3>
      <div className="rounded-xl bg-ndp-surface/80 ring-1 ring-inset ring-white/[0.06] divide-y divide-white/[0.06] overflow-hidden">
        <div className="px-4 py-3">
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span key={c.label} className={clsx('inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold', c.tone)}>{c.label}</span>
            ))}
          </div>
          {facts && <p className="flex items-center gap-1.5 text-xs text-ndp-text-dim mt-2"><HardDrive className="w-3.5 h-3.5" />{facts}</p>}
        </div>

        {audioByLang.size > 0 && (
          <div className="flex gap-3 px-4 py-3">
            <AudioLines className="w-4 h-4 text-ndp-text-dim flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ndp-text-dim mb-1">{t('fileinfo.audio', 'Audio')}</p>
              <ul className="space-y-0.5">
                {[...audioByLang.values()].map((a, i) => (
                  <li key={`${a.lang}-${i}`} className="text-sm text-ndp-text">
                    {lang(a.lang)}
                    <span className="text-ndp-text-dim"> · {a.codec}{a.atmos && !/atmos/i.test(a.codec) ? ' Atmos' : ''}{a.channels ? ` ${a.channels}` : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {subLangs.length > 0 && (
          <div className="flex gap-3 px-4 py-3">
            <Captions className="w-4 h-4 text-ndp-text-dim flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ndp-text-dim mb-1">
                {t('fileinfo.subtitles', 'Subtitles')} <span className="normal-case tracking-normal font-normal">· {subLangs.length}</span>
              </p>
              <p className="text-sm text-ndp-text leading-relaxed">
                {visibleSubs.map((s) => s.label).join(', ')}
                {subLangs.length > visibleSubs.length && (
                  <button type="button" onClick={() => setShowAllSubs(true)} className="ml-1.5 text-ndp-accent font-medium">
                    {t('fileinfo.more', '+{{n}} more', { n: subLangs.length - visibleSubs.length })}
                  </button>
                )}
              </p>
            </div>
          </div>
        )}

        {info.release && (
          <div className="flex gap-3 px-4 py-3">
            <Film className="w-4 h-4 text-ndp-text-dim flex-shrink-0 mt-0.5" />
            <p className="text-xs text-ndp-text-dim break-all">{info.release}</p>
          </div>
        )}
      </div>
    </section>
  );
}
