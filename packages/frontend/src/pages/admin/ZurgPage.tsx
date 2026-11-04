import { useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { ZurgTab } from './ZurgTab';
import { CleanupTab } from './CleanupTab';
import { LogConsole } from './arr/LogConsole';

type Section = 'overview' | 'cleanup' | 'console';
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'cleanup', label: 'Cleanup' }, { id: 'console', label: 'Console' },
];

/** Admin → Media → Zurg: status, the library cleanup tools, and the live log. `section` (not
 *  `view`) picks the tab because the Cleanup tab already uses `view` for its own tabs. */
export function ZurgPage() {
  const [params, setParams] = useSearchParams();
  const s = params.get('section') as Section | null;
  const section: Section = s && SECTIONS.some((x) => x.id === s) ? s : 'overview';
  const setSection = (next: Section) => setParams((p) => { const n = new URLSearchParams(p); n.set('section', next); n.delete('view'); return n; }, { replace: true });

  return (
    <div className="space-y-5">
      <div className="flex gap-1 border-b border-white/[0.06]" role="tablist">
        {SECTIONS.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={section === x.id} onClick={() => setSection(x.id)}
            className={clsx('relative px-3.5 h-11 text-sm font-medium whitespace-nowrap transition-colors', section === x.id ? 'text-ndp-text' : 'text-ndp-text-muted hover:text-ndp-text')}>
            {x.label}
            {section === x.id && <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-ndp-accent" aria-hidden />}
          </button>
        ))}
      </div>
      {section === 'overview' && <ZurgTab />}
      {section === 'cleanup' && <CleanupTab />}
      {section === 'console' && <LogConsole app="zurg" height="h-[68vh]" />}
    </div>
  );
}
