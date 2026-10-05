/**
 * Runtime bootstrap tests — plan Todo 37.
 *
 * Drives the framework-agnostic {@link createWidgetBootstrap} with an injected
 * `fetch` / pusher / source factory so the whole flow (settings + profile +
 * subscription fetch, client-side skin gating, source adapter start/stop,
 * realtime refetch, SESSION_EXPIRED, cleanup) is exercised with ZERO real
 * network or socket I/O.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlayerStore } from '../player/store';
import { createSessionClient } from '../auth/session';
import type { SessionFetchResult } from '../auth/session';
import type {
  PusherChannelLike,
  PusherClientLike,
  PusherFactory,
} from '../player/realtime';
import { MusicSource } from '../types/user';
import {
  createWidgetBootstrap,
  createWidgetSource,
  fetchWidgetProfile,
  resolveActiveMusicService,
  resolveProfileWidgetStatus,
  resolveSkinGating,
} from './bootstrap';
import type {
  WidgetBootstrapOptions,
  WidgetProfile,
  WidgetSourceFactory,
} from './bootstrap';
import { DEFAULT_PROFILE_SETTINGS } from '../profile/settings';
import type { YtmDesktopSocket } from '../player/adapters/ytm-desktop';

/* -------------------------------------------------------------------------- */
/* Fetch mock                                                                  */
/* -------------------------------------------------------------------------- */

interface RouteSpec {
  status?: number;
  body?: unknown;
}

type RouteTable = Record<string, RouteSpec | ((url: string) => RouteSpec)>;

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function createFetchMock(routes: RouteTable) {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    for (const [prefix, spec] of Object.entries(routes)) {
      if (!url.includes(prefix)) continue;
      const resolved = typeof spec === 'function' ? spec(url) : spec;
      const status = resolved.status ?? 200;
      const ok = status >= 200 && status < 300;
      const response = {
        ok,
        status,
        statusText: ok ? 'OK' : 'Error',
        json: async () => resolved.body,
        text: async () => JSON.stringify(resolved.body ?? null),
      };
      return response as unknown as Response;
    }
    return {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ error: 'Not Found' }),
      text: async () => 'Not Found',
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const PEAR_PAYLOAD = {
  track: {
    id: 'pear-1',
    title: 'STAY LOW',
    author: 'MISTERK, FANNYMAGNET, Tphunk',
    duration: 214,
    cover: '/assets/spotify_no_cover-DlW0D82t.svg',
  },
  player: { hasSong: true, seekbarCurrentPosition: 53, isPaused: false },
};

const PROFILE: WidgetProfile = {
  _id: 'profile_main',
  profile_id: 'main',
  name: 'Main',
  music_service: 'pear-desktop',
  settings: {
    skin: 'boxy',
    theme: 'default_light',
    cover: 'vinyl',
    magic_colors: true,
    font: 'poppins',
  },
};

const SESSION_OK = {
  user: { id: 'user_local', is_discord_member: true },
  session: { id: 'session_local', userId: 'user_local' },
};

function baseRoutes(overrides: RouteTable = {}): RouteTable {
  return {
    '/api/auth/get-session': { status: 200, body: SESSION_OK },
    '/api/widget/settings': {
      status: 200,
      body: { general: { hide_popup: true } },
    },
    '/api/widget/subscription': {
      status: 200,
      body: { tier: 'PRO', status: 'active' },
    },
    '/api/widgets/amuse/profiles': { status: 200, body: PROFILE },
    'localhost:9863/query': { status: 200, body: PEAR_PAYLOAD },
    ...overrides,
  };
}

/** A session factory bound to the injected fetch (deterministic session). */
function sessionFactoryFor(fetchImpl: typeof fetch) {
  return ({ onSessionExpired }: { onSessionExpired: () => void }) =>
    createSessionClient({ onSessionExpired, fetchImpl });
}

function baseOptions(
  fetchImpl: typeof fetch,
  overrides: Partial<WidgetBootstrapOptions> = {},
): WidgetBootstrapOptions {
  return {
    widgetToken: 'local',
    profileId: 'main',
    fetchImpl,
    sessionFactory: sessionFactoryFor(fetchImpl),
    ...overrides,
  };
}

