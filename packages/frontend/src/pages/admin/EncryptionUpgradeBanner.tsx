import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Lock, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

interface FlaggedService {
  id: number;
  name: string;
  type: string;
  reason: 'plaintext' | 'undecryptable';
}

/** Custom DOM event ServiceModal (and any future writer) dispatches after a successful save —
 *  lets this banner re-check without coupling either side to the other or pulling in a state
 *  manager. */
export const SERVICE_SAVED_EVENT = 'lemedia:service-saved';

/**
 * Floating bottom-right "upgrade to AES-256-GCM encryption" prompt rendered globally for
 * admins as long as at least one Service row still holds an unencrypted credential.
 *
 * Self-contained: gates on the `admin.*` permission, fetches the security endpoint on mount,
 * re-fetches whenever the window regains focus or a `lemedia:service-saved` event fires, and
 * disappears silently as soon as every service has been re-saved through the encrypted write
 * path.
 */
export function EncryptionUpgradeBanner() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const [services, setServices] = useState<FlaggedService[]>([]);
  const [loaded, setLoaded] = useState(false);

  const isAdmin = !!user && hasPermission('admin.*');

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get<{ services: FlaggedService[] }>('/admin/security/services-needing-reencryption');
      setServices(data.services ?? []);
    } catch {
      setServices([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void refresh();
    const onFocus = () => { void refresh(); };
    const onSaved = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener(SERVICE_SAVED_EVENT, onSaved);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(SERVICE_SAVED_EVENT, onSaved);
    };
  }, [isAdmin, refresh]);

  if (!isAdmin || !loaded || services.length === 0) return null;

  // Pick worst reason — "undecryptable" is more urgent (service is broken until re-saved)
  // than "plaintext" (still works, just not encrypted yet).
  const hasUndecryptable = services.some((s) => s.reason === 'undecryptable');
  const titleKey = hasUndecryptable
    ? 'admin.security.undecryptable_banner.title'
    : 'admin.security.plaintext_banner.title';
  const bodyKey = hasUndecryptable
    ? 'admin.security.undecryptable_banner.body'
    : 'admin.security.plaintext_banner.body';

  return (
    <button
      type="button"
      onClick={() => navigate('/admin?tab=services')}
      className="fixed bottom-4 right-4 z-[60] max-w-sm w-[calc(100vw-2rem)] sm:w-auto animate-fade-in flex items-center gap-3 text-left px-4 py-3 min-h-[56px] rounded-xl bg-ndp-surface ring-1 ring-inset ring-ndp-warning/30 shadow-lg shadow-black/50 hover:bg-ndp-surface-light transition-colors"
    >
      <span className="admin-icon-tile bg-ndp-warning/15 text-ndp-warning">
        <Lock className="w-4 h-4" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-ndp-text text-sm">
          {t(titleKey, { count: services.length })}
        </p>
        <p className="text-xs text-ndp-text-muted leading-relaxed mt-0.5">
          {t(bodyKey, { count: services.length })}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-ndp-text-dim flex-shrink-0" aria-hidden />
    </button>
  );
}
