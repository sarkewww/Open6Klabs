/**
 * Vitest suite for the Spotify source adapter.
 *
 * Locks the original token query (`useAxios-Rfx7aUEI.js:9-16`) and the
 * currently-playing poll (`AmuseWidget.js:650-963`):
 *  - exact token URL / Bearer widget_token header / `refetchInterval: 33e5` /
 *    `retry: 2` / `retryDelay(e) = min(1000 * 2 ** e, 30000)`;
 *  - exact currently-playing URL incl. `additional_types=episode`, polled at
 *    3000ms, `Authorization: Bearer <spotify-token>`;
 *  - field mapping for `track` (`artists[0].name`, `album.images[0].url`,
 *    `is_local`) vs `episode` (`show.name`, `images[0].url`);
 *  - `200 -> PLAYING`, `204 -> NOTHING_PLAYING`;
 *  - error branches: 401 token expired, 403 free account, 429 rate limited
 *    (plus 400/503/default/no-response for completeness).
 *
 * HTTP is mocked via the injectable `SpotifyHttpClient`; no real network call
 * is ever made.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { SPOTIFY_NO_COVER_IMAGE } from '../../settings/registry';
import {
  PlaybackState,
  WidgetStatus,
  type PlayerTrack,
  type RawSpotifyItem,
} from '../store';
import {
  SPOTIFY_AD_COVER,
  SPOTIFY_CURRENTLY_PLAYING_URL,
  SPOTIFY_POLL_INTERVAL_MS,
  SPOTIFY_TOKEN_ERROR_MESSAGE,
  SPOTIFY_TOKEN_REFETCH_INTERVAL_MS,
  SPOTIFY_TOKEN_RETRY,
  SPOTIFY_TOKEN_URL,
  applySpotifyResult,
  createSpotifyAdapter,
  createSpotifyNothingPlayingResult,
  defaultSpotifyHttpClient,
  extractSpotifyToken,
  fetchSpotifyCurrentlyPlaying,
  fetchSpotifyToken,
  fetchSpotifyTokenWithRetry,
  getSpotifyErrorStatus,
  mapSpotifyCurrentlyPlaying,
  resolveSpotifyErrorBranch,
  spotifyTokenRetryDelay,
  type SpotifyCurrentlyPlaying,
  type SpotifyHttpClient,
  type SpotifyPlayerSink,
  type SpotifyRequestConfig,
} from './spotify';

/* -------------------------------------------------------------------------- */
/* Fake injectable HTTP client                                                 */
/* -------------------------------------------------------------------------- */

interface RecordedCall {
  url: string;
  config?: SpotifyRequestConfig;
}

type FakeOutcome = { status: number; data: unknown } | Error;

function createFakeHttp(
  handler: (
    url: string,
    config: SpotifyRequestConfig | undefined,
    callIndex: number,
  ) => FakeOutcome,
): { http: SpotifyHttpClient; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const http: SpotifyHttpClient = {
    get: <T>(url: string, config?: SpotifyRequestConfig) => {
      const index = calls.length;
      calls.push({ url, config });
      const outcome = handler(url, config, index);
      if (outcome instanceof Error) return Promise.reject(outcome);
      return Promise.resolve({
        status: outcome.status,
        data: outcome.data as T,
      });
    },
  };
  return { http, calls };
}

/** Axios-shaped rejection: an error carrying a `response.status`. */
function httpError(status: number): Error & { response: { status: number } } {
  const error = new Error(`Request failed with status ${status}`) as Error & {
    response: { status: number };
  };
  error.response = { status };
  return error;
}

const TRACK_ITEM = {
  id: 'track-1',
  name: 'Midnight City',
  type: 'track',
  duration_ms: 243_000,
  is_local: false,
  artists: [{ name: 'M83' }],
  album: { images: [{ url: 'https://i.scdn.co/image/album.jpg' }] },
};

const EPISODE_ITEM = {
  id: 'episode-1',
  name: 'Episode 42',
  type: 'episode',
  duration_ms: 3_600_000,
  show: { name: 'The Show' },
  images: [{ url: 'https://i.scdn.co/image/episode.jpg' }],
};

