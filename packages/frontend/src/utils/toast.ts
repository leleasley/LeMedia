import i18n from '@/i18n';

/** Backend UPPER_SNAKE error token → localised message via `errors.<TOKEN>` key. */
export function translateBackendError(token: string | undefined, fallback: string): string {
  if (!token) return fallback;
  if (!/^[A-Z][A-Z0-9_]*$/.test(token)) return token;
  const key = `errors.${token}`;
  const translated = i18n.t(key);
  return translated === key ? fallback : translated;
}

/** Extract backend error → localised string without popping a toast. */
export function extractApiError(err: unknown, fallback: string): string {
  const raw = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  const token = typeof raw === 'string' ? raw : null;
  return translateBackendError(token || undefined, fallback);
}

let lastRestartNote = 0;

export function toastApiError(err: unknown, fallback: string) {
  // LeMedia restarting (the proxy answered with its maintenance page): one calm note for the
  // whole app instead of a red error from every screen. Screens retry and recover on their own.
  if ((err as { response?: { data?: { error?: unknown } } })?.response?.data?.error === 'SERVICE_UNAVAILABLE') {
    if (Date.now() - lastRestartNote > 30_000) {
      lastRestartNote = Date.now();
      showToast(i18n.t('errors.SERVICE_UNAVAILABLE', 'LeMedia is restarting, it will be back in a few seconds'), 'info');
    }
    return;
  }
  console.error(err);
  showToast(extractApiError(err, fallback), 'error');
}

type ToastType = 'success' | 'error' | 'info';

const MAX_VISIBLE = 3;
const DURATION: Record<ToastType, number> = { success: 3500, info: 4000, error: 6500 };
const ICON_PATH: Record<ToastType, string> = {
  // lucide check / x / info, inline so this stays React-free and dependency-free
  success: 'M20 6 9 17l-5-5',
  error: 'M18 6 6 18M6 6l12 12',
  info: 'M12 16v-4M12 8h.01',
};

interface Live { el: HTMLElement; type: ToastType; message: string; timer: number | null; remaining: number; startedAt: number }
const live: Live[] = [];

function container(): HTMLElement {
  let root = document.getElementById('lm-toasts');
  if (!root) {
    root = document.createElement('div');
    root.id = 'lm-toasts';
    root.className = 'lm-toasts';
    document.body.appendChild(root);
  }
  return root;
}

function dismiss(t: Live) {
  const i = live.indexOf(t);
  if (i === -1) return;
  live.splice(i, 1);
  if (t.timer) window.clearTimeout(t.timer);
  t.el.classList.add('lm-toast--leaving');
  window.setTimeout(() => t.el.remove(), 180);
}

function arm(t: Live) {
  if (t.timer) window.clearTimeout(t.timer);
  t.startedAt = Date.now();
  t.timer = window.setTimeout(() => dismiss(t), t.remaining);
}

/** App-wide toast: stacked (max 3, newest last), identical messages merged, errors linger
 *  longer, hover/focus pauses, tap or × dismisses. Sits above the phone tab bar. React-free so
 *  it works from interceptors and utilities as well as components. */
export function showToast(message: string, type: ToastType = 'info') {
  if (typeof document === 'undefined' || !message) return;

  // Same message already showing → restart its clock instead of stacking a duplicate.
  const dup = live.find((t) => t.message === message && t.type === type);
  if (dup) {
    dup.remaining = DURATION[type];
    arm(dup);
    dup.el.classList.remove('lm-toast--bump');
    void dup.el.offsetWidth;
    dup.el.classList.add('lm-toast--bump');
    return;
  }

  while (live.length >= MAX_VISIBLE) dismiss(live[0]);

  const el = document.createElement('div');
  el.className = `lm-toast lm-toast--${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  el.setAttribute('aria-atomic', 'true');

  const icon = document.createElement('span');
  icon.className = 'lm-toast__icon';
  icon.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${type === 'info' ? '<circle cx="12" cy="12" r="9" stroke-width="2"/>' : ''}<path d="${ICON_PATH[type]}"/></svg>`;

  const text = document.createElement('p');
  text.className = 'lm-toast__text';
  text.textContent = message; // textContent, messages may carry server text, never HTML

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'lm-toast__close';
  close.setAttribute('aria-label', i18n.t('common.close', 'Close'));
  close.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

  el.append(icon, text, close);
  container().appendChild(el);

  const t: Live = { el, type, message, timer: null, remaining: DURATION[type], startedAt: Date.now() };
  live.push(t);
  arm(t);

  const pause = () => {
    if (!t.timer) return;
    window.clearTimeout(t.timer);
    t.timer = null;
    t.remaining = Math.max(1200, t.remaining - (Date.now() - t.startedAt));
  };
  el.addEventListener('mouseenter', pause);
  el.addEventListener('focusin', pause);
  el.addEventListener('mouseleave', () => arm(t));
  el.addEventListener('focusout', () => arm(t));
  el.addEventListener('click', () => dismiss(t));
}
