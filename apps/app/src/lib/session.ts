import { ApiError } from "./api-error";
import { logout, refreshTokens, type AuthTokens } from "./auth-client";

/**
 * First-party session store, replacing the vendor SDK auth listener.
 *
 * Token placement:
 * - The **access token** lives in module memory only — never persisted, so a
 *   stolen backup or another app on the device can't lift a live credential.
 * - The **refresh token** persists in localStorage under `bya.refreshToken`.
 *   This SPA also ships inside a Capacitor shell, where the bundled WebView
 *   has no http-only cookie option we control — localStorage is the accepted
 *   store for the long-lived token there, and it keeps web and native builds
 *   on one code path.
 *
 * React reaches this through `auth-context.tsx`; `api.ts` reads
 * `getAccessToken()` / triggers `refreshSession()` without touching React.
 */

const REFRESH_TOKEN_KEY = "bya.refreshToken";

/** Refresh this many seconds before the access token actually expires. */
const REFRESH_LEEWAY_SEC = 60;

export interface SessionUser {
  /** The server-issued auth uid (the API's `authUid`). */
  uid: string;
  /** E.164 number when known — set at sign-in, null after a cold-boot
   * refresh (the refresh response carries only `authUid`). */
  phoneNumber: string | null;
}

type Listener = (user: SessionUser | null) => void;

let accessToken: string | null = null;
let currentUser: SessionUser | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
/** Single-flight guard: every concurrent refresh request shares this. */
let refreshInFlight: Promise<boolean> | null = null;
/** Boot guard: `initSession` runs its work once (StrictMode double-mounts). */
let bootPromise: Promise<void> | null = null;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener(currentUser);
}

/** Subscribes to signed-in-user changes; fires immediately with the current
 * value. Returns the unsubscribe function. */
export function subscribeToSession(listener: Listener): () => void {
  listeners.add(listener);
  listener(currentUser);
  return () => {
    listeners.delete(listener);
  };
}

export const getAccessToken = (): string | null => accessToken;

export const getSessionUser = (): SessionUser | null => currentUser;

function readStoredRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

function scheduleProactiveRefresh(expiresInSec: number): void {
  if (refreshTimer !== null) clearTimeout(refreshTimer);
  // ~60s before expiry; floor of 5s so a tiny TTL can't busy-loop the API.
  const delayMs = Math.max(expiresInSec - REFRESH_LEEWAY_SEC, 5) * 1000;
  refreshTimer = setTimeout(() => {
    void refreshSession();
  }, delayMs);
}

/** Adopts a token pair: memory access token, persisted (rotated) refresh
 * token, proactive refresh scheduled, subscribers told. */
function adopt(tokens: AuthTokens, phoneNumber: string | null): void {
  accessToken = tokens.accessToken;
  // Rotating refresh tokens: the newly returned one is the ONLY live one.
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  scheduleProactiveRefresh(tokens.expiresInSec);
  const changed =
    currentUser === null ||
    currentUser.uid !== tokens.authUid ||
    currentUser.phoneNumber !== phoneNumber;
  currentUser = { uid: tokens.authUid, phoneNumber };
  if (changed) notify();
}

/** Called by SignIn after a successful OTP verify. */
export function establishSession(tokens: AuthTokens, phoneNumber: string | null): void {
  adopt(tokens, phoneNumber);
}

function clearLocalSession(dropStoredToken: boolean): void {
  accessToken = null;
  if (refreshTimer !== null) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  if (dropStoredToken) localStorage.removeItem(REFRESH_TOKEN_KEY);
  if (currentUser !== null) {
    currentUser = null;
    notify();
  }
}

/**
 * Exchanges the stored refresh token for a fresh pair. Single-flight: the
 * proactive timer and any number of 401 retries share one in-flight promise,
 * so the rotating refresh token is only ever spent once.
 *
 * Returns true when a session is (re)established. On failure the session is
 * torn down; the stored token is dropped only when the server actually
 * rejected it (it is dead by rotation/expiry) — a pure network failure keeps
 * it so the next launch can still resume.
 */
export function refreshSession(): Promise<boolean> {
  if (refreshInFlight !== null) return refreshInFlight;
  const stored = readStoredRefreshToken();
  if (stored === null) {
    clearLocalSession(false);
    return Promise.resolve(false);
  }
  refreshInFlight = (async () => {
    try {
      adopt(await refreshTokens(stored), currentUser?.phoneNumber ?? null);
      return true;
    } catch (error) {
      const rejected = error instanceof ApiError && error.status > 0;
      if (!rejected) console.warn("session refresh failed (network), signing out locally:", error);
      clearLocalSession(rejected);
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/** App boot: if a refresh token survives from a previous run, resume the
 * session before anything renders behind RequireAuth. Runs its work once. */
export function initSession(): Promise<void> {
  bootPromise ??= (async () => {
    if (readStoredRefreshToken() === null) return;
    await refreshSession();
  })();
  return bootPromise;
}

/**
 * Signs out. The server-side revoke is best-effort — a network failure must
 * never leave the user locally "signed in" — but not silent: it is logged.
 * Local state and the stored refresh token are always cleared.
 */
export async function signOutSession(): Promise<void> {
  const access = accessToken;
  const stored = readStoredRefreshToken();
  if (access !== null && stored !== null) {
    try {
      await logout(access, stored);
    } catch (error) {
      console.error("logout call failed; clearing the local session anyway:", error);
    }
  }
  clearLocalSession(true);
}
