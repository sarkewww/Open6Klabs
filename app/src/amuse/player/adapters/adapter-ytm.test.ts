/**
 * Tests for the ytm-desktop source adapter.
 *
 * The socket.io client and the token fetch are injected, so every event name,
 * field path, URL and reconnect option is asserted without a real socket.
 *
 * Source parity: `app/_reference/AmuseWidget.js:3275-3454` and
 * `app/_reference/useSocket2-CiuC2fti.js:1303`.
 */

import { describe, expect, it, vi } from 'vitest';
import { PlaybackState, WidgetStatus, type PlayerTrack } from '../store';
import {
  YTM_DESKTOP_AD_COVER,
  YTM_DESKTOP_NOT_CONNECTED_DETAIL,
  YTM_DESKTOP_REALTIME_URL,
  YTM_DESKTOP_SOCKET_OPTIONS,
  YTM_DESKTOP_TOKEN_URL,
  applyYtmDesktopStateUpdate,
  createYtmDesktopAdapter,
  type YtmDesktopAdapterOptions,
  type YtmDesktopFetch,
  type YtmDesktopPlayerSink,
  type YtmDesktopSocket,
  type YtmDesktopSocketHandler,
  type YtmDesktopSocketOptions,
} from './ytm-desktop';

/* -------------------------------------------------------------------------- */
/* Mocks                                                                       */
/* -------------------------------------------------------------------------- */

class MockSocket implements YtmDesktopSocket {
  auth: Record<string, unknown> | undefined = undefined;
  connectCalls = 0;
  readonly handlers = new Map<string, Set<YtmDesktopSocketHandler>>();

  connect = (): unknown => {
    this.connectCalls += 1;
    return this;
  };

  on = (event: string, handler: YtmDesktopSocketHandler): unknown => {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return this;
  };

  off = (event: string, handler: YtmDesktopSocketHandler): unknown => {
    this.handlers.get(event)?.delete(handler);
    return this;
  };

  emit(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(...args);
    }
  }

  listenerCount(event: string): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}

interface SinkSpies {
  sink: YtmDesktopPlayerSink;
  setCurrentTrack: ReturnType<typeof vi.fn>;
  setPlaybackState: ReturnType<typeof vi.fn>;
  setWidgetState: ReturnType<typeof vi.fn>;
}

function createSink(): SinkSpies {
  const setCurrentTrack = vi.fn();
  const setPlaybackState = vi.fn();
  const setWidgetState = vi.fn();
  return {
    sink: { setCurrentTrack, setPlaybackState, setWidgetState },
    setCurrentTrack,
    setPlaybackState,
    setWidgetState,
  };
}

interface FetchCall {
  url: string;
  init: RequestInit;
}

function tokenFetch(
  body: unknown,
  ok = true,
): { fetchToken: YtmDesktopFetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchToken: YtmDesktopFetch = async (url, init) => {
    calls.push({ url, init });
    return { ok, json: async () => body };
  };
  return { fetchToken, calls };
}

/** Let every pending microtask settle (token fetch chain). */
function flush(): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

interface Setup {
  socket: MockSocket;
  createSocket: ReturnType<typeof vi.fn>;
  socketOptions: YtmDesktopSocketOptions[];
  spies: SinkSpies;
  onError: ReturnType<typeof vi.fn>;
}

function setup(overrides: Partial<YtmDesktopAdapterOptions> = {}): Setup {
  const socket = new MockSocket();
  const socketOptions: YtmDesktopSocketOptions[] = [];
  const createSocket = vi.fn(
    (_url: string, options: YtmDesktopSocketOptions): YtmDesktopSocket => {
      socketOptions.push(options);
      return socket;
    },
  );
  const spies = createSink();
  const onError = vi.fn();
  createYtmDesktopAdapter({
    widgetToken: 'widget-token-123',
    sink: spies.sink,
    createSocket,
    fetchToken: tokenFetch({ token: 'ytmd-token' }).fetchToken,
    onError,
    ...overrides,
  });
  return { socket, createSocket, socketOptions, spies, onError };
}

/* -------------------------------------------------------------------------- */
/* Constants — exact URL / options / event contract                            */
/* -------------------------------------------------------------------------- */

