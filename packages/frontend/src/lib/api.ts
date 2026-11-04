import axios from 'axios';
import i18n from '@/i18n';
import { showToast } from '@/utils/toast';
import { expireAuthSession, getAuthSessionVersion } from './authSession';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});
const requestSessions = new WeakMap<object, number>();

// In-memory setup secret. Held only in the JS heap for the lifetime of the install wizard;
// never written to sessionStorage / localStorage so a tab snoop or stale tab can't read it.
// A page refresh during install loses it (acceptable — re-enter on the gate screen).
let setupSecret: string | null = null;
export function setSetupSecret(value: string | null): void { setupSecret = value; }

// Add language header (auth is via httpOnly cookie, no Bearer token needed)
api.interceptors.request.use((config) => {
  requestSessions.set(config, getAuthSessionVersion());
  config.headers['Accept-Language'] = i18n.language;
  // CSRF gate — paired with the backend X-Requested-With check.
  config.headers['X-Requested-With'] = 'lemedia';
  // "View as role" simulation for admin testing
  const viewAsRole = sessionStorage.getItem('view-as-role');
  if (viewAsRole) {
    config.headers['X-View-As-Role'] = viewAsRole;
  }
  // Attach setup secret for install routes — read from the module-local var, not storage.
  if (config.url?.startsWith('/setup/') || config.url === '/setup') {
    if (setupSecret) {
      config.headers['X-Setup-Secret'] = setupSecret;
    }
  }
  return config;
});

// Global NSFW detection — any API response with nsfwTmdbIds automatically updates the filter
let _addNsfwIds: ((ids: number[]) => void) | null = null;
export function registerNsfwHandler(handler: (ids: number[]) => void) { _addNsfwIds = handler; }

api.interceptors.response.use(
  (response) => {
    // LeMedia's API never answers with a web page. Getting one means something else replied in
    // its place: the reverse proxy's "Rebuilding" page during a restart, or a cached error page.
    // Treat it as "unavailable" so no screen tries to read data out of HTML (and crashes).
    const type = String(response.headers?.['content-type'] ?? '');
    if (type.includes('text/html') && typeof response.data === 'string') {
      const err = Object.assign(new Error('LeMedia is restarting, try again in a moment'), {
        isAxiosError: true,
        config: response.config,
        response: { ...response, status: 503, data: { error: 'SERVICE_UNAVAILABLE' } },
      });
      return Promise.reject(err);
    }
    const ids = response.data?.nsfwTmdbIds;
    if (Array.isArray(ids) && ids.length > 0 && _addNsfwIds) {
      _addNsfwIds(ids);
    }
    return response;
  },
  (error) => {
    // Only the backend's session errors invalidate auth. Wrong login/backup passwords,
    // permission denials and service failures must keep their normal local error handling.
    const status = error.response?.status;
    const code = error.response?.data?.error;
    const version = error.config && requestSessions.get(error.config);
    if (version !== undefined && ((status === 401 && code === 'UNAUTHORIZED')
      || (status === 403 && code === 'ACCOUNT_DISABLED'))) {
      expireAuthSession(version);
    }
    // 401 handling is done by AuthContext + InstallGuard, not here
    // Only a genuine permission refusal gets the generic "access denied" toast. A 403 with its
    // own code (CAPTCHA_FAILED, PROVIDER_DISABLED, SIGNUP_NOT_ALLOWED, ACCOUNT_DISABLED…) is
    // handled by the screen that made the call — the sign-in page shows the real reason — and a
    // blanket toast there wrongly told people they lacked permission when a captcha had expired.
    if (error.response?.status === 403) {
      const code = error.response.data?.error;
      const generic = !code || code === 'FORBIDDEN' || code === 'Forbidden';
      const url: string = error.config?.url ?? '';
      if (generic && !url.startsWith('/auth/')) {
        const translated = i18n.t('common.forbidden', 'Access denied');
        showToast(translated, 'error');
        if (code) error.response.data.error = translated;
      }
    }
    return Promise.reject(error);
  }
);


export default api;

// TMDB image helpers
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

export function posterUrl(path: string | null, size = 'w500'): string {
  if (!path) return '';
  if (path.startsWith('http')) return path; // Full URL (TVDB etc.)
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export function backdropUrl(path: string | null, size = 'original'): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}
