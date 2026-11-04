import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, Circle, PartyPopper } from 'lucide-react';
import { clsx } from 'clsx';
import api, { setSetupSecret as setApiSetupSecret } from '@/lib/api';

interface ChecklistItem {
  id: string;
  required: boolean;
  done: boolean;
  href: string;
}

interface ChecklistResponse {
  items: ChecklistItem[];
}

interface Props {
  onGo: () => void;
}

const REDIRECT_SECONDS = 8;

export default function DoneStep({ onGo }: Readonly<Props>) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [countdown, setCountdown] = useState(REDIRECT_SECONDS);

  useEffect(() => {
    api.get<ChecklistResponse>('/admin/setup-checklist')
      .then(({ data }) => setItems(data.items))
      .catch(() => { /* surface stays, checklist optional */ });
  }, []);

  useEffect(() => {
    if (countdown <= 0) {
      setApiSetupSecret(null);
      globalThis.location.href = '/';
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const required = items.filter((i) => i.required);
  const optional = items.filter((i) => !i.required);
  const requiredDone = required.filter((i) => i.done).length;
  const allRequiredDone = required.length > 0 && requiredDone === required.length;

  const handleGo = () => {
    setApiSetupSecret(null);
    onGo();
  };

  return (
    <div className="space-y-6">
      <header className="text-center space-y-3">
        <div className="flex justify-center">
          <div className={clsx('w-16 h-16 rounded-full flex items-center justify-center', allRequiredDone ? 'bg-ndp-success/10' : 'bg-ndp-warning/10')}>
            <PartyPopper className={clsx('w-8 h-8', allRequiredDone ? 'text-ndp-success' : 'text-ndp-warning')} />
          </div>
        </div>
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-ndp-text">{t('install.done.title')}</h2>
          <p className="text-sm text-ndp-text-muted">{t('install.done.desc')}</p>
        </div>
      </header>

      {items.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-ndp-text-dim uppercase tracking-wider">
            {t('install.done.checklist_title')}
          </p>
          <ul className="space-y-1">
            {[...required, ...optional].map((item) => (
              <li key={item.id} className="flex items-center gap-2.5 text-sm">
                {item.done
                  ? <CheckCircle className="w-4 h-4 text-ndp-success flex-shrink-0" />
                  : <Circle className={clsx('w-4 h-4 flex-shrink-0', item.required ? 'text-ndp-warning' : 'text-ndp-text-dim')} />}
                <span className={clsx('flex-1', item.done ? 'text-ndp-text-muted line-through' : 'text-ndp-text')}>
                  {t(`admin.setup_checklist.items.${item.id}.title`)}
                </span>
                {!item.required && (
                  <span className="text-[10px] uppercase tracking-wider text-ndp-text-dim bg-white/5 px-1.5 py-0.5 rounded">
                    {t('admin.setup_checklist.optional')}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {!allRequiredDone && (
            <p className="text-xs text-ndp-warning mt-2">{t('install.done.followup_admin')}</p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <button type="button" onClick={handleGo} className="btn-primary text-sm w-full">
          {t('install.done.go_now')}
        </button>
        <p className="text-xs text-ndp-text-dim text-center">
          {t('install.done.redirect', { seconds: countdown })}
        </p>
      </div>
    </div>
  );
}
