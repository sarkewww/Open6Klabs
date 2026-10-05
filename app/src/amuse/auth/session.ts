/**
 * Session client — a self-implemented, better-auth-shaped port.
 *
 * Source of truth:
 *   - `app/_reference/main-Dx8nN5Es.js`
 *       · storage cross-tab broadcaster `Hce` ............ lines 34910-34942
 *       · focus manager `qce` ............................ lines 34944-34967
 *       · online manager `Kce` ........................... lines 34969-34991
 *       · session manager `Gce` (triggerRefetch/…) ....... lines 34992-35050
 *       · `useSession` wiring `Wce` ...................... lines 35051-35061
 *       · auth client `Aue({ baseURL: "https://6klabs.com" })` line 35434
 *   - `useAmuseSettings.js:54` defines the `SESSION_EXPIRED` enum member.
 *
 * The rewrite replaces the `better-auth` + `posthog-js` dependencies (both
 * intentionally absent from `app/package.json`) with:
 *   - this framework-agnostic session client (`GET`/`POST /api/auth/get-session`),
 *     a jotai `sessionAtom` + `sessionSignalAtom`, `triggerRefetch`, and
 *     cross-tab synchronisation over the `better-auth.message` storage key;
 *   - `../analytics/posthog.ts`, a no-op PostHog stub preserving the observable
 *     SDK contract.
 *
 * Observable mapping:
 *   - a 401 (or `SESSION_EXPIRED` / `TOKEN_EXPIRED`) response maps the session
 *     state to `expired`; `isSessionExpired` exposes that to callers.
 *   - The original `Di()` bootstrap never reads the better-auth session and
 *     never downgrades `widgetState` on expiry — it proceeds to fetch
 *     settings/profile and starts the source. `createWidgetBootstrap` mirrors
 *     that (it records a `sessionExpired` flag for the shell only). Earlier
 *     drafts exported `applySessionToWidget` / `resolveSubscriptionGating` to
 *     drive `WidgetStatus.SESSION_EXPIRED`; those were dead code and were
 *     removed because the original has no such gating (see
 *     `docs/rewrite-acceptance.md` §6).
 *
 * Deliberate deviation (documented): the original better-auth manager flips a
 * re-render signal on a `storage` event and lets the React resource re-run. This
 * port keeps `triggerRefetch({ event: "storage" })` faithful (signal flip, no
 * fetch) but additionally refetches on the cross-tab event inside `init()` so the
 * session data actually converges across tabs.
 */

import { atom, getDefaultStore, type Store } from 'jotai';

/* -------------------------------------------------------------------------- */
/* Constants (verbatim from the original)                                      */
/* -------------------------------------------------------------------------- */

/** better-auth base path. Original baseURL `https://6klabs.com` + `/api/auth`. */
export const SESSION_BASE_PATH = '/api/auth';

/** The single session endpoint, called as `GET` and (on refresh) `POST`. */
export const GET_SESSION_PATH = '/get-session';

/** Storage key used by better-auth's cross-tab broadcaster (`Hce`). */
export const SESSION_STORAGE_KEY = 'better-auth.message';

/** Seconds; original `Vce = 5` — visibilitychange refetch debounce. */
export const SESSION_VISIBILITY_DEBOUNCE_SECONDS = 5;

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export interface SessionUser {
  id: string;
  email?: string;
  name?: string;
  [key: string]: unknown;
}

export interface SessionRecord {
  id?: string;
  userId?: string;
  [key: string]: unknown;
}

/** Normalised `{ session, user }` pair (better-auth `R`). */
export interface SessionData {
  session: SessionRecord;
  user: SessionUser;
}

/** better-auth / better-fetch error shape (subset). */
export interface SessionError {
  status?: number;
  code?: string;
  message?: string;
  [key: string]: unknown;
}

export type SessionStatus =
  'loading' | 'authenticated' | 'anonymous' | 'expired';

/** The session atom's value. */
export interface SessionState {
  data: SessionData | null;
  error: SessionError | null;
  status: SessionStatus;
}

/** Raw result of a `$fetch("/get-session")` call. */
export interface SessionFetchResult {
  data: (Partial<SessionData> & { needsRefresh?: boolean }) | null;
  error: SessionError | null;
}

export type SessionFetch = (
  path: string,
  init?: RequestInit,
) => Promise<SessionFetchResult>;

/** Event passed to `triggerRefetch` (better-auth `E`). */
export interface SessionRefetchEvent {
  event: 'storage' | 'poll' | 'visibilitychange' | 'online' | (string & {});
}

