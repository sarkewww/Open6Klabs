import { describe, it, expect, vi, afterEach } from 'vitest';
import { createStore } from 'jotai';
import {
  GET_SESSION_PATH,
  SESSION_BASE_PATH,
  SESSION_STORAGE_KEY,
  createJotaiSessionStore,
  createSessionClient,
  isSessionExpired,
  resolveSessionResponse,
  sessionAtom,
  sessionSignalAtom,
} from './session';
import { NoopPostHog, posthog } from '../analytics/posthog';
import {
  EXTERNAL_NOOP_HOSTS,
  HYPERDX_OTEL_URL,
  ICANHAZIP_URL,
  METRICS_URL,
  PAYLOAD_GRAPHQL_URL,
  POSTHOG_HOST,
  createExternalHostStubs,
} from '../external/noop-hosts';

/* -------------------------------------------------------------------------- */
/* Fakes                                                                       */
/* -------------------------------------------------------------------------- */

interface FetchReply {
  status?: number;
  body: unknown;
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 401 ? 'Unauthorized' : '',
    json: async () => body,
  } as unknown as Response;
}

function createFetchStub(
  handler: (url: string, init?: RequestInit) => FetchReply,
): { fn: typeof fetch; calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const reply = handler(url, init);
    return jsonResponse(reply.status ?? 200, reply.body);
  }) as unknown as typeof fetch;
  return { fn, calls };
}

