import { useEffect, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Routes, Route, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { showToast } from '@/utils/toast';
import { lazyWithReload } from '@/utils/lazyWithReload';
import { useScrollRestoration } from '@/hooks/useScrollRestoration';
import { useAuth } from '@/context/AuthContext';
import { useFeatures } from '@/context/FeaturesContext';
import { useBackend } from '@/context/BackendGate';
import Layout from '@/components/Layout';
import LoadingScreen from '@/components/LoadingScreen';
import HomePage from '@/pages/HomePage';
import LoginPage from '@/pages/LoginPage';
import ForgotPasswordPage from '@/pages/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/ResetPasswordPage';
import InvitePage from '@/pages/InvitePage';
import PlexReturnPage from '@/pages/PlexReturnPage';
import InstallPage from '@/pages/InstallPage';
import SharePage from '@/pages/SharePage';
import PrivacyPage from '@/pages/PrivacyPage';
import MediaDetailLoading from '@/components/media/MediaDetailLoading';
import MediaLayers from '@/components/media/MediaLayers';

// Heavy / below-the-fold routes are lazy so the initial bundle stays lean
// (Home + Login paint first; detail/search/calendar load on demand).
// lazyWithReload: a deploy rotates hashed chunk names under a running tab —
// a stale chunk 404s once, then we reload to the fresh bundle instead of crashing.
const SearchPage = lazyWithReload(() => import('@/pages/SearchPage'));
const MediaDetailPage = lazyWithReload(() => import('@/pages/MediaDetailPage'));
const PersonPage = lazyWithReload(() => import('@/pages/PersonPage'));
const RequestsPage = lazyWithReload(() => import('@/pages/RequestsPage'));

const AdminPage = lazyWithReload(() => import('@/pages/AdminPage'));
const AdminLayout = lazyWithReload(() => import('@/components/layouts/AdminLayout'));
import NoAccessPage from '@/pages/NoAccessPage';
const DiscoverGenrePage = lazyWithReload(() => import('@/pages/DiscoverGenrePage'));
const DiscoverProviderPage = lazyWithReload(() => import('@/pages/DiscoverProviderPage'));
const CategoryPage = lazyWithReload(() => import('@/pages/CategoryPage'));
const CalendarPage = lazyWithReload(() => import('@/pages/CalendarPage'));
import { PluginPage } from '@/plugins/PluginPage';
import { NsfwFilterContext, useNsfwFilterProvider } from '@/hooks/useNsfwFilter';

function ProtectedRoute({ children }: Readonly<{ children: React.ReactNode }>) {
  const { user, loading } = useAuth();
  const nsfwFilter = useNsfwFilterProvider();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <NsfwFilterContext.Provider value={nsfwFilter}>
      {children}
    </NsfwFilterContext.Provider>
  );
}

function RequireAccess({ children }: Readonly<{ children: React.ReactNode }>) {
  const { hasAccess, user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!hasAccess) return <NoAccessPage />;
  return <>{children}</>;
}

function RequireFeature({ feature, children }: Readonly<{ feature: string; children: React.ReactNode }>) {
  const { features, loading } = useFeatures();
  if (loading) return <LoadingScreen />;
  if (!features[feature]) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** LeMedia's scroll restoration (back to any page returns to where you were, incl. PWA
 *  swipe-back). MediaLayers adds the poster-reveal round trip on top of it. */
function ScrollRestorer() {
  useScrollRestoration();
  return null;
}

/** Notification taps: the service worker (public/sw-push.js) posts the target path to an
 *  already-open app instead of calling WindowClient.navigate(), which iOS home-screen apps
 *  don't support reliably. Route it through the SPA router here. */
function ServiceWorkerNavigationHandler() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; url?: string } | null;
      if (data?.type === 'lemedia:navigate' && typeof data.url === 'string' && data.url.startsWith('/')) {
        navigate(data.url);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);
  return null;
}

function LinkedToastHandler() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { refreshUser } = useAuth();
  const linked = searchParams.get('linked');
  useEffect(() => {
    if (linked) {
      showToast(`${linked.charAt(0).toUpperCase() + linked.slice(1)} account linked!`, 'success');
      refreshUser().catch(() => {});
      const next = new URLSearchParams(searchParams);
      next.delete('linked');
      setSearchParams(next, { replace: true });
    }
  }, [linked, searchParams, setSearchParams, refreshUser]);
  return null;
}

function SkipLink() {
  const { t } = useTranslation();
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-ndp-accent focus:text-white focus:font-medium focus:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
    >
      {t('nav.skip_to_content')}
    </a>
  );
}

export default function App() {
  const { installed } = useBackend();

  if (!installed) {
    return (
      <Routes>
        <Route path="/install" element={<InstallPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="*" element={<Navigate to="/install" replace />} />
      </Routes>
    );
  }

  return (
    <>
    <LinkedToastHandler />
    <ServiceWorkerNavigationHandler />
    <SkipLink />
    <Routes>
      <Route path="/s/:token" element={<SharePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      {/* Public by necessity: the visitor has lost the only credential they had. */}
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/invite" element={<InvitePage />} />
      <Route path="/plex-return" element={<PlexReturnPage />} />
      <Route
        path="/admin/*"
        element={
          <ProtectedRoute>
            <Suspense fallback={<LoadingScreen />}>
              <AdminLayout>
                <AdminPage />
              </AdminLayout>
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <ScrollRestorer />
              <Suspense fallback={<LoadingScreen />}>
              <MediaLayers>
                  <Route path="/" element={<RequireAccess><HomePage /></RequireAccess>} />
                  <Route path="/search" element={<RequireAccess><SearchPage /></RequireAccess>} />
                  <Route path="/movie/:id" element={<RequireAccess><Suspense fallback={<MediaDetailLoading />}><MediaDetailPage type="movie" /></Suspense></RequireAccess>} />
                  <Route path="/tv/:id" element={<RequireAccess><Suspense fallback={<MediaDetailLoading />}><MediaDetailPage type="tv" /></Suspense></RequireAccess>} />
                  <Route path="/person/:id" element={<RequireAccess><PersonPage /></RequireAccess>} />
                  <Route path="/requests" element={<RequireFeature feature="requestsEnabled"><RequireAccess><RequestsPage /></RequireAccess></RequireFeature>} />
                  <Route path="/discover/:mediaType/genre/:genreId" element={<RequireAccess><DiscoverGenrePage /></RequireAccess>} />
                  <Route path="/discover/:mediaType/provider/:providerId" element={<RequireAccess><DiscoverProviderPage /></RequireAccess>} />
                  <Route path="/category/:slug" element={<RequireAccess><CategoryPage /></RequireAccess>} />
                  <Route path="/calendar" element={<RequireFeature feature="calendarEnabled"><RequireAccess><CalendarPage /></RequireAccess></RequireFeature>} />
                  <Route path="/p/:pluginId/*" element={<PluginPage />} />
                  <Route path="/install" element={<Navigate to="/" replace />} />
              </MediaLayers>
              </Suspense>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
    </>
  );
}