/** Cross-tab broadcast payload (better-auth `Hce.post`). */
export interface SessionBroadcastMessage {
  event: string;
  data?: unknown;
  clientId?: string;
  timestamp: number;
}

export interface SessionStateStore {
  get(): SessionState;
  set(next: SessionState): void;
  subscribe(listener: (state: SessionState) => void): () => void;
  getSignal(): boolean;
  setSignal(next: boolean): void;
  subscribeSignal(listener: (value: boolean) => void): () => void;
}

/* -------------------------------------------------------------------------- */
/* Atoms                                                                       */
/* -------------------------------------------------------------------------- */

/** Session state atom (`sessionAtom` in better-auth). */
export const sessionAtom = atom<SessionState>({
  data: null,
  error: null,
  status: 'loading',
});

/** Re-render signal atom (`sessionSignal` in better-auth). */
export const sessionSignalAtom = atom<boolean>(false);

/** A store bound to the two module-level session atoms. */
export function createJotaiSessionStore(
  store: Store = getDefaultStore(),
): SessionStateStore {
  return {
    get: () => store.get(sessionAtom),
    set: (next) => store.set(sessionAtom, next),
    subscribe: (listener) =>
      store.sub(sessionAtom, () => listener(store.get(sessionAtom))),
    getSignal: () => store.get(sessionSignalAtom),
    setSignal: (next) => store.set(sessionSignalAtom, next),
    subscribeSignal: (listener) =>
      store.sub(sessionSignalAtom, () =>
        listener(store.get(sessionSignalAtom)),
      ),
  };
}

