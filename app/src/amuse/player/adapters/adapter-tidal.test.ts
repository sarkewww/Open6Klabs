/**
 * Vitest suite for the Tidal source adapter.
 *
 * Locks the original `ri` hook's contract:
 *  - exact URL / headers / `transformRequest` (`sentry-trace` deletion);
 *  - second -> millisecond conversion of `durationInSeconds`/`currentInSeconds`;
 *  - `artist || artists` fallback;
 *  - `is_playing = status.toLowerCase() === "playing"` (case handling);
 *  - `image -> cover_url`, `url -> id`;
 *  - empty / title-missing -> `NOTHING_PLAYING`.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TIDAL_ENABLED,
  TIDAL_HEADERS,
  TIDAL_POLLS_IN_BACKGROUND,
  TIDAL_POLL_INTERVAL_MS,
  TIDAL_TRANSFORM_REQUEST,
  TIDAL_URL,
  defaultTidalHttpClient,
  deleteSentryTrace,
  fetchTidalNowPlaying,
  mapTidalSong,
  startTidalPolling,
  type TidalHttpClient,
  type TidalRawSong,
  type TidalRequestConfig,
} from './tidal';
import { PlaybackState, WidgetStatus } from '../store';

/* -------------------------------------------------------------------------- */
/* Fake injectable HTTP client                                                 */
/* -------------------------------------------------------------------------- */

interface RecordedCall {
  url: string;
  config?: TidalRequestConfig;
}

function createFakeHttp(outcome: { data: TidalRawSong } | Error): {
  http: TidalHttpClient;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const http: TidalHttpClient = {
    get: <T>(url: string, config?: TidalRequestConfig) => {
      calls.push({ url, config });
      if (outcome instanceof Error) return Promise.reject(outcome);
      return Promise.resolve({ data: outcome.data as unknown as T });
    },
  };
  return { http, calls };
}

afterEach(() => {
  vi.useRealTimers();
});

/* -------------------------------------------------------------------------- */
/* Constants / request shaping                                                 */
/* -------------------------------------------------------------------------- */

describe('tidal request constants', () => {
  it('uses the exact original endpoint', () => {
    expect(TIDAL_URL).toBe('http://localhost:47836/current');
  });

  it('polls every 1000ms, in the background, enabled', () => {
    expect(TIDAL_POLL_INTERVAL_MS).toBe(1000);
    expect(TIDAL_POLLS_IN_BACKGROUND).toBe(true);
    expect(TIDAL_ENABLED).toBe(true);
  });

  it('sends Content-Type: application/json', () => {
    expect(TIDAL_HEADERS).toEqual({ 'Content-Type': 'application/json' });
  });

  it('exposes a default axios-backed HTTP client', () => {
    expect(typeof defaultTidalHttpClient.get).toBe('function');
  });
});

describe('deleteSentryTrace (original transformRequest)', () => {
  it('deletes sentry-trace and returns the data untouched', () => {
    const headers: Record<string, unknown> = {
      'sentry-trace': 'abc-123',
      'Content-Type': 'application/json',
    };
    const data = { hello: 'world' };
    const returned = deleteSentryTrace(data, headers);
    expect(headers).not.toHaveProperty('sentry-trace');
    expect(headers['Content-Type']).toBe('application/json');
    expect(returned).toBe(data);
  });

  it('registers exactly the deleteSentryTrace transformer', () => {
    expect(TIDAL_TRANSFORM_REQUEST).toHaveLength(1);
    expect(TIDAL_TRANSFORM_REQUEST[0]).toBe(deleteSentryTrace);
  });
});

/* -------------------------------------------------------------------------- */
/* Mapping                                                                     */
/* -------------------------------------------------------------------------- */

