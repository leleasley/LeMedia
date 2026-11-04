import api from '@/lib/api';

/** Plex OAuth PIN flow used by LoginPage, InstallPage, UsersTab, and ServiceModal.
 *
 *  UX: opens a plex.tv popup (Safari blocks `window.open()` after an `await`, so the popup has
 *  to be opened synchronously from the user gesture — the caller passes us the already-opened
 *  window). We create a PIN, point the popup at plex.tv, then poll the "check" endpoint every
 *  second up to 2 minutes. On success we call `onToken` with the Plex token; on expiry / error
 *  we call `onError`. The returned `cancel` function stops polling and closes the popup.
 *
 *  The check endpoint differs per call site (/auth/plex/callback for login, /setup/plex-check
 *  for install, /admin/users/:id/link-provider for account linking, /admin/plex-check for the
 *  service-config admin flow), so it's passed in as `checkEndpoint` + `checkPayload` builder. */

export interface PlexPinFlowOptions {
  /** Popup already opened synchronously by the caller (required for Safari). */
  authWindow: Window | null;
  /** Endpoint to call every second until we get a token. Receives `{ pinId }` plus anything
   *  the caller adds via `checkPayload`. */
  checkEndpoint: string;
  /** Extra fields to merge into the check POST body (e.g. `{ provider: 'plex' }`). */
  checkPayload?: Record<string, unknown>;
  /** Endpoint to create the PIN — defaults to the public /auth/plex/pin used by login/link;
   *  admins configuring a service use `/admin/plex-pin`, install wizard uses `/setup/plex-pin`. */
  pinEndpoint?: string;
  /** Body for the PIN-creation POST. Login passes `{ forward: true }` so Plex forwards the auth tab
   *  back to LeMedia (#212); other flows omit it so they are NOT forwarded. */
  pinPayload?: Record<string, unknown>;
  /** Response shape varies: login/link returns `{ pin: { id }, authUrl }`, setup/admin returns
   *  the same shape, but linkAccount checks `linkData.success` instead of a token. The caller
   *  tells us what "got a token" means via `extractToken` (return null to keep polling). */
  extractToken: (checkResponse: unknown) => string | null;
  /** Called when polling yields a token. */
  onToken: (token: string) => void;
  /** Called on PIN creation failure, timeout (120 attempts), or if the caller wants to give up
   *  on a terminal error — the default-stop heuristic is "polling response has a 4xx status
   *  that isn't 400 (PIN not yet validated)". */
  onError: () => void;
  /** Max attempts before giving up. 120 × 1s = 2 minutes, matches Plex PIN TTL. */
  maxAttempts?: number;
  /** When the popup was blocked (authWindow null/closed) and this is set, navigate the current
   *  tab to the provider auth URL instead of polling blindly for 2 minutes. Only safe for flows
   *  whose return page finalizes the session itself (login's /plex-return does, #212) — other
   *  callers leave it off and keep the polling behavior. */
  redirectIfPopupBlocked?: boolean;
}

export interface PlexPinFlowHandle {
  /** Stops polling and closes the popup. Safe to call multiple times. */
  cancel: () => void;
}

export function startPlexPinFlow(opts: PlexPinFlowOptions): PlexPinFlowHandle {
  const {
    authWindow,
    checkEndpoint,
    checkPayload = {},
    pinEndpoint = '/auth/plex/pin',
    pinPayload,
    extractToken,
    onToken,
    onError,
    maxAttempts = 120,
    redirectIfPopupBlocked = false,
  } = opts;

  let pollId: ReturnType<typeof setInterval> | null = null;
  let cancelled = false;

  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    if (pollId) clearInterval(pollId);
    pollId = null;
    authWindow?.close();
  };

  api.post(pinEndpoint, pinPayload)
    .then(({ data }) => {
      if (cancelled) return;
      const pin = data?.pin;
      const authUrl = data?.authUrl;
      // Session-binding token from /plex/pin (login flow). Echoed on every check POST so the
      // callback can verify it against the HttpOnly cookie (CSRF / session-fixation guard).
      const state = data?.state as string | undefined;
      if (!pin?.id || !authUrl) {
        cancel();
        onError();
        return;
      }
      // Popup blocked (or closed before the PIN arrived) and the caller opted into the
      // full-page fallback: navigate here instead of polling a window that doesn't exist.
      // Same-tab navigation is never popup-blocked, and the return page finalizes the flow.
      if ((!authWindow || authWindow.closed) && redirectIfPopupBlocked) {
        cancel();
        globalThis.location.href = authUrl;
        return;
      }
      if (authWindow) authWindow.location.href = authUrl;

      let attempts = 0;
      pollId = setInterval(async () => {
        attempts++;
        if (attempts >= maxAttempts) {
          cancel();
          onError();
          return;
        }
        try {
          const res = await api.post(checkEndpoint, { pinId: pin.id, ...(state ? { state } : {}), ...checkPayload });
          const token = extractToken(res.data);
          if (token) {
            cancel();
            onToken(token);
          }
        } catch (err) {
          // 400 = PIN not validated yet → keep polling. 429 = upstream rate limit hiccup, also
          // transient (the next tick will succeed once the window slides). Anything else is
          // terminal — close the popup and surface the error.
          const status = (err as { response?: { status?: number } })?.response?.status;
          if (status !== undefined && status !== 400 && status !== 429) {
            cancel();
            onError();
          }
        }
      }, 1000);
    })
    .catch(() => {
      if (cancelled) return;
      cancel();
      onError();
    });

  return { cancel };
}