function trackPayload(item: unknown = TRACK_ITEM): SpotifyCurrentlyPlaying {
  return {
    item: item as SpotifyCurrentlyPlaying['item'],
    currently_playing_type: (item as { type?: string })?.type,
    is_playing: true,
    progress_ms: 61_000,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

describe('spotify request constants', () => {
  it('uses the exact original token endpoint', () => {
    expect(SPOTIFY_TOKEN_URL).toBe('/api/widget/spotify/token');
  });

  it('refetches the token every 3,300,000ms with retry 2', () => {
    expect(SPOTIFY_TOKEN_REFETCH_INTERVAL_MS).toBe(3_300_000);
    expect(SPOTIFY_TOKEN_RETRY).toBe(2);
  });

  it('uses the exact original retryDelay backoff (capped at 30s)', () => {
    expect(spotifyTokenRetryDelay(0)).toBe(1000);
    expect(spotifyTokenRetryDelay(1)).toBe(2000);
    expect(spotifyTokenRetryDelay(4)).toBe(16_000);
    expect(spotifyTokenRetryDelay(5)).toBe(30_000);
    expect(spotifyTokenRetryDelay(10)).toBe(30_000);
  });

  it('uses the exact currently-playing URL incl. additional_types=episode', () => {
    expect(SPOTIFY_CURRENTLY_PLAYING_URL).toBe(
      'https://api.spotify.com/v1/me/player/currently-playing?additional_types=episode',
    );
  });

  it('polls every 3000ms', () => {
    expect(SPOTIFY_POLL_INTERVAL_MS).toBe(3000);
  });

  it('exposes a default axios-backed HTTP client', () => {
    expect(typeof defaultSpotifyHttpClient.get).toBe('function');
  });
});

/* -------------------------------------------------------------------------- */
/* Token fetch                                                                 */
/* -------------------------------------------------------------------------- */

describe('fetchSpotifyToken', () => {
  it('sends the exact token request shape (Bearer widget_token)', async () => {
    const { http, calls } = createFakeHttp(() => ({
      status: 200,
      data: 'BQ_TOKEN',
    }));
    const token = await fetchSpotifyToken({ widgetToken: 'wt-123', http });

    expect(token).toBe('BQ_TOKEN');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('/api/widget/spotify/token');
    expect(calls[0].config?.headers).toEqual({
      Authorization: 'Bearer wt-123',
      'Content-Type': 'application/json',
    });
    // The original checks `e.ok`; axios must not throw on non-2xx.
    expect(calls[0].config?.validateStatus?.(500)).toBe(true);
    expect(calls[0].config?.validateStatus?.(200)).toBe(true);
  });

  it('accepts the mock-server contract { token: string }', async () => {
    const { http } = createFakeHttp(() => ({
      status: 200,
      data: { token: 'BQ_FROM_OBJECT' },
    }));
    await expect(fetchSpotifyToken({ widgetToken: 'wt', http })).resolves.toBe(
      'BQ_FROM_OBJECT',
    );
  });

  it('throws an error carrying status/code/needsReconnect on non-2xx', async () => {
    const { http } = createFakeHttp(() => ({
      status: 401,
      data: {
        error: 'token revoked',
        code: 'invalid_grant',
        needsReconnect: true,
      },
    }));

    await expect(
      fetchSpotifyToken({ widgetToken: 'wt', http }),
    ).rejects.toMatchObject({
      message: 'token revoked',
      status: 401,
      code: 'invalid_grant',
      needsReconnect: true,
    });
  });

  it('falls back to the original message when the body has no error', async () => {
    const { http } = createFakeHttp(() => ({ status: 500, data: null }));
    await expect(
      fetchSpotifyToken({ widgetToken: 'wt', http }),
    ).rejects.toMatchObject({
      message: SPOTIFY_TOKEN_ERROR_MESSAGE,
      status: 500,
      needsReconnect: false,
    });
  });

  it('rejects the Spotify OAuth { access_token } shape instead of sending [object Object]', () => {
    expect(() => extractSpotifyToken({ access_token: 'LEAKED' })).toThrow(
      SPOTIFY_TOKEN_ERROR_MESSAGE,
    );
  });
});

describe('fetchSpotifyTokenWithRetry', () => {
  it('retries twice with the original backoff, then succeeds (3 attempts)', async () => {
    vi.useFakeTimers();
    const { http, calls } = createFakeHttp((_url, _config, index) =>
      index < 2
        ? { status: 500, data: null }
        : { status: 200, data: 'BQ_AFTER_RETRY' },
    );
    const onRetry = vi.fn();

    const promise = fetchSpotifyTokenWithRetry({
      widgetToken: 'wt',
      http,
      onRetry,
    });

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);

    await expect(promise).resolves.toBe('BQ_AFTER_RETRY');
    expect(calls).toHaveLength(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, 0, expect.any(Error));
    expect(onRetry).toHaveBeenNthCalledWith(2, 1, expect.any(Error));
  });

  it('gives up after the retry budget', async () => {
    vi.useFakeTimers();
    const { http, calls } = createFakeHttp(() => ({ status: 500, data: null }));
    const promise = fetchSpotifyTokenWithRetry({
      widgetToken: 'wt',
      http,
      retry: 2,
    });
    const assertion = expect(promise).rejects.toMatchObject({ status: 500 });

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await assertion;
    expect(calls).toHaveLength(3);
  });
});

/* -------------------------------------------------------------------------- */
/* Mapping                                                                     */
/* -------------------------------------------------------------------------- */

describe('mapSpotifyCurrentlyPlaying', () => {
  it('maps a track (artists[0].name + album.images[0].url)', () => {
    const result = mapSpotifyCurrentlyPlaying(trackPayload());

    expect(result.playbackState).toBe(PlaybackState.PLAYING);
    expect(result.widgetState).toBe(WidgetStatus.SUCCESS);
    expect(result.rawItem).toBe(TRACK_ITEM);
    expect(result.track).toEqual({
      title: 'Midnight City',
      artist: 'M83',
      duration: 243_000,
      progress: 61_000,
      cover_url: 'https://i.scdn.co/image/album.jpg',
      is_playing: true,
      canvas_url: '',
      id: 'track-1',
      isLiveStream: false,
    });
  });

  it('maps an episode (show.name + images[0].url)', () => {
    const result = mapSpotifyCurrentlyPlaying(trackPayload(EPISODE_ITEM));
    expect(result.track?.artist).toBe('The Show');
    expect(result.track?.cover_url).toBe('https://i.scdn.co/image/episode.jpg');
    expect(result.track?.title).toBe('Episode 42');
    expect(result.track?.duration).toBe(3_600_000);
  });

  it('maps a local track to the no-cover branch (is_local)', () => {
    // Original: `R && !R.is_local ? ... : c({ artist: R.artists[0].name || "No Artist",
    // cover_url: Ee })` — a local track keeps the artist name and drops the cover.
    const result = mapSpotifyCurrentlyPlaying(
      trackPayload({ ...TRACK_ITEM, is_local: true }),
    );
    expect(result.track?.artist).toBe('M83');
    expect(result.track?.cover_url).toBe(SPOTIFY_NO_COVER_IMAGE);
  });

  it('uses "No Artist" for a local track with no artist name', () => {
    const result = mapSpotifyCurrentlyPlaying(
      trackPayload({ ...TRACK_ITEM, is_local: true, artists: [] }),
    );
    expect(result.track?.artist).toBe('No Artist');
    expect(result.track?.cover_url).toBe(SPOTIFY_NO_COVER_IMAGE);
  });

  it('falls back to "Unknown Artist" / no cover for a non-local track without art', () => {
    const result = mapSpotifyCurrentlyPlaying(
      trackPayload({ ...TRACK_ITEM, artists: [], album: undefined }),
    );
    expect(result.track?.artist).toBe('Unknown Artist');
    expect(result.track?.cover_url).toBe(SPOTIFY_NO_COVER_IMAGE);
  });

  it('maps an ad to Ad Break / Music will resume shortly', () => {
    const result = mapSpotifyCurrentlyPlaying(
      trackPayload({ id: 'ad-1', name: 'x', type: 'ad' }),
    );
    expect(result.track?.title).toBe('Ad Break');
    expect(result.track?.artist).toBe('Music will resume shortly');
    expect(result.track?.cover_url).toBe(SPOTIFY_AD_COVER);
    expect(result.track?.is_playing).toBe(true);
  });

  it('returns NOTHING_PLAYING when there is no item', () => {
    const result = mapSpotifyCurrentlyPlaying({
      item: null,
      is_playing: false,
    });
    expect(result.playbackState).toBe(PlaybackState.NOTHING_PLAYING);
    expect(result.widgetState).toBe(WidgetStatus.SUCCESS);
    expect(result.rawItem).toBeNull();
    expect(result.track?.is_playing).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Poll tick                                                                   */
/* -------------------------------------------------------------------------- */

describe('fetchSpotifyCurrentlyPlaying', () => {
  it('sends the exact poll request (Bearer spotify token) and maps 200', async () => {
    const { http, calls } = createFakeHttp(() => ({
      status: 200,
      data: trackPayload(),
    }));
    const result = await fetchSpotifyCurrentlyPlaying({
      token: 'SPOT_TOKEN',
      http,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      'https://api.spotify.com/v1/me/player/currently-playing?additional_types=episode',
    );
    expect(calls[0].config?.headers).toEqual({
      Authorization: 'Bearer SPOT_TOKEN',
    });
    // Poll uses axios default (non-2xx rejects), unlike the token request.
    expect(calls[0].config?.validateStatus).toBeUndefined();

    expect(result.playbackState).toBe(PlaybackState.PLAYING);
    expect(result.widgetState).toBe(WidgetStatus.SUCCESS);
    expect(result.track?.title).toBe('Midnight City');
    expect(result.rawItem).toBe(TRACK_ITEM);
  });

  it('maps 204 to NOTHING_PLAYING', async () => {
    const { http } = createFakeHttp(() => ({ status: 204, data: undefined }));
    const result = await fetchSpotifyCurrentlyPlaying({ token: 't', http });
    expect(result.playbackState).toBe(PlaybackState.NOTHING_PLAYING);
    expect(result.widgetState).toBe(WidgetStatus.SUCCESS);
    expect(result.track?.title).toBe('Nothing Playing');
  });

  it('maps 401 to SPOTIFY_TOKEN_EXPIRED', async () => {
    const { http } = createFakeHttp(() => httpError(401));
    const result = await fetchSpotifyCurrentlyPlaying({ token: 't', http });
    expect(result.playbackState).toBe(PlaybackState.TOKEN_EXPIRED);
    expect(result.widgetState).toBe(WidgetStatus.SPOTIFY_TOKEN_EXPIRED);
    expect(result.track).toBeNull();
  });

  it('maps 403 to SPOTIFY_FREE_ACCOUNT', async () => {
    const { http } = createFakeHttp(() => httpError(403));
    const result = await fetchSpotifyCurrentlyPlaying({ token: 't', http });
    expect(result.widgetState).toBe(WidgetStatus.SPOTIFY_FREE_ACCOUNT);
    expect(result.playbackState).toBeNull();
    expect(result.track).toBeNull();
  });

  it('maps 429 to RATE_LIMITED', async () => {
    const { http } = createFakeHttp(() => httpError(429));
    const result = await fetchSpotifyCurrentlyPlaying({ token: 't', http });
    expect(result.playbackState).toBe(PlaybackState.RATE_LIMITED);
    expect(result.widgetState).toBeNull();
    expect(result.track).toBeNull();
  });

  it.each([
    [400, WidgetStatus.NO_SPOTIFY_ACCOUNT],
    [503, WidgetStatus.SERVER_ERROR],
    [500, WidgetStatus.SPOTIFY_ERROR],
  ])('maps %i to %s', async (status, widgetState) => {
    const { http } = createFakeHttp(() => httpError(status));
    const result = await fetchSpotifyCurrentlyPlaying({ token: 't', http });
    expect(result.widgetState).toBe(widgetState);
    expect(result.track).toBeNull();
  });

  it('keeps the last state on a response-less network error', async () => {
    const { http } = createFakeHttp(() => new Error('network down'));
    const result = await fetchSpotifyCurrentlyPlaying({ token: 't', http });
    expect(result.playbackState).toBeNull();
    expect(result.widgetState).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
  });
});

describe('error branch helpers', () => {
  it('resolves every original status branch', () => {
    expect(resolveSpotifyErrorBranch(401)).toEqual({
      playbackState: PlaybackState.TOKEN_EXPIRED,
      widgetState: WidgetStatus.SPOTIFY_TOKEN_EXPIRED,
    });
    expect(resolveSpotifyErrorBranch(403)).toEqual({
      widgetState: WidgetStatus.SPOTIFY_FREE_ACCOUNT,
    });
    expect(resolveSpotifyErrorBranch(429)).toEqual({
      playbackState: PlaybackState.RATE_LIMITED,
    });
    expect(resolveSpotifyErrorBranch(400)).toEqual({
      widgetState: WidgetStatus.NO_SPOTIFY_ACCOUNT,
    });
    expect(resolveSpotifyErrorBranch(503)).toEqual({
      widgetState: WidgetStatus.SERVER_ERROR,
    });
    expect(resolveSpotifyErrorBranch(undefined)).toEqual({});
    expect(resolveSpotifyErrorBranch(500)).toEqual({
      widgetState: WidgetStatus.SPOTIFY_ERROR,
    });
  });

  it('reads the status from both axios errors and token errors', () => {
    expect(getSpotifyErrorStatus(httpError(429))).toBe(429);
    expect(getSpotifyErrorStatus({ status: 401 })).toBe(401);
    expect(getSpotifyErrorStatus(new Error('x'))).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Sink application                                                            */
/* -------------------------------------------------------------------------- */

function createSink(): {
  sink: SpotifyPlayerSink;
  setCurrentTrack: ReturnType<typeof vi.fn>;
  setPlaybackState: ReturnType<typeof vi.fn>;
  setWidgetState: ReturnType<typeof vi.fn>;
  setRawSpotifyItem: ReturnType<typeof vi.fn>;
} {
  const setCurrentTrack = vi.fn();
  const setPlaybackState = vi.fn();
  const setWidgetState = vi.fn();
  const setRawSpotifyItem = vi.fn();
  return {
    sink: {
      setCurrentTrack,
      setPlaybackState,
      setWidgetState,
      setRawSpotifyItem,
    },
    setCurrentTrack,
    setPlaybackState,
    setWidgetState,
    setRawSpotifyItem,
  };
}

describe('applySpotifyResult', () => {
  it('writes the track, states and raw item', () => {
    const {
      sink,
      setCurrentTrack,
      setPlaybackState,
      setWidgetState,
      setRawSpotifyItem,
    } = createSink();
    const track = mapSpotifyCurrentlyPlaying(trackPayload())
      .track as PlayerTrack;
    const rawItem = { id: 'track-1' } as RawSpotifyItem;

    applySpotifyResult(
      {
        track,
        playbackState: PlaybackState.PLAYING,
        widgetState: WidgetStatus.SUCCESS,
        rawItem,
      },
      sink,
    );

    expect(setCurrentTrack).toHaveBeenCalledWith(track);
    expect(setPlaybackState).toHaveBeenCalledWith(PlaybackState.PLAYING);
    expect(setWidgetState).toHaveBeenCalledWith(WidgetStatus.SUCCESS);
    expect(setRawSpotifyItem).toHaveBeenCalledWith(rawItem);
  });

  it('skips null states (keep-last-known) but still clears the raw item', () => {
    const {
      sink,
      setCurrentTrack,
      setPlaybackState,
      setWidgetState,
      setRawSpotifyItem,
    } = createSink();
    applySpotifyResult(
      { track: null, playbackState: null, widgetState: null, rawItem: null },
      sink,
    );
    expect(setCurrentTrack).not.toHaveBeenCalled();
    expect(setPlaybackState).not.toHaveBeenCalled();
    expect(setWidgetState).not.toHaveBeenCalled();
    expect(setRawSpotifyItem).toHaveBeenCalledWith(null);
  });

  it('exposes a nothing-playing result builder', () => {
    const result = createSpotifyNothingPlayingResult();
    expect(result.playbackState).toBe(PlaybackState.NOTHING_PLAYING);
    expect(result.track?.title).toBe('Nothing Playing');
  });
});

/* -------------------------------------------------------------------------- */
/* Polling adapter                                                             */
/* -------------------------------------------------------------------------- */

describe('createSpotifyAdapter', () => {
  it('pollOnce fetches a token then polls, writing into the sink', async () => {
    const {
      sink,
      setCurrentTrack,
      setPlaybackState,
      setWidgetState,
      setRawSpotifyItem,
    } = createSink();
    const { http, calls } = createFakeHttp((url) =>
      url === SPOTIFY_TOKEN_URL
        ? { status: 200, data: 'BQ_TOKEN' }
        : { status: 200, data: trackPayload() },
    );
    const adapter = createSpotifyAdapter({ widgetToken: 'wt', sink, http });

    const result = await adapter.pollOnce();

    expect(calls.map((c) => c.url)).toEqual([
      SPOTIFY_TOKEN_URL,
      SPOTIFY_CURRENTLY_PLAYING_URL,
    ]);
    expect(calls[0].config?.headers.Authorization).toBe('Bearer wt');
    expect(calls[1].config?.headers.Authorization).toBe('Bearer BQ_TOKEN');
    expect(result.playbackState).toBe(PlaybackState.PLAYING);
    expect(adapter.token).toBe('BQ_TOKEN');
    expect(setCurrentTrack).toHaveBeenCalledTimes(1);
    expect(setPlaybackState).toHaveBeenCalledWith(PlaybackState.PLAYING);
    expect(setWidgetState).toHaveBeenCalledWith(WidgetStatus.SUCCESS);
    expect(setRawSpotifyItem).toHaveBeenCalledWith(TRACK_ITEM);
  });

  it('polls immediately then every 3000ms and stops on dispose', async () => {
    vi.useFakeTimers();
    const { sink } = createSink();
    const { http, calls } = createFakeHttp((url) =>
      url === SPOTIFY_TOKEN_URL
        ? { status: 200, data: 'BQ_TOKEN' }
        : { status: 204, data: undefined },
    );
    const adapter = createSpotifyAdapter({
      widgetToken: 'wt',
      sink,
      http,
      tokenIntervalMs: 10_000_000,
    });

    adapter.start();
    await vi.advanceTimersByTimeAsync(0);
    // token + first poll
    expect(calls).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(3000);
    expect(calls).toHaveLength(3);

    await vi.advanceTimersByTimeAsync(3000);
    expect(calls).toHaveLength(4);

    adapter.stop();
    expect(adapter.isRunning).toBe(false);
    await vi.advanceTimersByTimeAsync(9000);
    expect(calls).toHaveLength(4);
  });

  it('refetches the token on the 3,300,000ms interval', async () => {
    vi.useFakeTimers();
    const { sink } = createSink();
    const { http, calls } = createFakeHttp((url) =>
      url === SPOTIFY_TOKEN_URL
        ? { status: 200, data: 'BQ_TOKEN' }
        : { status: 204, data: undefined },
    );
    const adapter = createSpotifyAdapter({
      widgetToken: 'wt',
      sink,
      http,
      pollIntervalMs: 10_000_000,
      tokenIntervalMs: 1000,
    });

    adapter.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.filter((c) => c.url === SPOTIFY_TOKEN_URL)).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(calls.filter((c) => c.url === SPOTIFY_TOKEN_URL)).toHaveLength(2);

    adapter.stop();
  });

  it('leaves the widget state untouched on a token-fetch failure (master election drives SUCCESS)', async () => {
    const { sink, setWidgetState, setPlaybackState } = createSink();
    const { http } = createFakeHttp((url) =>
      url === SPOTIFY_TOKEN_URL
        ? { status: 401, data: { error: 'expired', needsReconnect: true } }
        : { status: 200, data: trackPayload() },
    );
    const adapter = createSpotifyAdapter({
      widgetToken: 'wt',
      sink,
      http,
      tokenRetry: 0,
    });

    // Parity with the original: a TOKEN failure does not map onto the playback
    // error branches (`xe`) — it disables the poll and the BroadcastChannel
    // master election drives `SUCCESS`. No widget/playback state is written.
    const result = await adapter.pollOnce();
    expect(result.playbackState).toBeNull();
    expect(result.widgetState).toBeNull();
    expect(setPlaybackState).not.toHaveBeenCalled();
    expect(setWidgetState).not.toHaveBeenCalled();
  });

  it('mounts the injected BroadcastChannel master election on start/stop', () => {
    const { sink } = createSink();
    const { http } = createFakeHttp(() => ({ status: 204, data: undefined }));
    const masterElection = {
      channelName: 'amuse-spotify-wt',
      instanceId: 'abc12345',
      getIsMaster: () => false,
      start: vi.fn(),
      stop: vi.fn(),
    };
    const adapter = createSpotifyAdapter({
      widgetToken: 'wt',
      sink,
      http,
      masterElection,
      tokenIntervalMs: 10_000_000,
    });

    adapter.start();
    expect(masterElection.start).toHaveBeenCalledTimes(1);
    adapter.stop();
    expect(masterElection.stop).toHaveBeenCalledTimes(1);
  });

  it('recovers from a 401 by force-refreshing the token and retrying', async () => {
    const { sink, setWidgetState } = createSink();
    let tokenCount = 0;
    let pollCount = 0;
    const { http, calls } = createFakeHttp((url) => {
      if (url === SPOTIFY_TOKEN_URL) {
        tokenCount += 1;
        return { status: 200, data: tokenCount === 1 ? 'BQ_1' : 'BQ_2' };
      }
      pollCount += 1;
      return pollCount === 1
        ? httpError(401)
        : { status: 200, data: trackPayload() };
    });
    const adapter = createSpotifyAdapter({ widgetToken: 'wt', sink, http });

    const result = await adapter.pollOnce();

    // Original `ce()`: silent recovery succeeds -> PLAYING / SUCCESS, no
    // TOKEN_EXPIRED branch applied.
    expect(result.playbackState).toBe(PlaybackState.PLAYING);
    expect(result.widgetState).toBe(WidgetStatus.SUCCESS);
    expect(adapter.token).toBe('BQ_2');
    expect(calls.filter((c) => c.url === SPOTIFY_TOKEN_URL)).toHaveLength(2);
    expect(setWidgetState).toHaveBeenCalledWith(WidgetStatus.SUCCESS);
    expect(setWidgetState).not.toHaveBeenCalledWith(
      WidgetStatus.SPOTIFY_TOKEN_EXPIRED,
    );
  });

  it('surfaces SPOTIFY_TOKEN_EXPIRED when 401 recovery fails', async () => {
    const { sink, setWidgetState } = createSink();
    let tokenCount = 0;
    const { http } = createFakeHttp((url) => {
      if (url === SPOTIFY_TOKEN_URL) {
        tokenCount += 1;
        return tokenCount === 1
          ? { status: 200, data: 'BQ' }
          : { status: 401, data: { error: 'revoked', needsReconnect: true } };
      }
      return httpError(401);
    });
    const adapter = createSpotifyAdapter({
      widgetToken: 'wt',
      sink,
      http,
      tokenRetry: 0,
    });

    const result = await adapter.pollOnce();

    expect(result.playbackState).toBe(PlaybackState.TOKEN_EXPIRED);
    expect(result.widgetState).toBe(WidgetStatus.SPOTIFY_TOKEN_EXPIRED);
    expect(setWidgetState).toHaveBeenCalledWith(
      WidgetStatus.SPOTIFY_TOKEN_EXPIRED,
    );
  });

  it('applies 429 back-off: pauses the poll and resumes after the delay', async () => {
    vi.useFakeTimers();
    const { sink, setPlaybackState } = createSink();
    let pollCount = 0;
    const { http } = createFakeHttp((url) => {
      if (url === SPOTIFY_TOKEN_URL) return { status: 200, data: 'BQ' };
      pollCount += 1;
      return pollCount === 1
        ? httpError(429)
        : { status: 204, data: undefined };
    });
    const adapter = createSpotifyAdapter({
      widgetToken: 'wt',
      sink,
      http,
      pollIntervalMs: 100,
      tokenIntervalMs: 10_000_000,
    });

    adapter.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(setPlaybackState).toHaveBeenCalledWith(PlaybackState.RATE_LIMITED);
    expect(pollCount).toBe(1);

    // Back-off = 61s * 1; the 100ms poll must not fire during it.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(pollCount).toBe(1);

    // After the back-off the poll resumes (61s) and the next tick succeeds.
    await vi.advanceTimersByTimeAsync(1_100);
    expect(pollCount).toBeGreaterThanOrEqual(2);

    adapter.stop();
    expect(adapter.isRunning).toBe(false);
  });
});
