import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, X as XIcon, Eye, EyeOff, Home, Film, Calendar, Menu, X, Shield, Bell, ChevronLeft, CheckCheck, Search } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

import { clsx } from 'clsx';
import NotificationBell from '@/components/NotificationBell';
import SearchAutocomplete from '@/components/SearchAutocomplete';
import SearchOverlay from '@/components/search/SearchOverlay';
import NotificationList from '@/components/NotificationList';
import { AdminJumpButton } from '@/components/nav/AdminJumpButton';
import { useNotifications } from '@/hooks/useNotifications';
import { PluginSlot } from '@/plugins/PluginSlot';
import { DynamicIcon } from '@/plugins/DynamicIcon';
import { useFeatures } from '@/context/FeaturesContext';
import { UserCluster } from '@/components/nav/UserCluster';
import { LinkIcon } from '@/icons/LinkIcon';
import { Tooltip } from '@/components/ui/Tooltip';
import { EncryptionUpgradeBanner } from '@/pages/admin/EncryptionUpgradeBanner';

const ALL_NAV = [
  { path: '/', labelKey: 'nav.home', icon: Home, feature: null },
  { path: '/requests', labelKey: 'nav.requests', icon: Film, feature: 'requestsEnabled' as const },
  { path: '/calendar', labelKey: 'nav.calendar', icon: Calendar, feature: 'calendarEnabled' as const },
];

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [banner, setBanner] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [viewAsRole, setViewAsRoleState] = useState<string | null>(() => sessionStorage.getItem('view-as-role'));
  const { features } = useFeatures();
  const [scrolled, setScrolled] = useState(false);
  const { unreadCount, markAllRead } = useNotifications();
  const [mobileView, setMobileView] = useState<'main' | 'notifications'>('main');
  const hasMenuBadge = unreadCount > 0;

  useEffect(() => {
    if (!drawerOpen) setMobileView('main');
  }, [drawerOpen]);

  const setViewAsRole = (role: string | null) => {
    if (role) sessionStorage.setItem('view-as-role', role);
    else sessionStorage.removeItem('view-as-role');
    setViewAsRoleState(role);
  };

  useEffect(() => {
    api.get('/app/banner').then(({ data }) => setBanner(data.banner)).catch((err) => console.warn("[Layout] banner fetch failed", err));
  }, []);

  const navItems = ALL_NAV.filter(({ feature }) => !feature || features[feature]);

  // Custom admin-defined links (#167) split by position relative to the topbar search bar.
  const customLinks = (features.customLinks ?? []).slice().sort((a, b) => a.order - b.order);
  const leftLinks = customLinks.filter((l) => l.position === 'left');
  const rightLinks = customLinks.filter((l) => l.position === 'right');

  useEffect(() => {
    if (location.pathname === '/search') {
      const q = searchParams.get('q') || '';
      setSearchQuery(q);
    } else {
      setSearchQuery('');
    }
  }, [location.pathname, searchParams]);

  // Phone search overlay: open state lives in the history entry, so the back gesture closes it.
  const searchOverlayOpen = !!(location.state as { searchOverlay?: boolean } | null)?.searchOverlay;
  const overlayInputRef = useRef<HTMLInputElement>(null);
  const openSearch = () => {
    overlayInputRef.current?.focus({ preventScroll: true });
    if (!searchOverlayOpen) {
      navigate(`${location.pathname}${location.search}`, { state: { searchOverlay: true } });
    }
  };
  const closeSearch = () => {
    if (searchOverlayOpen) navigate(-1);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setDrawerOpen(false);
    }
  };

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const hasBanner = banner && !bannerDismissed;
  const hasViewAsBanner = !!viewAsRole;
  const topOffset = (hasBanner ? 10 : 0) + (hasViewAsBanner ? 10 : 0);

  return (
    <div className="min-h-dvh bg-ndp-bg">
      {hasBanner && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-ndp-warning/90 backdrop-blur-sm text-black px-4 py-2 flex items-center justify-center gap-3">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <p className="text-sm font-medium text-center">{banner}</p>
          <button onClick={() => setBannerDismissed(true)} className="p-0.5 hover:bg-black/10 rounded flex-shrink-0">
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {viewAsRole && (
        <div className={clsx(
          'fixed left-0 right-0 z-[59] bg-amber-600 text-white px-4 py-2 flex items-center justify-center gap-3',
          hasBanner ? 'top-10' : 'top-0'
        )}>
          <Eye className="w-4 h-4 flex-shrink-0" />
          <p className="text-sm font-medium">
            {t('admin.view_as.active', 'Viewing as "{{role}}"', { role: viewAsRole })}
          </p>
          <button
            onClick={() => setViewAsRole(null)}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium transition-colors"
          >
            <EyeOff className="w-3 h-3" />
            {t('admin.view_as.stop', 'Stop')}
          </button>
        </div>
      )}

      {/* Mobile top bar, search + profile, Dynamic Island aware, no hamburger, transparent */}
      <nav
        className="md:hidden fixed left-0 right-0 z-40 h-14 flex items-center gap-2 px-3"
        style={{ top: 'calc(env(safe-area-inset-top) + 6px)' }}
      >
        {/* Opens the full-screen search panel. Focus happens inside the tap so iOS raises the keyboard. */}
        <button
          type="button"
          onClick={openSearch}
          className="flex-1 min-w-0 h-11 flex items-center gap-2.5 pl-3.5 pr-4 rounded-full bg-black/55 border border-white/10 text-left active:bg-black/70 transition-colors"
        >
          <Search className="w-4 h-4 text-white/60 flex-shrink-0" />
          <span className={clsx('text-[15px] truncate', searchQuery ? 'text-white' : 'text-white/55')}>
            {searchQuery || t('search.placeholder_short')}
          </span>
        </button>
        <div className="flex items-center gap-1 flex-shrink-0">
          <NotificationBell />
          <UserCluster viewAsRole={viewAsRole} onViewAsRoleChange={setViewAsRole} />
        </div>
      </nav>

      {/* Mobile bottom nav, docked tab bar, solid (no blur) so labels stay crisp over artwork */}
      <nav
        className={clsx(
          'md:hidden fixed inset-x-0 bottom-0 z-50 bg-ndp-bg/[0.97] border-t border-white/[0.07]',
          location.pathname.startsWith('/admin') && 'hidden'
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="h-[58px] grid grid-flow-col auto-cols-fr">
          {navItems.map(({ path, labelKey, icon: Icon }) => {
            const active = location.pathname === path;
            return (
              <Link
                key={path}
                to={path}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'relative flex flex-col items-center justify-center gap-1 text-[10px] font-semibold tracking-wide transition-colors active:opacity-70',
                  active ? 'text-ndp-text' : 'text-ndp-text-dim'
                )}
              >
                <span className={clsx('absolute top-0 h-[2px] w-8 rounded-b-full transition-colors', active ? 'bg-ndp-accent' : 'bg-transparent')} />
                <Icon className={clsx('w-[22px] h-[22px]', active && 'text-ndp-accent')} strokeWidth={active ? 2.2 : 1.7} />
                <span>{t(labelKey)}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setDrawerOpen(true)}
            aria-expanded={drawerOpen}
            className={clsx(
              'relative flex flex-col items-center justify-center gap-1 text-[10px] font-semibold tracking-wide transition-colors active:opacity-70',
              drawerOpen ? 'text-ndp-text' : 'text-ndp-text-dim'
            )}
          >
            <span className={clsx('absolute top-0 h-[2px] w-8 rounded-b-full', drawerOpen ? 'bg-ndp-accent' : 'bg-transparent')} />
            <span className="relative">
              <Menu className={clsx('w-[22px] h-[22px]', drawerOpen && 'text-ndp-accent')} strokeWidth={drawerOpen ? 2.2 : 1.7} />
              {hasMenuBadge && <span className="absolute -right-1 -top-0.5 w-2 h-2 rounded-full bg-ndp-accent ring-2 ring-ndp-bg" />}
            </span>
            <span>{t('nav.menu', 'Menu')}</span>
          </button>
        </div>
      </nav>

      {/* Desktop header */}
      <nav
        className={clsx(
          'hidden md:block fixed left-0 right-0 z-50 transition-[background-color,backdrop-filter] duration-300',
          scrolled ? 'bg-ndp-surface/80 backdrop-blur-xl' : 'bg-transparent'
        )}
        style={{ top: `${topOffset * 4}px` }}
      >
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6">
          <div className="lemedia-header-grid">
            <div className="lemedia-header-start">
              {navItems.map(({ path, labelKey, icon: Icon }) => (
                <Link
                  key={path}
                  aria-label={t(labelKey)} title={t(labelKey)}
                  to={path}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200',
                    location.pathname === path
                      ? 'bg-ndp-accent/10 text-ndp-accent'
                      : 'text-ndp-text-muted hover:text-ndp-text hover:bg-white/5'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span className="lemedia-nav-label">{t(labelKey)}</span>
                </Link>
              ))}
              <PluginSlot
                hookPoint="nav"
                renderItem={(c) => (
                  <Link
                    key={c.pluginId}
                    to={c.props.path as string}
                    aria-label={c.props.label as string}
                    className={clsx(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200',
                      location.pathname.startsWith(c.props.path as string)
                        ? 'bg-ndp-accent/10 text-ndp-accent'
                        : 'text-ndp-text-muted hover:text-ndp-text hover:bg-white/5'
                    )}
                  >
                    <DynamicIcon name={c.props.icon as string} className="w-4 h-4" />
                    <span className="lemedia-nav-label">{c.props.label as string}</span>
                  </Link>
                )}
              />
              {leftLinks.map((link) => (
                <a
                  key={link.id}
                  aria-label={link.label}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-ndp-text-muted hover:text-ndp-text hover:bg-white/5 transition-all duration-200"
                >
                  <LinkIcon value={link.icon} className="w-4 h-4" />
                  <span className="lemedia-nav-label">{link.label}</span>
                </a>
              ))}
            </div>

            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <form onSubmit={handleSearch} className="w-full max-w-lg px-4 pointer-events-auto">
                <SearchAutocomplete
                  value={searchQuery}
                  onChange={setSearchQuery}
                  onSubmit={handleSearch}
                  placeholder={t('search.placeholder')}
                />
              </form>
            </div>

            <div className="lemedia-header-end">
              {rightLinks.map((link) => (
                <Tooltip key={link.id} label={link.label}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={link.label}
                    className="p-2 text-ndp-text-muted hover:text-ndp-text rounded-lg hover:bg-white/5 transition-colors flex items-center justify-center"
                  >
                    <LinkIcon value={link.icon} className="w-5 h-5" />
                  </a>
                </Tooltip>
              ))}

              <PluginSlot hookPoint="header.actions" context={{ user, isAdmin: hasPermission('admin.*'), hasPermission }} />

              <AdminJumpButton />
              <NotificationBell />

              <UserCluster viewAsRole={viewAsRole} onViewAsRoleChange={setViewAsRole} />
            </div>
          </div>
        </div>
      </nav>

      <div
        className={clsx(
          'md:hidden fixed inset-0 z-[55] bg-black/60 backdrop-blur-sm transition-opacity duration-300',
          drawerOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={() => setDrawerOpen(false)}
        aria-hidden={!drawerOpen}
      />
      {/* Bottom-up sheet drawer, slides up from the mobile nav. Header at top of the sheet
          (since the trigger is at the bottom of the screen, the close affordance reads naturally
          near where the user's thumb already is on the bottom bar). */}
      <aside
        className={clsx(
          'md:hidden fixed inset-x-0 bottom-0 z-[56] bg-ndp-surface border border-white/10 rounded-t-[18px] max-h-[82vh] transform transition-transform duration-300 flex flex-col shadow-[0_-18px_60px_rgba(0,0,0,0.5)]',
          drawerOpen ? 'translate-y-0' : 'translate-y-full'
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-hidden={!drawerOpen}
      >
        <div className="w-9 h-1 bg-white/20 rounded-full mx-auto mt-2.5 mb-1 flex-shrink-0" />
        <div className="flex items-center justify-between px-5 h-14 flex-shrink-0">
          {mobileView === 'notifications' ? (
            <button
              onClick={() => setMobileView('main')}
              className="flex items-center gap-1.5 -ml-1.5 px-1.5 py-1 rounded-lg hover:bg-white/5 transition-colors"
              aria-label={t('common.back', 'Back')}
            >
              <ChevronLeft className="w-4 h-4 text-ndp-text-muted" />
              <span className="text-base font-bold text-ndp-text">{t('notifications.title')}</span>
            </button>
          ) : (
            <span className="text-base font-bold text-ndp-text">{features.siteName}</span>
          )}
          <div className="flex items-center gap-1">
            {mobileView === 'notifications' && unreadCount > 0 && (
              <button
                onClick={() => markAllRead()}
                className="flex items-center gap-1 text-xs text-ndp-text-dim hover:text-ndp-accent transition-colors px-2 py-1 rounded hover:bg-white/5"
                title={t('notifications.mark_all_read')}
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>{t('notifications.mark_all_read')}</span>
              </button>
            )}
            <button
              onClick={() => setDrawerOpen(false)}
              className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
              aria-label={t('common.close', 'Close')}
            >
              <X className="w-4 h-4 text-ndp-text-muted" />
            </button>
          </div>
        </div>

        {mobileView === 'main' ? (
          <nav className="flex-1 overflow-y-auto px-4 pb-5 pt-1">
            <div className="mb-4 rounded-2xl border border-white/8 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-2">
              <UserCluster
                viewAsRole={viewAsRole}
                onViewAsRoleChange={setViewAsRole}
                variant="expanded"
                onOpen={() => setDrawerOpen(false)}
              />
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
            {navItems.map(({ path, labelKey, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                onClick={() => setDrawerOpen(false)}
                aria-current={location.pathname === path ? 'page' : undefined}
                className={clsx(
                  'min-h-[82px] flex flex-col items-center justify-center gap-2 px-2 py-3 rounded-2xl border text-xs font-medium text-center transition-all active:scale-[0.97]',
                  location.pathname === path
                    ? 'border-ndp-accent/30 bg-ndp-accent/10 text-ndp-accent'
                    : 'border-white/5 bg-black/10 text-ndp-text-muted hover:text-ndp-text hover:bg-white/[0.04]'
                )}
              >
                <Icon className="w-5 h-5 flex-shrink-0" strokeWidth={location.pathname === path ? 2.3 : 1.8} />
                <span className="line-clamp-1">{t(labelKey)}</span>
              </Link>
            ))}
            </div>
            <div className="h-px bg-white/[0.07] mb-3" />
            <PluginSlot
              hookPoint="nav"
              renderItem={(c) => (
                <Link
                  key={c.pluginId}
                  to={c.props.path as string}
                  onClick={() => setDrawerOpen(false)}
                  className={clsx(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    location.pathname.startsWith(c.props.path as string)
                      ? 'bg-ndp-accent/10 text-ndp-accent'
                      : 'text-ndp-text-muted hover:text-ndp-text hover:bg-white/5'
                  )}
                >
                  <DynamicIcon name={c.props.icon as string} className="w-5 h-5 flex-shrink-0" />
                  <span className="truncate">{c.props.label as string}</span>
                </Link>
              )}
            />
            {leftLinks.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-ndp-text-muted hover:text-ndp-text hover:bg-white/5 transition-colors"
              >
                <LinkIcon value={link.icon} className="w-5 h-5 flex-shrink-0" />
                <span className="truncate">{link.label}</span>
              </a>
            ))}

            <div className="h-px bg-white/5 my-2" />

            <button
              onClick={() => setMobileView('notifications')}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl border border-white/[0.06] bg-black/10 text-sm font-medium text-ndp-text-muted hover:text-ndp-text hover:bg-white/[0.04] transition-colors"
            >
              <Bell className="w-5 h-5 flex-shrink-0" />
              <span className="flex-1 text-left truncate">{t('notifications.title')}</span>
              {unreadCount > 0 && (
                <span className="min-w-[20px] h-5 flex items-center justify-center rounded-full bg-ndp-accent text-[10px] font-bold text-white px-1.5">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {rightLinks.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-ndp-text-muted hover:text-ndp-text hover:bg-white/5 transition-colors"
              >
                <LinkIcon value={link.icon} className="w-5 h-5 flex-shrink-0" />
                <span className="truncate">{link.label}</span>
              </a>
            ))}

            {hasPermission('admin.*') && (
              <Link
                to="/admin"
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-ndp-text-muted hover:text-ndp-accent hover:bg-white/5 transition-colors"
              >
                <Shield className="w-5 h-5 flex-shrink-0" />
                <span className="truncate">{t('nav.admin')}</span>
              </Link>
            )}
          </nav>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <NotificationList actionsAlwaysVisible onAction={() => setDrawerOpen(false)} />
          </div>
        )}
      </aside>

      <SearchOverlay
        open={searchOverlayOpen}
        initialQuery={location.pathname === '/search' ? searchQuery : ''}
        inputRef={overlayInputRef}
        onClose={closeSearch}
      />

      <main
        id="main"
        tabIndex={-1}
        className={clsx(
          'min-h-dvh',
          'pb-[calc(58px+env(safe-area-inset-bottom)+24px)] md:pb-0',
          location.pathname === '/'
            ? 'pt-0'
            : 'pt-[calc(3.5rem+env(safe-area-inset-top)+14px+var(--banner-offset,0px))] md:pt-[calc(4rem+var(--banner-offset,0px))]'
        )}
        style={{ ['--banner-offset' as string]: `${topOffset * 4}px` }}
      >
        <div key={location.pathname} className="animate-page-in">
          {children}
        </div>
      </main>
      <EncryptionUpgradeBanner />
    </div>
  );
}
