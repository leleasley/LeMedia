import { useState, useMemo, useEffect } from 'react';
import { avatarSrc } from '@/utils/avatarSrc';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { X, User as UserIcon, Sliders, Bell, LogOut, ChevronRight, ChevronLeft, type LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '@/context/AuthContext';
import { useVersionInfo } from '@/hooks/useVersionInfo';
import { useModal } from '@/hooks/useModal';
import { usePluginUI } from '@/plugins/usePlugins';
import { PluginHookComponent } from '@/plugins/PluginHookComponent';
import { DynamicIcon } from '@/plugins/DynamicIcon';
import type { PluginUIContribution } from '@/plugins/types';
import { AccountSection } from './sections/AccountSection';
import { PreferencesSection } from './sections/PreferencesSection';
import { NotificationsSection } from './sections/NotificationsSection';

type BuiltInId = 'account' | 'notifications' | 'preferences';

interface BuiltInSection {
  kind: 'builtin';
  id: BuiltInId;
  labelKey: string;
  icon: LucideIcon;
  order: number;
}

interface PluginSection {
  kind: 'plugin';
  /** Unique key across the merged list — `plugin:<pluginId>:<sectionId>`. */
  key: string;
  contribution: PluginUIContribution;
  label: string;
  iconName: string;
  permission?: string;
  order: number;
}

type Section = BuiltInSection | PluginSection;

const BUILT_IN_SECTIONS: BuiltInSection[] = [
  { kind: 'builtin', id: 'account', labelKey: 'account.sections.account', icon: UserIcon, order: 0 },
  { kind: 'builtin', id: 'notifications', labelKey: 'account.sections.notifications', icon: Bell, order: 50 },
  { kind: 'builtin', id: 'preferences', labelKey: 'account.sections.preferences', icon: Sliders, order: 100 },
];

interface AccountSectionProps {
  id: string;
  label: string;
  icon: string;
  permission?: string;
}

function toPluginSection(c: PluginUIContribution): PluginSection | null {
  const props = c.props as Partial<AccountSectionProps>;
  if (!props || typeof props.id !== 'string' || typeof props.label !== 'string' || typeof props.icon !== 'string') {
    return null;
  }
  return {
    kind: 'plugin',
    key: `plugin:${c.pluginId}:${props.id}`,
    contribution: c,
    label: props.label,
    iconName: props.icon,
    permission: props.permission,
    order: typeof c.order === 'number' ? c.order : 1000,
  };
}

interface AccountModalProps {
  open: boolean;
  onClose: () => void;
  viewAsRole: string | null;
  onViewAsRoleChange: (role: string | null) => void;
}

export default function AccountModal({ open, onClose, viewAsRole, onViewAsRoleChange }: AccountModalProps) {
  const versionInfo = useVersionInfo();
  const { t } = useTranslation();
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const { dialogRef, titleId } = useModal({ open, onClose });
  const [activeKey, setActiveKey] = useState<string>('account');
  const [mobileView, setMobileView] = useState<'menu' | 'content'>('menu');
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    if (open) {
      setActiveKey('account');
      setMobileView('menu');
      setAvatarFailed(false);
    }
  }, [open]);

  const { contributions } = usePluginUI('account.section');

  const sections = useMemo<Section[]>(() => {
    const pluginSections = contributions
      .map(toPluginSection)
      .filter((s): s is PluginSection => s !== null)
      .filter((s) => !s.permission || hasPermission(s.permission));
    return [...BUILT_IN_SECTIONS, ...pluginSections].sort((a, b) => a.order - b.order);
  }, [contributions, hasPermission]);

  const activeSection = useMemo<Section>(() => {
    const found = sections.find((s) => (s.kind === 'builtin' ? s.id : s.key) === activeKey);
    return found ?? BUILT_IN_SECTIONS[0];
  }, [activeKey, sections]);

  const handleLogout = async () => {
    onClose();
    await logout();
    navigate('/login');
  };

  const handleSelect = (key: string) => {
    setActiveKey(key);
    setMobileView('content');
  };

  if (!open || !user) return null;

  const profileName = user.displayName || user.providers?.find((p) => p.provider === 'google')?.username || user.email || '';
  const profileAvatar = user.avatar || (user.avatarSource !== 'none' && user.avatarSource !== 'dicebear'
    ? user.providers?.find((p) => p.provider === user.avatarSource)?.avatar
      || (!user.avatarSource ? user.providers?.find((p) => p.provider === 'google')?.avatar : null)
    : null);
  const avatarEl = profileAvatar && !avatarFailed ? (
    <img src={avatarSrc(profileAvatar)} alt="" referrerPolicy="no-referrer" onError={() => setAvatarFailed(true)} className="w-24 h-24 rounded-full object-cover ring-1 ring-white/10" />
  ) : (
    <div className="w-24 h-24 rounded-full bg-ndp-accent/15 flex items-center justify-center text-ndp-accent font-display text-5xl ring-1 ring-white/10">
      {(profileName || t('nav.account', 'Account'))[0].toUpperCase()}
    </div>
  );

  const sectionContent = activeSection.kind === 'plugin'
    ? <PluginHookComponent
        pluginId={activeSection.contribution.pluginId}
        hookPoint="account.section"
        contribution={activeSection.contribution}
        context={{ user, hasPermission, close: onClose }}
      />
    : activeSection.id === 'account'
      ? <AccountSection />
      : activeSection.id === 'notifications'
        ? <NotificationsSection />
        : <PreferencesSection viewAsRole={viewAsRole} onViewAsRoleChange={onViewAsRoleChange} />;

  const activeLabel = activeSection.kind === 'plugin'
    ? t(activeSection.label, activeSection.label)
    : t(activeSection.labelKey);
  const activeSubtitle = activeSection.kind === 'plugin'
    ? ''
    : t(`account.sections.${activeSection.id}.subtitle`, '');

  const isMenu = mobileView === 'menu';
  const sectionKey = (sec: Section) => (sec.kind === 'builtin' ? sec.id : sec.key);
  const sectionLabel = (sec: Section) => (sec.kind === 'builtin' ? t(sec.labelKey) : t(sec.label, sec.label));

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-stretch md:items-center justify-center bg-black/75 animate-fade-in md:p-6"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-ndp-bg w-full h-[100dvh] md:h-[80vh] md:max-w-5xl md:rounded-[14px] md:border md:border-white/[0.07] md:shadow-[0_24px_80px_-12px_rgba(0,0,0,0.75)] overflow-hidden flex flex-col md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <h1 id={titleId} className="sr-only">{t('account.sections.settings', 'Account settings')}</h1>

        {/* Mobile top bar, always has a way out (Done), plus Back inside a section */}
        <header className="md:hidden flex-shrink-0 grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-2 pt-[env(safe-area-inset-top)] h-[calc(52px+env(safe-area-inset-top))] border-b border-white/[0.06] bg-ndp-bg">
          <div>
            {!isMenu && (
              <button
                type="button"
                onClick={() => setMobileView('menu')}
                className="flex items-center gap-0.5 px-2 py-2 text-[15px] font-medium text-ndp-accent active:opacity-60"
              >
                <ChevronLeft className="w-5 h-5 -ml-1" />
                {t('nav.account', 'Account')}
              </button>
            )}
          </div>
          <p className="text-[15px] font-semibold text-ndp-text truncate max-w-[50vw]">
            {isMenu ? t('nav.account', 'Account') : activeLabel}
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-[15px] font-semibold text-ndp-accent active:opacity-60"
            >
              {t('common.done', 'Done')}
            </button>
          </div>
        </header>

        {/* Hub / sidebar */}
        <aside
          className={clsx(
            'w-full md:w-80 md:border-r border-white/[0.06] md:bg-ndp-surface/40 flex-col flex-shrink-0 overflow-y-auto',
            isMenu ? 'flex flex-1 md:flex-none' : 'hidden md:flex',
          )}
        >
          {/* Profile header */}
          <div className="px-5 pt-8 pb-6 md:pt-7 flex flex-col items-center text-center">
            <div className="relative">{avatarEl}</div>
            <p className="mt-4 font-display-title text-[32px] text-ndp-text max-w-full truncate">
              {profileName || t('nav.account', 'Account')}
            </p>
            {user.email && <p className="text-sm text-ndp-text-muted truncate max-w-full mt-1.5">{user.email}</p>}
            {user.role && (
              <span className="mt-3 px-2.5 py-1 rounded-full bg-white/[0.06] text-[11px] font-semibold uppercase tracking-[0.12em] text-ndp-text-muted">
                {user.role}
              </span>
            )}
          </div>

          {/* Section list */}
          <nav className="px-4 pb-4">
            <div className="rounded-xl bg-ndp-surface ring-1 ring-inset ring-white/[0.06] overflow-hidden divide-y divide-white/[0.06]">
              {sections.map((s) => {
                const key = sectionKey(s);
                const active = activeKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleSelect(key)}
                    className={clsx(
                      'w-full flex items-center gap-3 px-3.5 py-3 text-left transition-colors',
                      active ? 'md:bg-white/[0.05]' : 'hover:bg-white/[0.03]',
                      'active:bg-white/[0.06]',
                    )}
                  >
                    <span className={clsx(
                      'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                      active ? 'md:bg-ndp-accent md:text-white bg-white/[0.06] text-ndp-text' : 'bg-white/[0.06] text-ndp-text',
                    )}>
                      {s.kind === 'builtin'
                        ? <s.icon className="w-[17px] h-[17px]" />
                        : <DynamicIcon name={s.iconName} className="w-[17px] h-[17px]" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] font-medium text-ndp-text truncate">{sectionLabel(s)}</span>
                      {s.kind === 'builtin' && t(`account.sections.${s.id}.subtitle`, '') && (
                        <span className="block text-xs text-ndp-text-dim truncate mt-0.5">{t(`account.sections.${s.id}.subtitle`, '')}</span>
                      )}
                    </span>
                    <ChevronRight className="w-4 h-4 text-ndp-text-dim flex-shrink-0" />
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-xl bg-ndp-surface ring-1 ring-inset ring-white/[0.06] overflow-hidden">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-[15px] font-semibold text-ndp-danger hover:bg-ndp-danger/10 active:bg-ndp-danger/10 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                {t('nav.logout')}
              </button>
            </div>
            <Link to="/privacy" onClick={onClose} className="block mt-4 px-2 py-2 text-center text-xs text-ndp-text-dim hover:text-ndp-text underline underline-offset-4">{t('privacy.title')}</Link>
            <p className="mt-1 pb-2 text-center text-[11px] font-mono text-ndp-text-dim/80">
              {versionInfo?.updateAvailable && versionInfo.releaseUrl ? (
                <a href={versionInfo.releaseUrl} target="_blank" rel="noopener noreferrer" className="text-ndp-accent hover:underline">
                  LeMedia {versionInfo.current} · update available
                </a>
              ) : (
                <>LeMedia {versionInfo?.current ?? '…'}</>
              )}
            </p>
          </nav>
          <div className="pb-[env(safe-area-inset-bottom)]" />
        </aside>

        {/* Content */}
        <section
          className={clsx(
            'flex-1 min-w-0 min-h-0 flex-col relative',
            isMenu ? 'hidden md:flex' : 'flex',
          )}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close', 'Close')}
            className="hidden md:flex absolute top-4 right-4 z-10 p-2 rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex-1 overflow-y-auto overscroll-contain px-4 md:px-8 pt-5 md:pt-7 pb-[calc(env(safe-area-inset-bottom)+2rem)] md:pb-8">
            <div className="hidden md:block mb-6 pr-12">
              <h2 className="font-display-title text-4xl text-ndp-text truncate">{activeLabel}</h2>
              {activeSubtitle && (
                <p className="text-sm text-ndp-text-dim mt-1.5">{activeSubtitle}</p>
              )}
            </div>
            {activeSubtitle && <p className="md:hidden text-sm text-ndp-text-dim mb-5 px-1">{activeSubtitle}</p>}
            <div className="max-w-2xl">{sectionContent}</div>
          </div>
        </section>
      </div>
    </div>,
    document.body,
  );
}