describe('mapTidalSong', () => {
  it('maps every field and converts seconds to milliseconds', () => {
    const track = mapTidalSong({
      title: 'Levitating',
      durationInSeconds: 180,
      currentInSeconds: 42,
      artist: 'Dua Lipa',
      status: 'playing',
      url: 'https://tidal.com/track/123',
      image: 'https://resources.tidal.com/cover.jpg',
    });
    expect(track).toEqual({
      title: 'Levitating',
      artist: 'Dua Lipa',
      duration: 180_000,
      progress: 42_000,
      cover_url: 'https://resources.tidal.com/cover.jpg',
      is_playing: true,
      canvas_url: '',
      id: 'https://tidal.com/track/123',
      isLiveStream: false,
    });
  });

  it('falls back to `artists` when `artist` is missing', () => {
    const track = mapTidalSong({ title: 'Song', artists: 'Some Artist' });
    expect(track?.artist).toBe('Some Artist');
  });

  it('falls back to `artists` when `artist` is an empty string', () => {
    const track = mapTidalSong({
      title: 'Song',
      artist: '',
      artists: 'Fallback',
    });
    expect(track?.artist).toBe('Fallback');
  });

  it('uses an empty artist when both fields are missing', () => {
    const track = mapTidalSong({ title: 'Song' });
    expect(track?.artist).toBe('');
  });

  it('treats a missing duration/progress as 0', () => {
    const track = mapTidalSong({ title: 'Song' });
    expect(track?.duration).toBe(0);
    expect(track?.progress).toBe(0);
  });

  it('leaves cover_url empty when image is absent', () => {
    const track = mapTidalSong({ title: 'Song' });
    expect(track?.cover_url).toBe('');
  });

  it('leaves id empty when url is absent', () => {
    const track = mapTidalSong({ title: 'Song' });
    expect(track?.id).toBe('');
  });

  it.each(['playing', 'Playing', 'PLAYING', 'pLaYiNg'])(
    'sets is_playing for status %j',
    (status) => {
      expect(mapTidalSong({ title: 'Song', status })?.is_playing).toBe(true);
    },
  );

  it.each(['paused', 'stopped', 'idle', ''])(
    'clears is_playing for status %j',
    (status) => {
      expect(mapTidalSong({ title: 'Song', status })?.is_playing).toBe(false);
    },
  );

  it('returns null for a title-missing payload (empty branch)', () => {
    expect(mapTidalSong({})).toBeNull();
    expect(mapTidalSong({ title: '' })).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Poll tick                                                                   */
/* -------------------------------------------------------------------------- */

describe('fetchTidalNowPlaying', () => {
  it('sends the exact request shape and strips sentry-trace', async () => {
    const { http, calls } = createFakeHttp({
      data: { title: 'Song', status: 'playing' },
    });
    await fetchTidalNowPlaying(http);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://localhost:47836/current');
    expect(calls[0].config?.headers).toEqual({
      'Content-Type': 'application/json',
    });

    const transformRequest = calls[0].config?.transformRequest ?? [];
    expect(transformRequest).toHaveLength(1);
    const headers: Record<string, unknown> = {
      'sentry-trace': 'trace-id',
      other: 'kept',
    };
    const returned = transformRequest[0]({}, headers);
    expect(headers).not.toHaveProperty('sentry-trace');
    expect(headers.other).toBe('kept');
    expect(returned).toEqual({});
  });

  it('returns PLAYING + mapped track for a titled payload', async () => {
    const raw: TidalRawSong = {
      title: 'Song',
      durationInSeconds: 10,
      currentInSeconds: 5,
      status: 'Playing',
      url: 'id-1',
      image: 'img',
    };
    const { http } = createFakeHttp({ data: raw });
    const result = await fetchTidalNowPlaying(http);

    expect(result.playbackState).toBe(PlaybackState.PLAYING);
    expect(result.widgetState).toBe(WidgetStatus.SUCCESS);
    expect(result.raw).toBe(raw);
    expect(result.track).toEqual({
      title: 'Song',
      artist: '',
      duration: 10_000,
      progress: 5_000,
      cover_url: 'img',
      is_playing: true,
      canvas_url: '',
      id: 'id-1',
      isLiveStream: false,
    });
  });

  it('returns NOTHING_PLAYING + null track for an empty payload', async () => {
    const raw: TidalRawSong = {};
    const { http } = createFakeHttp({ data: raw });
    const result = await fetchTidalNowPlaying(http);

    expect(result.playbackState).toBe(PlaybackState.NOTHING_PLAYING);
    expect(result.widgetState).toBe(WidgetStatus.SUCCESS);
    expect(result.track).toBeNull();
    expect(result.raw).toBe(raw);
  });

  it('returns NOTHING_PLAYING on a request error', async () => {
    const error = new Error('network down');
    const { http } = createFakeHttp(error);
    const result = await fetchTidalNowPlaying(http);

    expect(result.playbackState).toBe(PlaybackState.NOTHING_PLAYING);
    expect(result.widgetState).toBe(WidgetStatus.SUCCESS);
    expect(result.track).toBeNull();
    expect(result.raw).toBeNull();
    expect(result.error).toBe(error);
  });
});

/* -------------------------------------------------------------------------- */
/* Polling loop                                                                */
/* -------------------------------------------------------------------------- */

describe('startTidalPolling', () => {
  it('ticks immediately, then every 1000ms, and stops on dispose', async () => {
    vi.useFakeTimers();
    const { http } = createFakeHttp({
      data: { title: 'Song', status: 'playing' },
    });
    const onResult = vi.fn();
    const stop = startTidalPolling({ http, onResult });

    await vi.advanceTimersByTimeAsync(0);
    expect(onResult).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(onResult).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1000);
    expect(onResult).toHaveBeenCalledTimes(3);

    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(onResult).toHaveBeenCalledTimes(3);
  });
});
