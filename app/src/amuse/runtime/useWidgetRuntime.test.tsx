/**
 * useWidgetRuntime tests — plan Todo 37.
 *
 * Verifies the React binding resolves the profile into hook state + the store,
 * renders real track data, and tears the runtime down on unmount (adapters stop,
 * the pusher disconnects) with zero real network/socket I/O.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { createSessionClient } from '../auth/session';
import type {
  PusherChannelLike,
  PusherClientLike,
  PusherFactory,
} from '../player/realtime';
import { useWidgetRuntime } from './useWidgetRuntime';
import type { WidgetSourceFactory } from './bootstrap';

/* -------------------------------------------------------------------------- */
/* Fetch mock                                                                  */
/* -------------------------------------------------------------------------- */

interface RouteSpec {
  status?: number;
  body?: unknown;
}

function createFetchMock(routes: Record<string, RouteSpec>) {
  const calls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    for (const [prefix, spec] of Object.entries(routes)) {
      if (!url.includes(prefix)) continue;
      const status = spec.status ?? 200;
      const ok = status >= 200 && status < 300;
      return {
        ok,
        status,
        statusText: ok ? 'OK' : 'Error',
        json: async () => spec.body,
        text: async () => JSON.stringify(spec.body ?? null),
      } as unknown as Response;
    }
    return {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({}),
      text: async () => '',
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const PROFILE = {
  _id: 'profile_main',
  profile_id: 'main',
  name: 'Main',
  music_service: 'pear-desktop',
  settings: {
    skin: 'boxy',
    theme: 'default_light',
    cover: 'vinyl',
    font: 'poppins',
  },
};

const PEAR_PAYLOAD = {
  track: {
    id: 'pear-1',
    title: 'STAY LOW',
    author: 'MISTERK',
    duration: 214,
    cover: '/assets/spotify_no_cover-DlW0D82t.svg',
  },
  player: { hasSong: true, seekbarCurrentPosition: 53, isPaused: false },
};

function routes(): Record<string, RouteSpec> {
  return {
    '/api/auth/get-session': {
      status: 200,
      body: {
        user: { id: 'u', is_discord_member: true },
        session: { userId: 'u' },
      },
    },
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
  };
}

function sessionFactoryFor(fetchImpl: typeof fetch) {
  return ({ onSessionExpired }: { onSessionExpired: () => void }) =>
    createSessionClient({ onSessionExpired, fetchImpl });
}

function fakePusher() {
  const channel: PusherChannelLike = {
    bind: vi.fn(() => channel),
    unbind_all: vi.fn(),
    unsubscribe: vi.fn(),
  };
  const pusher: PusherClientLike = {
    subscribe: vi.fn(() => channel),
    unsubscribe: vi.fn(),
    disconnect: vi.fn(),
  };
  const factory: PusherFactory = vi.fn(() => pusher);
  return { channel, pusher, factory };
}

afterEach(cleanup);

describe('useWidgetRuntime', () => {
  it('resolves the profile settings + real track and exposes them to Player', async () => {
    const { fetchImpl } = createFetchMock(routes());
    const { result } = renderHook(() =>
      useWidgetRuntime({
        widgetToken: 'local',
        profileId: 'main',
        fetchImpl,
        sessionFactory: sessionFactoryFor(fetchImpl),
      }),
    );

    await waitFor(() => {
      expect(result.current.settings.skin).toBe('boxy');
    });
    await waitFor(() => {
      expect(result.current.widgetState).toBe('SUCCESS');
    });
    expect(result.current.currentTrack.title).toBe('STAY LOW');
    expect(result.current.musicService).toBe('pear-desktop');
    expect(result.current.store.getState().activeMusicService).toBe(
      'pear-desktop',
    );
  });

  it('stops the adapter + disconnects the pusher on unmount', async () => {
    const { fetchImpl } = createFetchMock(routes());
    let stops = 0;
    const sourceFactory: WidgetSourceFactory = () => ({
      start: () => {},
      stop: () => {
        stops += 1;
      },
    });
    const { pusher, factory } = fakePusher();

    const { result, unmount } = renderHook(() =>
      useWidgetRuntime({
        widgetToken: 'local',
        profileId: 'main',
        fetchImpl,
        sourceFactory,
        pusherFactory: factory,
        sessionFactory: sessionFactoryFor(fetchImpl),
      }),
    );

    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });
    expect(pusher.subscribe).toHaveBeenCalledTimes(1);
    expect(stops).toBe(0);

    unmount();

    expect(stops).toBe(1);
    expect(pusher.disconnect).toHaveBeenCalledTimes(1);
  });
});