const created: Array<{ stop: () => void }> = [];
afterEach(() => {
  while (created.length) created.pop()!.stop();
  vi.restoreAllMocks();
});

function trackBootstrap<T extends { stop: () => void }>(bootstrap: T): T {
  created.push(bootstrap);
  return bootstrap;
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                       */
/* -------------------------------------------------------------------------- */

describe('createWidgetBootstrap', () => {
  it('fetches settings + profile then sets the track/widgetState via the pear adapter', async () => {
    const { fetchImpl, calls } = createFetchMock(baseRoutes());
    const store = createPlayerStore();
    const bootstrap = trackBootstrap(
      createWidgetBootstrap(baseOptions(fetchImpl, { store })),
    );

    await bootstrap.start();

    const paths = calls.map((call) => call.url);
    expect(paths.some((url) => url.includes('/api/widget/settings'))).toBe(
      true,
    );
    expect(
      paths.some((url) => url.includes('/api/widgets/amuse/profiles/main')),
    ).toBe(true);
    expect(paths.some((url) => url.includes('/api/widget/subscription'))).toBe(
      true,
    );

    await vi.waitFor(() => {
      expect(store.getState().widgetState).toBe('SUCCESS');
    });
    expect(store.getState().currentTrack.title).toBe('STAY LOW');
    expect(store.getState().currentTrack.artist).toBe(
      'MISTERK, FANNYMAGNET, Tphunk',
    );
    expect(store.getState().activeMusicService).toBe('pear-desktop');
    expect(bootstrap.getState().settings.skin).toBe('boxy');
    expect(bootstrap.getState().musicService).toBe('pear-desktop');
  });

  it('continues to fetch settings/profile + start the source when the session is expired (parity: the original does not gate on session)', async () => {
    const { fetchImpl, calls } = createFetchMock(
      baseRoutes({
        '/api/auth/get-session': {
          status: 401,
          body: { error: 'SESSION_EXPIRED', code: 'SESSION_EXPIRED' },
        },
      }),
    );
    const store = createPlayerStore();
    const sourceFactory: WidgetSourceFactory = () => ({
      start: () => store.getState().setWidgetState('SUCCESS'),
      stop: () => {},
    });
    const bootstrap = trackBootstrap(
      createWidgetBootstrap(baseOptions(fetchImpl, { store, sourceFactory })),
    );

    await bootstrap.start();

    // Parity: the original overlay never downgrades the widget state on session
    // expiry — it still resolves the profile and starts the source, so the
    // widget renders. The session flag is surfaced for the shell only.
    expect(bootstrap.getState().sessionExpired).toBe(true);
    expect(
      calls.some((call) => call.url.includes('/api/widget/settings')),
    ).toBe(true);
    expect(
      calls.some((call) =>
        call.url.includes('/api/widgets/amuse/profiles/main'),
      ),
    ).toBe(true);
    await vi.waitFor(() => {
      expect(store.getState().widgetState).toBe('SUCCESS');
    });
  });

  it('maps a missing profile to PROFILE_NOT_EXISTING and starts no source', async () => {
    const { fetchImpl } = createFetchMock(
      baseRoutes({
        '/api/widgets/amuse/profiles': {
          status: 404,
          body: { error: 'Profile not found' },
        },
      }),
    );
    const store = createPlayerStore();
    const sourceFactory = vi.fn<WidgetSourceFactory>(() => null);
    const bootstrap = trackBootstrap(
      createWidgetBootstrap(baseOptions(fetchImpl, { store, sourceFactory })),
    );

    await bootstrap.start();

    expect(store.getState().widgetState).toBe('PROFILE_NOT_EXISTING');
    expect(sourceFactory).not.toHaveBeenCalled();
  });

  it('applies client-side skin gating -> DISABLED_PRO_SKIN (free + windows98)', async () => {
    const { fetchImpl } = createFetchMock(
      baseRoutes({
        '/api/widget/subscription': {
          status: 200,
          body: { tier: 'FREE', status: 'inactive' },
        },
        '/api/widgets/amuse/profiles': {
          status: 200,
          body: {
            ...PROFILE,
            settings: { ...PROFILE.settings, skin: 'windows98' },
          },
        },
      }),
    );
    const store = createPlayerStore();
    const sourceFactory = vi.fn<WidgetSourceFactory>(() => null);
    const bootstrap = trackBootstrap(
      createWidgetBootstrap(baseOptions(fetchImpl, { store, sourceFactory })),
    );

    await bootstrap.start();

    expect(store.getState().widgetState).toBe('DISABLED_PRO_SKIN');
    expect(sourceFactory).not.toHaveBeenCalled();
  });

  it('applies client-side skin gating -> DISABLED_DISCORD_SKIN (free + non-member)', async () => {
    const { fetchImpl } = createFetchMock(
      baseRoutes({
        '/api/auth/get-session': {
          status: 200,
          body: {
            user: { id: 'u', is_discord_member: false },
            session: { userId: 'u' },
          },
        },
        '/api/widget/subscription': {
          status: 200,
          body: { tier: 'FREE', status: 'inactive' },
        },
        '/api/widgets/amuse/profiles': {
          status: 200,
          body: {
            ...PROFILE,
            settings: { ...PROFILE.settings, skin: 'discord' },
          },
        },
      }),
    );
    const store = createPlayerStore();
    const bootstrap = trackBootstrap(
      createWidgetBootstrap(baseOptions(fetchImpl, { store })),
    );

    await bootstrap.start();

    expect(store.getState().widgetState).toBe('DISABLED_DISCORD_SKIN');
  });

  it('starts and stops the matching source adapter', async () => {
    const { fetchImpl } = createFetchMock(baseRoutes());
    const store = createPlayerStore();
    const started: MusicSource[] = [];
    let stops = 0;
    const sourceFactory: WidgetSourceFactory = (service) => {
      started.push(service);
      return {
        start: () => {},
        stop: () => {
          stops += 1;
        },
      };
    };
    const bootstrap = trackBootstrap(
      createWidgetBootstrap(baseOptions(fetchImpl, { store, sourceFactory })),
    );

    await bootstrap.start();
    expect(started).toEqual([MusicSource.PEAR_DESKTOP]);

    bootstrap.stop();
    expect(stops).toBe(1);
  });

  it('stops the polling timer on stop() (no further fetches)', async () => {
    const { fetchImpl, calls } = createFetchMock(baseRoutes());
    const store = createPlayerStore();
    const bootstrap = trackBootstrap(
      createWidgetBootstrap(baseOptions(fetchImpl, { store })),
    );

    await bootstrap.start();
    await vi.waitFor(() => {
      expect(
        calls.filter((call) => call.url.includes('localhost:9863/query'))
          .length,
      ).toBe(1);
    });

    bootstrap.stop();
    const afterStop = calls.length;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(calls.length).toBe(afterStop);
  });

  it('connects realtime, refetches settings on user_changed_settings, disconnects on stop', async () => {
    const { fetchImpl, calls } = createFetchMock(baseRoutes());
    const store = createPlayerStore();

    const handlers: Record<string, (data: unknown) => void> = {};
    const channel: PusherChannelLike = {
      bind: (event, handler) => {
        handlers[event] = handler;
        return channel;
      },
      unbind_all: vi.fn(),
      unsubscribe: vi.fn(),
    };
    const pusher: PusherClientLike = {
      subscribe: vi.fn(() => channel),
      unsubscribe: vi.fn(),
      disconnect: vi.fn(),
    };
    const pusherFactory: PusherFactory = vi.fn(() => pusher);

    const bootstrap = trackBootstrap(
      createWidgetBootstrap(baseOptions(fetchImpl, { store, pusherFactory })),
    );
    await bootstrap.start();

    expect(pusherFactory).toHaveBeenCalledTimes(1);
    expect(pusher.subscribe).toHaveBeenCalledTimes(1);
    expect(typeof handlers['user_changed_settings']).toBe('function');

    const settingsCallsBefore = calls.filter((call) =>
      call.url.includes('/api/widget/settings'),
    ).length;
    handlers['user_changed_settings']({ profile_id: 'main' });
    await vi.waitFor(() => {
      const settingsCallsAfter = calls.filter((call) =>
        call.url.includes('/api/widget/settings'),
      ).length;
      expect(settingsCallsAfter).toBeGreaterThan(settingsCallsBefore);
    });

    bootstrap.stop();
    expect(channel.unbind_all).toHaveBeenCalledTimes(1);
    expect(channel.unsubscribe).toHaveBeenCalledTimes(1);
    expect(pusher.disconnect).toHaveBeenCalledTimes(1);
  });

  it('mounts the Spotify master election for the spotify source', async () => {
    const { fetchImpl } = createFetchMock(
      baseRoutes({
        '/api/widget/spotify/token': { status: 200, body: { token: 'tok' } },
        'api.spotify.com': { status: 204, body: null },
        '/api/widgets/amuse/profiles': {
          status: 200,
          body: { ...PROFILE, music_service: 'spotify' },
        },
      }),
    );
    const store = createPlayerStore();
    const start = vi.fn();
    const stop = vi.fn();
    const spotifyElectionFactory = vi.fn(() => ({
      channelName: 'amuse-spotify-local',
      instanceId: 'inst',
      getIsMaster: () => false,
      start,
      stop,
    }));
    const bootstrap = trackBootstrap(
      createWidgetBootstrap(
        baseOptions(fetchImpl, { store, spotifyElectionFactory }),
      ),
    );

    await bootstrap.start();

    expect(spotifyElectionFactory).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);

    bootstrap.stop();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('re-gates on a pushed locked skin and recovers when it is unlocked again', async () => {
    let profileBody: WidgetProfile = {
      ...PROFILE,
      settings: { ...PROFILE.settings, skin: 'boxy' },
    };
    const { fetchImpl } = createFetchMock(
      baseRoutes({
        '/api/widget/subscription': {
          status: 200,
          body: { tier: 'FREE', status: 'inactive' },
        },
        '/api/widgets/amuse/profiles': () => ({
          status: 200,
          body: profileBody,
        }),
      }),
    );
    const store = createPlayerStore();
    const handlers: Record<string, (data: unknown) => void> = {};
    const channel: PusherChannelLike = {
      bind: (event, handler) => {
        handlers[event] = handler;
        return channel;
      },
      unbind_all: vi.fn(),
      unsubscribe: vi.fn(),
    };
    const pusher: PusherClientLike = {
      subscribe: vi.fn(() => channel),
      unsubscribe: vi.fn(),
      disconnect: vi.fn(),
    };
    const bootstrap = trackBootstrap(
      createWidgetBootstrap(
        baseOptions(fetchImpl, {
          store,
          pusherFactory: vi.fn(() => pusher),
        }),
      ),
    );

    await bootstrap.start();
    await vi.waitFor(() => {
      expect(store.getState().widgetState).toBe('SUCCESS');
    });

    // Push a locked skin (windows98) -> gating applies immediately.
    profileBody = {
      ...PROFILE,
      settings: { ...PROFILE.settings, skin: 'windows98' },
    };
    handlers['user_changed_settings']({ profile_id: 'main' });
    await vi.waitFor(() => {
      expect(store.getState().widgetState).toBe('DISABLED_PRO_SKIN');
    });

    // Push an unlocked skin again -> gating recovers and the source restarts.
    profileBody = {
      ...PROFILE,
      settings: { ...PROFILE.settings, skin: 'boxy' },
    };
    handlers['user_changed_settings']({ profile_id: 'main' });
    await vi.waitFor(() => {
      expect(store.getState().widgetState).toBe('SUCCESS');
    });
  });

  it('createWidgetSource returns a startable/stopable adapter for every service', async () => {
    const { fetchImpl } = createFetchMock(
      baseRoutes({
        '/api/widget/spotify/token': { status: 200, body: { token: 'tok' } },
        '/api/widget/accounts/ytmdesktop': {
          status: 200,
          body: { token: 'tok' },
        },
        'api.spotify.com': { status: 204, body: null },
        'localhost:10767': { status: 200, body: { info: { name: '' } } },
        'localhost:7271': { status: 200, body: { title: '' } },
        'localhost:47836': { status: 200, body: { title: '' } },
      }),
    );
    const store = createPlayerStore();
    const socket: YtmDesktopSocket = {
      auth: undefined,
      connect: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      disconnect: vi.fn(),
    } as unknown as YtmDesktopSocket;

    for (const service of Object.values(MusicSource)) {
      const adapter = createWidgetSource(service, {
        store,
        widgetToken: 'local',
        settings: DEFAULT_PROFILE_SETTINGS,
        fetchImpl,
        ytmSocketFactory: () => socket,
      });
      expect(adapter).not.toBeNull();
      adapter!.start();
      adapter!.stop();
    }
  });
});

describe('pure resolution helpers', () => {
  it('resolveProfileWidgetStatus maps the original error strings', () => {
    expect(resolveProfileWidgetStatus(null)).toBeNull();
    expect(
      resolveProfileWidgetStatus({ status: 404, error: 'Profile not found' }),
    ).toBe('PROFILE_NOT_EXISTING');
    expect(
      resolveProfileWidgetStatus({
        status: 403,
        error: 'Upgrade to Pro to get unlimited profiles',
      }),
    ).toBe('DISABLED_PROFILE');
    expect(
      resolveProfileWidgetStatus({
        status: 403,
        error: 'Upgrade to Pro to use this skin',
      }),
    ).toBe('DISABLED_PRO_SKIN');
    expect(
      resolveProfileWidgetStatus({
        status: 403,
        error: 'Join the Discord Server to use this skin',
      }),
    ).toBe('DISABLED_DISCORD_SKIN');
    expect(resolveProfileWidgetStatus({ status: 502 })).toBe('SERVER_ERROR');
    expect(resolveProfileWidgetStatus({ status: 500 })).toBeNull();
  });

  it('resolveSkinGating returns null for free skins and locks pro/discord', () => {
    expect(
      resolveSkinGating({
        settings: { ...DEFAULT_PROFILE_SETTINGS, skin: 'boxy' },
      }),
    ).toBeNull();
    expect(
      resolveSkinGating({
        settings: { ...DEFAULT_PROFILE_SETTINGS, skin: 'windows98' },
        subscriptionStatus: 'inactive',
      }),
    ).toBe('DISABLED_PRO_SKIN');
    expect(
      resolveSkinGating({
        settings: { ...DEFAULT_PROFILE_SETTINGS, skin: 'discord' },
        subscriptionStatus: 'inactive',
        hasDiscordConnection: false,
        isDiscordMember: false,
      }),
    ).toBe('DISABLED_DISCORD_SKIN');
  });

  it('resolveActiveMusicService validates against the MusicSource enum', () => {
    expect(resolveActiveMusicService({ music_service: 'pear-desktop' })).toBe(
      'pear-desktop',
    );
    expect(resolveActiveMusicService({ music_service: 'nope' })).toBeNull();
    expect(resolveActiveMusicService(null)).toBeNull();
  });

  it('fetchWidgetProfile sends the Bearer widget_token and maps errors', async () => {
    const { fetchImpl, calls } = createFetchMock({
      '/api/widgets/amuse/profiles': {
        status: 200,
        body: PROFILE,
      },
    });
    const result = await fetchWidgetProfile(fetchImpl, 'wt-123', 'main');
    expect(result.error).toBeNull();
    expect(result.profile?.music_service).toBe('pear-desktop');
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer wt-123');
  });

  it('session-expired result is classified by createSessionClient', async () => {
    const expiredFetch: typeof fetch = (async () => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async (): Promise<SessionFetchResult> => ({
        data: null,
        error: { status: 401, code: 'SESSION_EXPIRED' },
      }),
    })) as unknown as typeof fetch;
    const client = createSessionClient({ fetchImpl: expiredFetch });
    const state = await client.fetchSession();
    expect(state.status).toBe('expired');
    client.cleanup();
  });
});