class FakeStorage implements Storage {
  private readonly map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

const silentClientOptions = {
  storage: null,
  windowImpl: null,
  documentImpl: null,
  navigatorImpl: null,
} as const;

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Constants + atom                                                            */
/* -------------------------------------------------------------------------- */

describe('session constants and atom', () => {
  it('uses the better-auth base path and get-session endpoint', () => {
    expect(SESSION_BASE_PATH).toBe('/api/auth');
    expect(GET_SESSION_PATH).toBe('/get-session');
    expect(SESSION_STORAGE_KEY).toBe('better-auth.message');
  });

  it('starts in the loading state', () => {
    const store = createStore();
    expect(store.get(sessionAtom)).toEqual({
      data: null,
      error: null,
      status: 'loading',
    });
    expect(store.get(sessionSignalAtom)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* fetch + classification                                                      */
/* -------------------------------------------------------------------------- */

describe('session client', () => {
  it('GETs /api/auth/get-session and normalises the session', async () => {
    const { fn, calls } = createFetchStub(() => ({
      body: {
        user: { id: 'u1', email: 'a@b.c' },
        session: { id: 's1', userId: 'u1' },
      },
    }));
    const store = createJotaiSessionStore(createStore());
    const client = createSessionClient({
      fetchImpl: fn,
      store,
      ...silentClientOptions,
    });

    const state = await client.fetchSession();

    expect(calls[0]!.url).toBe('/api/auth/get-session');
    expect(calls[0]!.init?.method).toBeUndefined();
    expect(state.status).toBe('authenticated');
    expect(state.data?.user.id).toBe('u1');
    expect(state.data?.session.userId).toBe('u1');
    expect(store.get().status).toBe('authenticated');
  });

  it('treats an unauthenticated null body as anonymous', async () => {
    const { fn } = createFetchStub(() => ({ body: null }));
    const client = createSessionClient({
      fetchImpl: fn,
      store: createJotaiSessionStore(createStore()),
      ...silentClientOptions,
    });

    const state = await client.fetchSession();

    expect(state.status).toBe('anonymous');
    expect(state.data).toBeNull();
    expect(state.error).toBeNull();
    expect(isSessionExpired(state)).toBe(false);
  });

  it('maps a 401 to SESSION_EXPIRED and fires onSessionExpired', async () => {
    const { fn } = createFetchStub(() => ({
      status: 401,
      body: { code: 'SESSION_EXPIRED', message: 'expired' },
    }));
    const onSessionExpired = vi.fn();
    const client = createSessionClient({
      fetchImpl: fn,
      store: createJotaiSessionStore(createStore()),
      onSessionExpired,
      ...silentClientOptions,
    });

    const state = await client.fetchSession();

    expect(state.status).toBe('expired');
    expect(isSessionExpired(state)).toBe(true);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('does not mark a valid session as expired', () => {
    const state = resolveSessionResponse({
      data: { user: { id: 'u1' }, session: { id: 's1' } },
      error: null,
    });
    expect(isSessionExpired(state)).toBe(false);
  });

  it('POSTs /get-session again when the session needs a refresh', async () => {
    const { fn, calls } = createFetchStub((_url, init) => {
      if (!init?.method || init.method === 'GET') {
        return {
          body: {
            user: { id: 'u1' },
            session: { id: 's1' },
            needsRefresh: true,
          },
        };
      }
      return { body: { user: { id: 'u1' }, session: { id: 's1' } } };
    });
    const client = createSessionClient({
      fetchImpl: fn,
      store: createJotaiSessionStore(createStore()),
      ...silentClientOptions,
    });

    const state = await client.fetchSession();

    expect(calls).toHaveLength(2);
    expect(calls[1]!.init?.method).toBe('POST');
    expect(state.status).toBe('authenticated');
  });

  it('triggerRefetch({ event: "poll" }) refetches', async () => {
    const { fn, calls } = createFetchStub(() => ({ body: null }));
    const client = createSessionClient({
      fetchImpl: fn,
      store: createJotaiSessionStore(createStore()),
      ...silentClientOptions,
    });

    client.triggerRefetch({ event: 'poll' });

    await vi.waitFor(() => expect(calls.length).toBe(1));
  });

  it('debounces visibilitychange refetches within 5 seconds', async () => {
    const { fn, calls } = createFetchStub(() => ({ body: null }));
    const client = createSessionClient({
      fetchImpl: fn,
      store: createJotaiSessionStore(createStore()),
      ...silentClientOptions,
    });

    client.triggerRefetch({ event: 'visibilitychange' });
    await vi.waitFor(() => expect(calls.length).toBe(1));

    client.triggerRefetch({ event: 'visibilitychange' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(calls.length).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Cross-tab sync                                                              */
/* -------------------------------------------------------------------------- */

describe('session cross-tab sync', () => {
  it('broadcasts over better-auth.message and refetches on the storage event', () => {
    const storage = new FakeStorage();
    const windowImpl = window;
    const { fn, calls } = createFetchStub(() => ({ body: null }));
    const jotaiStore = createStore();
    const client = createSessionClient({
      fetchImpl: fn,
      store: createJotaiSessionStore(jotaiStore),
      storage,
      windowImpl,
      documentImpl: null,
      navigatorImpl: null,
    });

    client.init();
    client.broadcastSessionUpdate('sign-in');

    const raw = storage.getItem(SESSION_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as {
      event: string;
      data: { trigger: string };
      timestamp: number;
    };
    expect(parsed.event).toBe('session');
    expect(parsed.data.trigger).toBe('sign-in');
    expect(typeof parsed.timestamp).toBe('number');

    const signalFlips: boolean[] = [];
    const unsubscribe = jotaiStore.sub(sessionSignalAtom, () => {
      signalFlips.push(jotaiStore.get(sessionSignalAtom));
    });

    windowImpl.dispatchEvent(
      new StorageEvent('storage', {
        key: SESSION_STORAGE_KEY,
        newValue: raw as string,
      }),
    );

    expect(signalFlips).toEqual([true]);
    expect(calls.length).toBe(1);
    unsubscribe();
    client.cleanup();
  });

  it('ignores storage events for unrelated keys', () => {
    const storage = new FakeStorage();
    const { fn, calls } = createFetchStub(() => ({ body: null }));
    const client = createSessionClient({
      fetchImpl: fn,
      store: createJotaiSessionStore(createStore()),
      storage,
      windowImpl: window,
      documentImpl: null,
      navigatorImpl: null,
    });
    client.init();

    window.dispatchEvent(
      new StorageEvent('storage', { key: 'other', newValue: '{}' }),
    );

    expect(calls.length).toBe(0);
    client.cleanup();
  });
});

/* -------------------------------------------------------------------------- */
/* PostHog no-op stub                                                          */
/* -------------------------------------------------------------------------- */

describe('posthog no-op stub', () => {
  it('preserves the observable SDK contract without any I/O', () => {
    const ph = new NoopPostHog();
    expect(ph.__loaded).toBe(false);
    expect(ph.get_distinct_id()).toBe('');

    expect(ph.init('test-token', { api_host: POSTHOG_HOST })).toBe(ph);
    expect(ph.__loaded).toBe(true);
    expect(ph.config.api_host).toBe(POSTHOG_HOST);

    expect(ph.capture('event', { a: 1 })).toBe(ph);
    expect(ph.identify('user-1', { email: 'a@b.c' })).toBe(ph);
    expect(ph.get_distinct_id()).toBe('user-1');
    expect(ph.reset()).toBe(ph);
    expect(ph.get_distinct_id()).toBe('');

    expect(ph.isFeatureEnabled('flag')).toBe(false);
    expect(ph.getFeatureFlag('flag')).toBeUndefined();
    expect(ph.calls.map((call) => call.method)).toEqual(
      expect.arrayContaining(['init', 'capture', 'identify', 'reset']),
    );
  });

  it('never issues a network request', () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('network disabled');
    });
    const original = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    try {
      const ph = new NoopPostHog();
      ph.init('test-token', { api_host: POSTHOG_HOST });
      ph.capture('x');
      ph.identify('u');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = original;
    }
  });

  it('exposes an uninitialised shared singleton', () => {
    expect(posthog).toBeInstanceOf(NoopPostHog);
    expect(typeof posthog.init).toBe('function');
  });
});

/* -------------------------------------------------------------------------- */
/* External host no-op stubs                                                   */
/* -------------------------------------------------------------------------- */

describe('external host no-op stubs', () => {
  it('records the five sanctioned hosts', () => {
    expect(EXTERNAL_NOOP_HOSTS.map((entry) => entry.host)).toEqual([
      ICANHAZIP_URL,
      METRICS_URL,
      PAYLOAD_GRAPHQL_URL,
      HYPERDX_OTEL_URL,
      POSTHOG_HOST,
    ]);
  });

  it('resolves neutral values without touching the network', async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('network disabled');
    });
    const original = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    try {
      const stubs = createExternalHostStubs();
      await expect(stubs.fetchPublicIp()).resolves.toBeNull();
      await expect(
        stubs.reportMetric({ name: 'metric' }),
      ).resolves.toBeUndefined();
      await expect(stubs.payloadGraphql('query')).resolves.toBeNull();
      const otel = stubs.startOtel();
      await expect(otel.shutdown()).resolves.toBeUndefined();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = original;
    }
  });
});
