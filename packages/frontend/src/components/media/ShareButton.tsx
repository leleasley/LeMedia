import { useState, useRef, useEffect } from 'react';
import { Share2, Check, ChevronDown } from 'lucide-react';
import api from '@/lib/api';

const EXPIRY_OPTIONS = [
  { days: 1, labelKey: 'share.expires_1d', fallback: '1 day' },
  { days: 7, labelKey: 'share.expires_7d', fallback: '7 days' },
  { days: 30, labelKey: 'share.expires_30d', fallback: '30 days' },
];

export default function ShareButton({ tmdbId, mediaType, title }: Readonly<{ tmdbId: number; mediaType: 'movie' | 'tv'; title: string }>) {
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(7);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleShare = async (expiresInDays: number) => {
    setLoading(true);
    setOpen(false);
    try {
      const { data } = await api.post('/share', { tmdbId, mediaType, title, expiresInDays });
      const url = `${window.location.origin}${data.url}`;
      if (navigator.share && /mobile/i.test(navigator.userAgent)) {
        await navigator.share({ title, url }).catch(async () => { await navigator.clipboard.writeText(url); });
      } else {
        await navigator.clipboard.writeText(url);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // silent — share creation failed (offline?), nothing to copy
    } finally { setLoading(false); }
  };

  return (
    <div className="relative" ref={ref}>
      <div className="flex">
        <button onClick={() => void handleShare(days)} disabled={loading} className="btn-secondary flex items-center gap-2 rounded-r-none border-r-0">
          {copied ? <Check className="w-4 h-4 text-green-500" /> : <Share2 className="w-4 h-4" />}
          {copied ? 'Link copied' : 'Share'}
        </button>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label="Link expiry"
          className="btn-secondary rounded-l-none px-2"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
      {open && (
        <div className="absolute left-0 top-full mt-2 w-44 card shadow-2xl shadow-black/50 border border-white/10 animate-fade-in overflow-hidden z-30">
          <p className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ndp-text-dim">Link expires</p>
          {EXPIRY_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              onClick={() => { setDays(opt.days); void handleShare(opt.days); }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-white/5 ${days === opt.days ? 'text-ndp-accent font-semibold' : 'text-ndp-text'}`}
            >
              {opt.fallback}{days === opt.days ? ' ✓' : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