describe('ytm-desktop constants', () => {
  it('uses the exact realtime URL', () => {
    expect(YTM_DESKTOP_REALTIME_URL).toBe(
      'http://localhost:9863/api/v1/realtime',
    );
  });

  it('uses the exact token endpoint and 404 detail', () => {
    expect(YTM_DESKTOP_TOKEN_URL).toBe('/api/widget/accounts/ytmdesktop');
    expect(YTM_DESKTOP_NOT_CONNECTED_DETAIL).toBe(
      '404: Youtube Music Desktop App is not connected',
    );
  });

  it('copies the original reconnect options verbatim', () => {
    expect(YTM_DESKTOP_SOCKET_OPTIONS).toEqual({
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      autoConnect: false,
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Socket creation + token handshake                                           */
/* -------------------------------------------------------------------------- */

describe('createYtmDesktopAdapter — socket + token', () => {
  it('creates the socket with the exact URL and options', () => {
    const { createSocket, socketOptions } = setup();
    expect(createSocket).toHaveBeenCalledTimes(1);
    expect(createSocket.mock.calls[0]?.[0]).toBe(YTM_DESKTOP_REALTIME_URL);
    expect(socketOptions[0]).toEqual(YTM_DESKTOP_SOCKET_OPTIONS);
    // Never connect until the token arrives.
    expect(socketOptions[0]?.autoConnect).toBe(false);
  });

  it('fetches the token with the Bearer widget_token header', () => {
    const socket = new MockSocket();
    const { fetchToken, calls } = tokenFetch({ token: 'ytmd-token' });
    createYtmDesktopAdapter({
      widgetToken: 'widget-token-123',
      sink: createSink().sink,
      createSocket: () => socket,
      fetchToken,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(YTM_DESKTOP_TOKEN_URL);
    expect(calls[0]?.init.headers).toEqual({
      Authorization: 'Bearer widget-token-123',
      'Content-Type': 'application/json',
    });
  });

  it('assigns auth, connects and sets SUCCESS on a successful token fetch', async () => {
    const socket = new MockSocket();
    const spies = createSink();
    const { fetchToken } = tokenFetch({ token: 'ytmd-token' });
    createYtmDesktopAdapter({
      widgetToken: 'widget-token-123',
      sink: spies.sink,
      createSocket: () => socket,
      fetchToken,
    });
    await flush();
    expect(socket.auth).toEqual({ token: 'ytmd-token' });
    expect(socket.connectCalls).toBe(1);
    expect(spies.setWidgetState).toHaveBeenCalledWith(WidgetStatus.SUCCESS);
  });

  it('maps the 404 not-connected detail to YTMD_NOT_CONNECTED', async () => {
    const socket = new MockSocket();
    const spies = createSink();
    const onError = vi.fn();
    const { fetchToken } = tokenFetch(
      { detail: YTM_DESKTOP_NOT_CONNECTED_DETAIL },
      false,
    );
    createYtmDesktopAdapter({
      widgetToken: 'widget-token-123',
      sink: spies.sink,
      createSocket: () => socket,
      fetchToken,
      onError,
    });
    await flush();
    expect(spies.setWidgetState).toHaveBeenCalledWith(
      WidgetStatus.YTMD_NOT_CONNECTED,
    );
    expect(socket.connectCalls).toBe(0);
    expect(onError).not.toHaveBeenCalled();
  });

  it('logs and does not set a widget state on any other token error', async () => {
    const socket = new MockSocket();
    const spies = createSink();
    const onError = vi.fn();
    const { fetchToken } = tokenFetch({ detail: '500: boom' }, false);
    createYtmDesktopAdapter({
      widgetToken: 'widget-token-123',
      sink: spies.sink,
      createSocket: () => socket,
      fetchToken,
      onError,
    });
    await flush();
    expect(spies.setWidgetState).not.toHaveBeenCalled();
    expect(socket.connectCalls).toBe(0);
    expect(onError).toHaveBeenCalledWith('Error fetching ytmdesktop token:', {
      detail: '500: boom',
    });
  });

  it('logs a rejected token fetch', async () => {
    const socket = new MockSocket();
    const onError = vi.fn();
    const fetchToken: YtmDesktopFetch = () =>
      Promise.reject(new Error('network down'));
    createYtmDesktopAdapter({
      widgetToken: 'widget-token-123',
      sink: createSink().sink,
      createSocket: () => socket,
      fetchToken,
      onError,
    });
    await flush();
    expect(onError).toHaveBeenCalledWith(
      'Error fetching ytmdesktop token:',
      expect.any(Error),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Socket lifecycle events                                                     */
/* -------------------------------------------------------------------------- */

describe('createYtmDesktopAdapter — socket lifecycle', () => {
  it('binds every original event name', () => {
    const { socket } = setup();
    for (const event of [
      'connect',
      'connect_error',
      'connect_timeout',
      'reconnect_failed',
      'disconnect',
      'state-update',
    ]) {
      expect(socket.listenerCount(event)).toBe(1);
    }
  });

  it('sets SUCCESS on connect', () => {
    const { socket, spies } = setup();
    socket.emit('connect');
    expect(spies.setWidgetState).toHaveBeenCalledWith(WidgetStatus.SUCCESS);
  });

  it.each(['connect_error', 'connect_timeout', 'reconnect_failed'])(
    'sets NOTHING_PLAYING and logs on %s',
    (event) => {
      const { socket, spies, onError } = setup();
      socket.emit(event, new Error('nope'));
      expect(spies.setPlaybackState).toHaveBeenCalledWith(
        PlaybackState.NOTHING_PLAYING,
      );
      expect(onError).toHaveBeenCalledWith(
        'Failed to connect to youtube music desktop v2 socket:',
        expect.any(Error),
      );
    },
  );

  it('sets NOTHING_PLAYING on disconnect', () => {
    const { socket, spies } = setup();
    socket.emit('disconnect');
    expect(spies.setPlaybackState).toHaveBeenCalledWith(
      PlaybackState.NOTHING_PLAYING,
    );
  });

  it('dispose removes every listener', () => {
    const socket = new MockSocket();
    const adapter = createYtmDesktopAdapter({
      widgetToken: 'widget-token-123',
      sink: createSink().sink,
      createSocket: () => socket,
      fetchToken: tokenFetch({ token: 'ytmd-token' }).fetchToken,
    });
    adapter.dispose();
    for (const event of [
      'connect',
      'connect_error',
      'connect_timeout',
      'reconnect_failed',
      'disconnect',
      'state-update',
    ]) {
      expect(socket.listenerCount(event)).toBe(0);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* state-update field mapping                                                  */
/* -------------------------------------------------------------------------- */

const basePayload = {
  video: {
    id: 'vid-1',
    title: 'Song Title',
    author: 'Song Author',
    durationSeconds: 210,
    thumbnails: [
      { url: 'https://img/cover.jpg' },
      { url: 'https://img/mid.jpg' },
      { url: 'https://img/canvas.jpg' },
    ],
  },
  player: {
    adPlaying: false,
    trackState: 1,
    videoProgress: 42.5,
  },
};

describe('applyYtmDesktopStateUpdate', () => {
  it('maps trackState===1 to PLAYING with the exact field paths', () => {
    const { sink, setCurrentTrack, setPlaybackState } = createSink();
    applyYtmDesktopStateUpdate(basePayload, sink);
    expect(setPlaybackState).toHaveBeenCalledWith(PlaybackState.PLAYING);
    expect(setCurrentTrack).toHaveBeenCalledWith({
      id: 'vid-1',
      title: 'Song Title',
      artist: 'Song Author',
      duration: 210_000,
      progress: 42_500,
      is_playing: true,
      cover_url: 'https://img/cover.jpg',
      canvas_url: 'https://img/canvas.jpg',
    } satisfies Partial<PlayerTrack>);
  });

  it('maps adPlaying to the Ad Break track + ADVERTISEMENT', () => {
    const { sink, setCurrentTrack, setPlaybackState } = createSink();
    applyYtmDesktopStateUpdate(
      { ...basePayload, player: { ...basePayload.player, adPlaying: true } },
      sink,
    );
    expect(setPlaybackState).toHaveBeenCalledWith(PlaybackState.ADVERTISEMENT);
    expect(setCurrentTrack).toHaveBeenCalledWith({
      id: 'vid-1',
      title: 'Ad Break',
      artist: 'Music will resume shortly',
      cover_url: YTM_DESKTOP_AD_COVER,
      progress: 0,
      duration: 0,
      is_playing: true,
      canvas_url: undefined,
    } satisfies Partial<PlayerTrack>);
  });

  it('maps trackState===0 to a paused current track', () => {
    const { sink, setCurrentTrack, setPlaybackState } = createSink();
    applyYtmDesktopStateUpdate(
      { ...basePayload, player: { ...basePayload.player, trackState: 0 } },
      sink,
    );
    expect(setCurrentTrack).toHaveBeenCalledWith({ is_playing: false });
    expect(setPlaybackState).not.toHaveBeenCalled();
  });

  it('maps a payload without video to NOTHING_PLAYING', () => {
    const { sink, setCurrentTrack, setPlaybackState } = createSink();
    applyYtmDesktopStateUpdate({ player: basePayload.player }, sink);
    expect(setPlaybackState).toHaveBeenCalledWith(
      PlaybackState.NOTHING_PLAYING,
    );
    expect(setCurrentTrack).not.toHaveBeenCalled();
  });

  it('maps a non-object payload to NOTHING_PLAYING', () => {
    const { sink, setPlaybackState } = createSink();
    applyYtmDesktopStateUpdate(undefined, sink);
    expect(setPlaybackState).toHaveBeenCalledWith(
      PlaybackState.NOTHING_PLAYING,
    );
  });

  it('routes the state-update socket event through the mapping', () => {
    const { socket, spies } = setup();
    socket.emit('state-update', basePayload);
    expect(spies.setPlaybackState).toHaveBeenCalledWith(PlaybackState.PLAYING);
    expect(spies.setCurrentTrack).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'vid-1', is_playing: true }),
    );
  });
});