/** A standalone in-memory store (used when jotai is not available / in tests). */
export function createMemorySessionStore(
  initial?: SessionState,
): SessionStateStore {
  let state: SessionState = initial ?? {
    data: null,
    error: null,
    status: 'loading',
  };
  let signal = false;
  const listeners = new Set<(state: SessionState) => void>();
  const signalListeners = new Set<(value: boolean) => void>();
  return {
    get: () => state,
    set: (next) => {
      state = next;
      listeners.forEach((l) => l(state));
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSignal: () => signal,
    setSignal: (next) => {
      signal = next;
      signalListeners.forEach((l) => l(signal));
    },
    subscribeSignal: (listener) => {
      signalListeners.add(listener);
      return () => signalListeners.delete(listener);
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Map a `$fetch("/get-session")` result to the session state. Mirrors the
 * original `const R = A?.session && A?.user ? { session, user } : null` and
 * classifies a 401 / `SESSION_EXPIRED` / `TOKEN_EXPIRED` error as `expired`.
 */
export function resolveSessionResponse(
  result: SessionFetchResult,
): SessionState {
  const raw = result.data;
  const data: SessionData | null =
    raw && raw.session && raw.user
      ? { session: raw.session as SessionRecord, user: raw.user as SessionUser }
      : null;
  const error = result.error ?? null;
  const expired =
    !!error &&
    (error.status === 401 ||
      error.code === 'SESSION_EXPIRED' ||
      error.code === 'TOKEN_EXPIRED');
  const status: SessionStatus = expired
    ? 'expired'
    : data
      ? 'authenticated'
      : 'anonymous';
  return { data, error, status };
}

/** True when the session has expired (401 or an explicit expiry code). */
export function isSessionExpired(state: SessionState): boolean {
  if (state.status === 'expired') return true;
  const error = state.error;
  return (
    !!error &&
    (error.status === 401 ||
      error.code === 'SESSION_EXPIRED' ||
      error.code === 'TOKEN_EXPIRED')
  );
}

/* -------------------------------------------------------------------------- */
/* Default fetch wrapper                                                       */
/* -------------------------------------------------------------------------- */

/** Wrap `fetch` into better-auth's `{ data, error }` result shape. */
export function createDefaultSessionFetch(
  baseURL: string,
  fetchImpl: typeof fetch,
): SessionFetch {
  return async (path, init) => {
    try {
      const response = await fetchImpl(baseURL + path, {
        credentials: 'include',
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...((init?.headers as Record<string, string> | undefined) ?? {}),
        },
      });
      const body = (await response.json().catch(() => null)) as
        (Partial<SessionData> & { code?: string; message?: string }) | null;
      if (!response.ok) {
        return {
          data: null,
          error: {
            status: response.status,
            code: body?.code,
            message: body?.message ?? response.statusText,
          },
        };
      }
      return { data: body, error: null };
    } catch (error) {
      return {
        data: null,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };
}

/* -------------------------------------------------------------------------- */
/* Cross-tab broadcaster (better-auth `Hce`)                                   */
/* -------------------------------------------------------------------------- */

export interface SessionBroadcaster {
  subscribe(listener: (message: SessionBroadcastMessage) => void): () => void;
  post(payload: Omit<SessionBroadcastMessage, 'timestamp'>): void;
  setup(): () => void;
}

export function createSessionBroadcaster(
  storage: Storage | null,
  windowImpl: Window | null,
  key: string = SESSION_STORAGE_KEY,
  nowSeconds: () => number = () => Math.floor(Date.now() / 1000),
): SessionBroadcaster {
  const listeners = new Set<(message: SessionBroadcastMessage) => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    post(payload) {
      if (!storage) return;
      try {
        storage.setItem(
          key,
          JSON.stringify({ ...payload, timestamp: nowSeconds() }),
        );
      } catch {
        /* storage can be unavailable (private mode) — swallow like the original */
      }
    },
    setup() {
      if (!windowImpl) return () => {};
      const onStorage = (event: StorageEvent) => {
        if (event.key !== key) return;
        let parsed: SessionBroadcastMessage | null = null;
        try {
          parsed = JSON.parse(
            event.newValue ?? '{}',
          ) as SessionBroadcastMessage;
        } catch {
          parsed = null;
        }
        if (parsed?.event !== 'session' || !parsed.data) return;
        listeners.forEach((listener) =>
          listener(parsed as SessionBroadcastMessage),
        );
      };
      windowImpl.addEventListener('storage', onStorage);
      return () => windowImpl.removeEventListener('storage', onStorage);
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Session client (better-auth `Gce`)                                          */
/* -------------------------------------------------------------------------- */

export interface SessionClientOptions {
  baseURL?: string;
  fetchImpl?: typeof fetch;
  sessionFetch?: SessionFetch;
  storage?: Storage | null;
  windowImpl?: Window | null;
  documentImpl?: Document | null;
  navigatorImpl?: Navigator | null;
  now?: () => number;
  nowSeconds?: () => number;
  store?: SessionStateStore;
  sessionOptions?: {
    refetchInterval?: number;
    refetchOnWindowFocus?: boolean;
    refetchWhenOffline?: boolean;
  };
  onSessionChange?: (state: SessionState) => void;
  onSessionExpired?: (state: SessionState) => void;
  logger?: Pick<Console, 'warn' | 'error'>;
}

export interface SessionClient {
  readonly store: SessionStateStore;
  getState(): SessionState;
  subscribe(listener: (state: SessionState) => void): () => void;
  fetchSession(): Promise<SessionState>;
  triggerRefetch(event?: SessionRefetchEvent): void;
  broadcastSessionUpdate(trigger?: string): void;
  init(): void;
  cleanup(): void;
}

export function createSessionClient(
  options: SessionClientOptions = {},
): SessionClient {
  const baseURL = options.baseURL ?? SESSION_BASE_PATH;
  const windowImpl =
    options.windowImpl ?? (typeof window !== 'undefined' ? window : null);
  const documentImpl =
    options.documentImpl ?? (typeof document !== 'undefined' ? document : null);
  const navigatorImpl =
    options.navigatorImpl ??
    (typeof navigator !== 'undefined' ? navigator : null);
  const storage =
    options.storage !== undefined ? options.storage : safeStorage(windowImpl);
  const nowSeconds =
    options.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
  const refetchInterval = options.sessionOptions?.refetchInterval ?? 0;
  const refetchOnWindowFocus =
    options.sessionOptions?.refetchOnWindowFocus ?? true;
  const refetchWhenOffline =
    options.sessionOptions?.refetchWhenOffline ?? false;
  const store = options.store ?? createJotaiSessionStore();

  const sessionFetch =
    options.sessionFetch ??
    createDefaultSessionFetch(
      baseURL,
      options.fetchImpl ??
        (typeof fetch !== 'undefined' ? fetch : (undefined as never)),
    );

  const broadcaster = createSessionBroadcaster(
    storage,
    windowImpl,
    SESSION_STORAGE_KEY,
    nowSeconds,
  );

  const internals = {
    lastSync: 0,
    lastSessionRequest: 0,
    pollInterval: undefined as ReturnType<typeof setInterval> | undefined,
    unsubscribeBroadcast: undefined as (() => void) | undefined,
    unsubscribeBroadcastSetup: undefined as (() => void) | undefined,
    unsubscribeFocus: undefined as (() => void) | undefined,
    unsubscribeOnline: undefined as (() => void) | undefined,
  };

  const isOnline = () =>
    refetchWhenOffline ||
    (navigatorImpl ? navigatorImpl.onLine !== false : true);

  const setState = (next: SessionState) => {
    const previous = store.get();
    store.set(next);
    options.onSessionChange?.(next);
    if (isSessionExpired(next) && !isSessionExpired(previous)) {
      options.onSessionExpired?.(next);
    }
  };

  const performFetch = async (): Promise<SessionState> => {
    internals.lastSessionRequest = nowSeconds();
    const result = await sessionFetch(GET_SESSION_PATH);
    let data = result.data;
    let error = result.error;
    if (data && data.needsRefresh) {
      try {
        const refreshed = await sessionFetch(GET_SESSION_PATH, {
          method: 'POST',
        });
        data = refreshed.data;
        error = refreshed.error;
      } catch {
        /* swallow — keep the pre-refresh result like the original */
      }
    }
    const next = resolveSessionResponse({ data, error });
    setState(next);
    internals.lastSync = nowSeconds();
    return next;
  };

  const runFetch = () => {
    void performFetch().catch(() => {});
  };

  const triggerRefetch = (event?: SessionRefetchEvent): void => {
    if (!isOnline()) return;
    if (event?.event === 'storage') {
      internals.lastSync = nowSeconds();
      store.setSignal(!store.getSignal());
      return;
    }
    const current = store.get();
    if (event?.event === 'poll') {
      runFetch();
      return;
    }
    if (event?.event === 'visibilitychange') {
      if (
        nowSeconds() - internals.lastSessionRequest <
        SESSION_VISIBILITY_DEBOUNCE_SECONDS
      ) {
        return;
      }
      internals.lastSessionRequest = nowSeconds();
      runFetch();
      return;
    }
    if (!current.data) {
      internals.lastSync = nowSeconds();
      store.setSignal(!store.getSignal());
    }
  };

  const broadcastSessionUpdate = (trigger?: string): void => {
    broadcaster.post({
      event: 'session',
      data: { trigger },
      clientId: Math.random().toString(36).substring(7),
    });
  };

  const init = (): void => {
    if (refetchInterval > 0) {
      internals.pollInterval = setInterval(() => {
        if (store.get().data) triggerRefetch({ event: 'poll' });
      }, refetchInterval * 1000);
    }
    // Cross-tab: a session broadcast from another tab both flips the signal and
    // (deliberate strengthening) refetches so the data converges.
    internals.unsubscribeBroadcast = broadcaster.subscribe(() => {
      triggerRefetch({ event: 'storage' });
      runFetch();
    });
    internals.unsubscribeBroadcastSetup = broadcaster.setup();
    if (refetchOnWindowFocus && documentImpl) {
      const onVisibility = () => {
        if (documentImpl.visibilityState === 'visible') {
          triggerRefetch({ event: 'visibilitychange' });
        }
      };
      documentImpl.addEventListener('visibilitychange', onVisibility, false);
      internals.unsubscribeFocus = () =>
        documentImpl.removeEventListener(
          'visibilitychange',
          onVisibility,
          false,
        );
    }
    if (windowImpl) {
      const onOnline = () => triggerRefetch({ event: 'visibilitychange' });
      windowImpl.addEventListener('online', onOnline, false);
      internals.unsubscribeOnline = () =>
        windowImpl.removeEventListener('online', onOnline, false);
    }
  };

  const cleanup = (): void => {
    if (internals.pollInterval) clearInterval(internals.pollInterval);
    internals.pollInterval = undefined;
    internals.unsubscribeBroadcast?.();
    internals.unsubscribeBroadcastSetup?.();
    internals.unsubscribeFocus?.();
    internals.unsubscribeOnline?.();
    internals.unsubscribeBroadcast = undefined;
    internals.unsubscribeBroadcastSetup = undefined;
    internals.unsubscribeFocus = undefined;
    internals.unsubscribeOnline = undefined;
    internals.lastSync = 0;
    internals.lastSessionRequest = 0;
  };

  return {
    store,
    getState: () => store.get(),
    subscribe: (listener) => store.subscribe(listener),
    fetchSession: performFetch,
    triggerRefetch,
    broadcastSessionUpdate,
    init,
    cleanup,
  };
}

function safeStorage(windowImpl: Window | null): Storage | null {
  try {
    return windowImpl?.localStorage ?? null;
  } catch {
    return null;
  }
}

let sharedClient: SessionClient | null = null;

/** Lazy module-level singleton used by the app runtime. */
export function getSessionClient(
  options?: SessionClientOptions,
): SessionClient {
  if (!sharedClient) sharedClient = createSessionClient(options);
  return sharedClient;
}

/** Test-only: drop the shared singleton. */
export function resetSessionClient(): void {
  sharedClient?.cleanup();
  sharedClient = null;
}
