import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { X, Search, AlertCircle, ChevronLeft, ChevronRight, Home } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Diacritic-insensitive lowercase so "systeme" matches "Système" and "acces" matches "Accès".
const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replaceAll(/\p{Diacritic}/gu, '').trim();

// Show ⌘K on Apple platforms (macOS, iPadOS — navigator.platform starts with "Mac" or "iPad")
// and Ctrl+K everywhere else. The keybinding itself accepts both modifiers either way.
const isAppleHost = typeof navigator !== 'undefined' && /mac|ipad|iphone/i.test(navigator.platform);
const shortcutHint = isAppleHost ? '⌘K' : 'Ctrl+K';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useFeatures } from '@/context/FeaturesContext';
import { usePluginUpdatesCount } from '@/hooks/usePluginUpdatesCount';
import { ADMIN_TABS } from '@/pages/admin/tabsConfig';
import { useAdminGroups } from '@/components/layouts/useAdminGroups';
import { usePluginUI } from '@/plugins/usePlugins';
import { DynamicIcon } from '@/plugins/DynamicIcon';
import { UserCluster } from '@/components/nav/UserCluster';
import NotificationBell from '@/components/NotificationBell';
import { AdminJumpButton } from '@/components/nav/AdminJumpButton';
import SetupChecklistMenu from '@/components/nav/SetupChecklistMenu';
import { EncryptionUpgradeBanner } from '@/pages/admin/EncryptionUpgradeBanner';

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Service-backed pages (Zurg, Rex, Prowlarr, DMM, Radarr & Sonarr) only appear when configured.
  const adminGroups = useAdminGroups();
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const { features } = useFeatures();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { contributions: pluginTabs } = usePluginUI('admin.tabs');
  const pluginUpdatesCount = usePluginUpdatesCount();
  const [warnings, setWarnings] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [viewAsRole, setViewAsRoleState] = useState<string | null>(() => sessionStorage.getItem('view-as-role'));

  // `sidebarContent` is rendered twice (desktop aside + mobile drawer), so a plain ref would
  // get overwritten by whichever input mounts last — which on desktop is the hidden drawer copy.
  // Look up the currently visible one by data attribute + offsetParent check instead.
  const getVisibleSearchInput = () => {
    const inputs = document.querySelectorAll<HTMLInputElement>('[data-admin-search]');
    return Array.from(inputs).find((el) => el.offsetParent !== null) ?? null;
  };

  const setViewAsRole = (role: string | null) => {
    if (role) sessionStorage.setItem('view-as-role', role);
    else sessionStorage.removeItem('view-as-role');
    setViewAsRoleState(role);
  };

  const refreshWarnings = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/setup-status');
      setWarnings(data.warnings || {});
    } catch (err) {
      // Non-blocking: if setup-status is down, warnings just don't refresh. Keep the last known
      // warnings rather than clearing them so a transient 500 doesn't make the dots vanish.
      console.error('AdminLayout refreshWarnings failed', err);
    }
  }, []);

  const currentTab = searchParams.get('tab');
  useEffect(() => { refreshWarnings(); }, [currentTab, refreshWarnings]);
  // Phones get an admin home screen (no ?tab=) and a section screen per tab.
  const isMobileHub = !currentTab;
  // Scroll each new section to the top — <main> is its own scroller and keeps its offset.
  useEffect(() => { document.getElementById('main')?.scrollTo({ top: 0 }); }, [currentTab]);

  const pluginTabItems = useMemo(
    () =>
      pluginTabs.map((c) => ({
        id: `plugin:${c.pluginId}`,
        label: typeof c.props.label === 'string' ? c.props.label : c.pluginId,
        pluginIcon: typeof c.props.icon === 'string' ? c.props.icon : 'Puzzle',
      })),
    [pluginTabs]
  );

  const allTabIds = [...ADMIN_TABS.map((tb) => tb.id), ...pluginTabItems.map((tb) => tb.id)];
  const defaultTab = ADMIN_TABS[0]?.id ?? 'dashboard';
  const activeTab = currentTab && allTabIds.includes(currentTab) ? currentTab : defaultTab;
  const activeTabLabel =
    ADMIN_TABS.find((tb) => tb.id === activeTab)?.label ??
    pluginTabItems.find((tb) => tb.id === activeTab)?.label ??
    'admin.title';

  const setActiveTab = (tab: string) => {
    setSearchParams({ tab }, { replace: true });
  };
  /** Opening a section from the phone home screen pushes history, so swipe-back / the
   *  browser back button returns to the admin home instead of leaving admin entirely. */
  const openTab = (tab: string) => {
    setSearchParams({ tab });
  };
  const backToHub = () => {
    setSearchParams({}, { replace: true });
  };

  /** Flat list of searchable entries — native admin tabs + plugin-contributed tabs.
   *  Each entry carries its parent group label so we can both match against it (typing
   *  a group name surfaces all its tabs) and display it under the tab name in results. */
  type SearchEntry = {
    id: string;
    label: string;
    groupLabel: string;
    icon: LucideIcon | null;
    pluginIcon?: string;
    hasWarning: boolean;
  };

  const pluginGroupLabel = t('admin.sidebar.plugin_pages', 'Pages de plugins');
  const searchableTabs: SearchEntry[] = useMemo(() => {
    const nativeEntries: SearchEntry[] = adminGroups.flatMap((group) => {
      const groupLabel = t(group.label);
      return group.tabs.map((tab) => ({
        id: tab.id,
        label: t(tab.label),
        groupLabel,
        icon: tab.icon,
        hasWarning: !!warnings[tab.id],
      }));
    });
    const pluginEntries: SearchEntry[] = pluginTabItems.map((tb) => ({
      id: tb.id,
      label: tb.label,
      groupLabel: pluginGroupLabel,
      icon: null,
      pluginIcon: tb.pluginIcon,
      hasWarning: !!warnings[tb.id],
    }));
    return [...nativeEntries, ...pluginEntries];
  }, [adminGroups, t, warnings, pluginTabItems, pluginGroupLabel]);

  const trimmedQuery = searchQuery.trim();
  const searchResults = useMemo(() => {
    if (!trimmedQuery) return null;
    const needle = normalize(trimmedQuery);
    return searchableTabs.filter(
      (e) => normalize(e.label).includes(needle) || normalize(e.groupLabel).includes(needle)
    );
  }, [trimmedQuery, searchableTabs]);

  /** Global ⌘/Ctrl+K focuses the search input from anywhere in the admin. Works even when the
   *  user is typing in another field — we preventDefault to win the browser's default (Chrome
   *  opens the omnibox on Ctrl+K) and the event runs in capture phase so nested handlers can't
   *  swallow it first. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        const input = getVisibleSearchInput();
        if (!input) return;
        e.preventDefault();
        input.focus();
        input.select();
      }
    };
    globalThis.addEventListener('keydown', onKey, { capture: true });
    return () => globalThis.removeEventListener('keydown', onKey, { capture: true });
  }, []);

  // Redirect non-admins in an effect — calling navigate() during render triggers a React warning
  // and can cause a cross-component update. The same-render `return null` below still prevents
  // rendering the admin chrome for the one frame before the redirect kicks in.
  const canAccess = hasPermission('admin.*');
  useEffect(() => {
    if (!canAccess) navigate('/');
  }, [canAccess, navigate]);
  if (!canAccess) return null;

  const pickSearchResult = (id: string) => {
    setSearchQuery('');
    getVisibleSearchInput()?.blur();
    if (isMobileHub) openTab(id);
    else setActiveTab(id);
  };

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (searchQuery) setSearchQuery('');
      else e.currentTarget.blur();
      e.preventDefault();
    } else if (e.key === 'Enter' && searchResults && searchResults.length > 0) {
      pickSearchResult(searchResults[0].id);
    }
  };

  /** Desktop sidebar row — one per admin page, so every page is a single click away. */
  const renderNavRow = (id: string, label: string, iconEl: (active: boolean) => React.ReactNode, danger = false) => {
    const isActive = activeTab === id;
    return (
      <button
        key={id}
        onClick={() => setActiveTab(id)}
        aria-current={isActive ? 'page' : undefined}
        className={clsx(
          'group relative flex items-center gap-2.5 w-full h-8 pl-3 pr-2 rounded-lg text-left text-[13.5px] transition-colors',
          isActive ? 'bg-white/[0.07] text-ndp-text font-medium' : 'text-ndp-text-muted hover:text-ndp-text hover:bg-white/[0.04]',
        )}
      >
        {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-ndp-accent" aria-hidden />}
        <span className={clsx('flex-shrink-0', isActive ? 'text-ndp-accent' : danger ? 'text-ndp-danger/80' : 'text-ndp-text-dim group-hover:text-ndp-text-muted')}>
          {iconEl(isActive)}
        </span>
        <span className="flex-1 truncate">{label}</span>
        {warnings[id] && !isActive && (
          <AlertCircle className="w-3.5 h-3.5 text-ndp-warning flex-shrink-0" aria-label={t('admin.sidebar.needs_attention')} />
        )}
        {id === 'plugins' && pluginUpdatesCount > 0 && (
          <span className="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-ndp-accent/90 text-white text-[10px] font-semibold leading-none flex-shrink-0">
            {pluginUpdatesCount}
          </span>
        )}
      </button>
    );
  };

  const navHeading = (label: string) => (
    <p className="px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ndp-text-dim">{label}</p>
  );

  const searchInput = (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ndp-text-dim" />
      <input
        data-admin-search
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={onSearchKeyDown}
        placeholder={t('admin.sidebar.search_placeholder', 'Rechercher…')}
        className="w-full h-9 pl-9 pr-12 rounded-lg bg-white/5 border border-white/5 text-sm text-ndp-text placeholder:text-ndp-text-dim focus:outline-none focus:border-ndp-accent/30 focus:bg-white/[0.07]"
        aria-label={t('admin.sidebar.search_placeholder', 'Rechercher…')}
      />
      {searchQuery ? (
        <button
          onClick={() => { setSearchQuery(''); getVisibleSearchInput()?.focus(); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-ndp-text-dim hover:text-ndp-text hover:bg-white/10 transition-colors"
          aria-label={t('common.clear', 'Clear')}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      ) : (
        <kbd className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 items-center gap-0.5 px-1.5 h-5 rounded bg-white/5 text-[10px] font-mono text-ndp-text-dim border border-white/5 pointer-events-none">
          {shortcutHint}
        </kbd>
      )}
    </div>
  );

  const renderSearchResult = (entry: SearchEntry) => {
    const isActive = activeTab === entry.id;
    const Icon = entry.icon;
    return (
      <button
        key={entry.id}
        onClick={() => pickSearchResult(entry.id)}
        className={clsx(
          'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-left transition-colors',
          isActive ? 'bg-ndp-accent/10 text-ndp-accent' : 'text-ndp-text-muted hover:text-ndp-text hover:bg-white/5',
        )}
      >
        {Icon ? (
          <Icon className={clsx('w-4 h-4 flex-shrink-0', isActive ? 'text-ndp-accent' : 'text-ndp-text-dim')} />
        ) : entry.pluginIcon ? (
          <DynamicIcon name={entry.pluginIcon} className="w-4 h-4 flex-shrink-0" />
        ) : null}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{entry.label}</span>
            {entry.hasWarning && !isActive && (
              <AlertCircle className="w-3.5 h-3.5 text-ndp-warning flex-shrink-0" aria-label={t('admin.sidebar.needs_attention')} />
            )}
          </div>
          <p className={clsx('text-[11px] truncate mt-0.5', isActive ? 'text-ndp-accent/70' : 'text-ndp-text-dim')}>
            {entry.groupLabel}
          </p>
        </div>
      </button>
    );
  };

  const tabList = (
    <>
      {adminGroups.map((group) => (
        <div key={group.id} className={group.id === 'dashboard' ? '' : 'pt-5'}>
          {group.id !== 'dashboard' && navHeading(t(group.label))}
          <div className="space-y-0.5">
            {group.tabs.map((tab) => {
              const Icon = tab.icon;
              return renderNavRow(tab.id, t(tab.label), () => <Icon className="w-4 h-4" />, tab.id === 'danger');
            })}
          </div>
        </div>
      ))}
      {pluginTabItems.length > 0 && (
        <div className="pt-5">
          {navHeading(pluginGroupLabel)}
          <div className="space-y-0.5">
            {pluginTabItems.map((tb) => renderNavRow(tb.id, tb.label, () => <DynamicIcon name={tb.pluginIcon} className="w-4 h-4" />))}
          </div>
        </div>
      )}
    </>
  );

  /** Sidebar body. `withSearch=true` (mobile drawer) keeps the legacy inline search + results
   *  in the nav, since mobile doesn't see the topbar search. `withSearch=false` (desktop aside)
   *  drops the wordmark and search — those live in the topbar now — and always renders tabs. */
  const sidebarBody = (withSearch: boolean) => (
    <div className="flex flex-col h-full">
      {withSearch && (
        <div className="px-3 pt-5 pb-3 space-y-3">
          <p className="px-1 text-lg font-bold text-ndp-text tracking-tight" role="presentation">
            {features.siteName || 'LeMedia'}
          </p>
          {searchInput}
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label={t('admin.title')}>
        {withSearch && searchResults !== null ? (
          searchResults.length === 0 ? (
            <p className="px-3 py-6 text-xs text-ndp-text-dim text-center">
              {t('admin.sidebar.search_no_results', 'Aucun résultat')}
            </p>
          ) : (
            searchResults.map(renderSearchResult)
          )
        ) : tabList}
      </nav>

    </div>
  );

  /** Phone top bar — always offers a way back: to the app from the admin home, to the admin
   *  home from inside a section (plus a Home shortcut straight out of admin). */
  const mobileTopBar = (
    <header className="md:hidden flex-shrink-0 grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-2 pt-[env(safe-area-inset-top)] h-[calc(52px+env(safe-area-inset-top))] border-b border-white/[0.06] bg-ndp-bg">
      <div className="min-w-0">
        {isMobileHub ? (
          <Link to="/" className="inline-flex items-center gap-0.5 px-2 py-2 text-[15px] font-medium text-ndp-accent active:opacity-60 max-w-full">
            <ChevronLeft className="w-5 h-5 -ml-1 flex-shrink-0" />
            <span className="truncate">{features.siteName || 'LeMedia'}</span>
          </Link>
        ) : (
          <button type="button" onClick={backToHub} className="inline-flex items-center gap-0.5 px-2 py-2 text-[15px] font-medium text-ndp-accent active:opacity-60">
            <ChevronLeft className="w-5 h-5 -ml-1" />
            {t('admin.short_title', 'Admin')}
          </button>
        )}
      </div>
      <p className="text-[15px] font-semibold text-ndp-text truncate max-w-[50vw]">
        {isMobileHub ? t('admin.title') : t(activeTabLabel)}
      </p>
      <div className="flex justify-end">
        {!isMobileHub && (
          <Link to="/" aria-label={t('admin.back_to_app', 'Back to LeMedia')} className="p-2.5 text-ndp-text-muted active:opacity-60">
            <Home className="w-5 h-5" />
          </Link>
        )}
      </div>
    </header>
  );

  /** Phone admin home — search plus every section as grouped settings rows. */
  const mobileHub = (
    <div className="px-4 pt-5 pb-[calc(env(safe-area-inset-bottom)+2rem)] space-y-6">
      {searchInput}
      {searchResults !== null ? (
        <div className="rounded-xl bg-ndp-surface ring-1 ring-inset ring-white/[0.06] p-1">
          {searchResults.length === 0 ? (
            <p className="px-3 py-6 text-sm text-ndp-text-dim text-center">{t('admin.sidebar.search_no_results', 'Aucun résultat')}</p>
          ) : searchResults.map(renderSearchResult)}
        </div>
      ) : (
        <>
          {adminGroups.map((group) => (
            <section key={group.id}>
              <h3 className="px-1 mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ndp-text-dim">{t(group.label)}</h3>
              <div className="rounded-xl bg-ndp-surface ring-1 ring-inset ring-white/[0.06] overflow-hidden divide-y divide-white/[0.06]">
                {group.tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button key={tab.id} type="button" onClick={() => openTab(tab.id)} className="w-full flex items-center gap-3 px-3.5 py-3 text-left active:bg-white/[0.06] transition-colors">
                      <span className={clsx('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', tab.id === 'danger' ? 'bg-ndp-danger/15 text-ndp-danger' : 'bg-white/[0.06] text-ndp-text')}>
                        <Icon className="w-[17px] h-[17px]" />
                      </span>
                      <span className="flex-1 min-w-0 text-[15px] font-medium text-ndp-text truncate">{t(tab.label)}</span>
                      {warnings[tab.id] && <AlertCircle className="w-4 h-4 text-ndp-warning flex-shrink-0" aria-label={t('admin.sidebar.needs_attention')} />}
                      {tab.id === 'plugins' && pluginUpdatesCount > 0 && (
                        <span className="min-w-[20px] h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-ndp-accent text-white text-[11px] font-semibold">{pluginUpdatesCount}</span>
                      )}
                      <ChevronRight className="w-4 h-4 text-ndp-text-dim flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          {pluginTabItems.length > 0 && (
            <section>
              <h3 className="px-1 mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ndp-text-dim">{pluginGroupLabel}</h3>
              <div className="rounded-xl bg-ndp-surface ring-1 ring-inset ring-white/[0.06] overflow-hidden divide-y divide-white/[0.06]">
                {pluginTabItems.map((tb) => (
                  <button key={tb.id} type="button" onClick={() => openTab(tb.id)} className="w-full flex items-center gap-3 px-3.5 py-3 text-left active:bg-white/[0.06] transition-colors">
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-white/[0.06] text-ndp-text">
                      <DynamicIcon name={tb.pluginIcon} className="w-[17px] h-[17px]" />
                    </span>
                    <span className="flex-1 min-w-0 text-[15px] font-medium text-ndp-text truncate">{tb.label}</span>
                    {warnings[tb.id] && <AlertCircle className="w-4 h-4 text-ndp-warning flex-shrink-0" />}
                    <ChevronRight className="w-4 h-4 text-ndp-text-dim flex-shrink-0" />
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );

  /** Desktop topbar — wordmark on the left, viewport-centered search, icons on the right.
   *  Search is absolutely positioned so the wordmark length doesn't shift it (matches the
   *  /home topbar layout). */
  const desktopTopBar = (
    <header className="h-16 flex-shrink-0">
      <div
        className="h-full relative flex items-center gap-4 pl-3 sm:pl-4"
        style={{ paddingRight: 'max(1.5rem, calc((100vw - 1800px) / 2 + 1.5rem))' }}
      >
        <Link
          to="/"
          title={t('admin.back_to_app', 'Back to LeMedia')}
          className="group flex items-center gap-1.5 flex-shrink-0 relative z-10 px-2 py-1.5 -ml-2 rounded-lg hover:bg-white/5 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-ndp-text-dim group-hover:text-ndp-accent transition-colors" />
          <span className="font-display-title text-2xl text-ndp-text">{features.siteName || 'LeMedia'}</span>
          <span className="ml-1 px-2 py-0.5 rounded-full bg-white/[0.06] text-[10px] font-semibold uppercase tracking-[0.12em] text-ndp-text-muted">{t('admin.short_title', 'Admin')}</span>
        </Link>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-full max-w-lg px-4 pointer-events-auto">
            {searchInput}
            {searchResults !== null && (
              <div className="absolute left-4 right-4 top-full mt-2 card shadow-2xl shadow-black/50 border border-white/10 animate-fade-in overflow-hidden z-50">
                <div className="max-h-96 overflow-y-auto py-1 px-1 space-y-0.5">
                  {searchResults.length === 0 ? (
                    <p className="px-3 py-6 text-xs text-ndp-text-dim text-center">
                      {t('admin.sidebar.search_no_results', 'Aucun résultat')}
                    </p>
                  ) : (
                    searchResults.map(renderSearchResult)
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto flex-shrink-0 relative z-10">
          <SetupChecklistMenu />
          <AdminJumpButton />
          <NotificationBell />
          <UserCluster viewAsRole={viewAsRole} onViewAsRoleChange={setViewAsRole} variant="compact" />
        </div>
      </div>
    </header>
  );

  return (
    <div className="h-dvh bg-ndp-bg flex flex-col overflow-hidden">
      {/* Topbar spans the full viewport (above the sidebar) so its `max-w-[1800px] mx-auto` is
          centered against the same width as Layout.tsx's home topbar. Otherwise the max-w
          centers within `viewport - sidebar`, shifting avatar/notif ~60px right between pages. */}
      <div className="hidden md:block border-b border-white/5">{desktopTopBar}</div>

      <div className="flex flex-1 min-h-0">
      <aside className="hidden md:flex md:flex-col w-60 flex-shrink-0 border-r border-white/5 overflow-y-auto">
        {sidebarBody(false)}
      </aside>

      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        {mobileTopBar}
        {isMobileHub && <div className="md:hidden flex-1 min-h-0 overflow-y-auto overscroll-contain">{mobileHub}</div>}
        <main
          id="main"
          tabIndex={-1}
          className={clsx('flex-1 min-w-0 min-h-0 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)] md:pb-0', isMobileHub && 'hidden md:block')}
        >
          {children}
        </main>
      </div>
      </div>
      <EncryptionUpgradeBanner />
    </div>
  );
}
