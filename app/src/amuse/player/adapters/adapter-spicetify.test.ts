import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlaybackState, WidgetStatus } from '../store';
import {
  SPICETIFY_ENABLED,
  SPICETIFY_HEADERS,
  SPICETIFY_POLL_INTERVAL_MS,
  SPICETIFY_POLLS_IN_BACKGROUND,
  SPICETIFY_TRANSFORM_REQUEST,
  SPICETIFY_URL,
  deleteSentryTrace,
  fetchSpicetifyNowPlaying,
  mapSpicetifySong,
  startSpicetifyPolling,
  type SpicetifyHttpClient,
  type SpicetifyHttpResponse,
  type SpicetifyRawSong,
  type SpicetifyRequestConfig,
} from './spicetify';

/* -------------------------------------------------------------------------- */
/* Test doubles                                                                */
/* -------------------------------------------------------------------------- */

interface RecordedCall {
  url: string;
  config?: SpicetifyRequestConfig;
}

function createRecordingHttp(
  payload: SpicetifyRawSong,
  calls: RecordedCall[],
): SpicetifyHttpClient {
  return {
    async get<T>(
      url: string,
      config?: SpicetifyRequestConfig,
    ): Promise<SpicetifyHttpResponse<T>> {
      calls.push({ url, config });
      return { data: payload as T };
    },
  };
}

function createThrowingHttp(error: unknown): SpicetifyHttpClient {
  return {
    async get<T>(): Promise<SpicetifyHttpResponse<T>> {
      throw error;
    },
  };
}

/** Apply a recorded request's `transformRequest` to a seeded header bag. */
function applyTransformRequest(
  config: SpicetifyRequestConfig,
  seeded: Record<string, unknown>,
): Record<string, unknown> {
  const headers: Record<string, unknown> = { ...seeded };
  for (const transform of config.transformRequest) {
    transform({}, headers);
  }
  return headers;
}

const FULL_PAYLOAD: SpicetifyRawSong = {
  title: 'Never Gonna Give You Up',
  artist: 'Rick Astley',
  duration: 213000,
  progress: 42000,
  cover_url: 'https://i.scdn.co/image/cover',
  is_playing: true,
  id: 'spotify:track:4cOdK2wGLETKBW3PvgPWqT',
};

/* -------------------------------------------------------------------------- */
/* Constants — exact URL / interval / headers / flags                          */
/* -------------------------------------------------------------------------- */

describe('adapter-spicetify constants', () => {
  it('uses the exact original endpoint', () => {
    expect(SPICETIFY_URL).toBe('http://localhost:7271/spicetify');
  });

  it('polls every 1000ms in the background', () => {
    expect(SPICETIFY_POLL_INTERVAL_MS).toBe(1000);
    expect(SPICETIFY_POLLS_IN_BACKGROUND).toBe(true);
    expect(SPICETIFY_ENABLED).toBe(true);
  });

  it('sends Content-Type: application/json', () => {
    expect(SPICETIFY_HEADERS).toEqual({
      'Content-Type': 'application/json',
    });
  });
});

/* -------------------------------------------------------------------------- */
/* sentry-trace deletion — REQUIRED assertion                                  */
/* -------------------------------------------------------------------------- */

describe('adapter-spicetify sentry-trace transformRequest', () => {
  it('deleteSentryTrace removes the header and returns the data untouched', () => {
    const data = { hello: 'world' };
    const headers: Record<string, unknown> = {
      'sentry-trace': 'abc123-def456',
      'Content-Type': 'application/json',
    };

    const returned = deleteSentryTrace(data, headers);

    expect(returned).toBe(data);
    expect('sentry-trace' in headers).toBe(false);
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('ships deleteSentryTrace inside the request transformRequest array', () => {
    expect(SPICETIFY_TRANSFORM_REQUEST).toContain(deleteSentryTrace);
  });

  it('the outgoing request carries no sentry-trace header', async () => {
    const calls: RecordedCall[] = [];
    const http = createRecordingHttp(FULL_PAYLOAD, calls);

    await fetchSpicetifyNowPlaying(http);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(SPICETIFY_URL);
    expect(calls[0].config?.headers).toEqual({
      'Content-Type': 'application/json',
    });

    const config = calls[0].config;
    expect(config).toBeDefined();
    expect(config?.transformRequest).toContain(deleteSentryTrace);

    // Simulate axios running the transformRequest chain against a request that
    // the surrounding app seeded with a tracing header.
    const outgoing = applyTransformRequest(config as SpicetifyRequestConfig, {
      'sentry-trace': 'seeded-trace-id',
      ...config?.headers,
    });

    expect('sentry-trace' in outgoing).toBe(false);
    expect(outgoing['Content-Type']).toBe('application/json');
  });
});

/* -------------------------------------------------------------------------- */
/* Mapping — happy path                                                        */
/* -------------------------------------------------------------------------- */

describe('adapter-spicetify mapping', () => {
  it('maps a full payload onto PlayerTrack + PLAYING + SUCCESS', async () => {
    const calls: RecordedCall[] = [];
    const http = createRecordingHttp(FULL_PAYLOAD, calls);

    const result = await fetchSpicetifyNowPlaying(http);

    expect(result.playbackState).toBe(PlaybackState.PLAYING);
    expect(result.widgetState).toBe(WidgetStatus.SUCCESS);
    expect(result.track).toEqual({
      title: 'Never Gonna Give You Up',
      artist: 'Rick Astley',
      duration: 213000,
      progress: 42000,
      cover_url: 'https://i.scdn.co/image/cover',
      is_playing: true,
      canvas_url: '',
      id: 'spotify:track:4cOdK2wGLETKBW3PvgPWqT',
      isLiveStream: false,
    });
    expect(result.raw).toBe(FULL_PAYLOAD);
  });

  it('coerces is_playing and defaults missing optional fields', () => {
    const track = mapSpicetifySong({ title: 'Only a title' });
    expect(track).toEqual({
      title: 'Only a title',
      artist: '',
      duration: 0,
      progress: 0,
      cover_url: '',
      is_playing: false,
      canvas_url: '',
      id: '',
      isLiveStream: false,
    });
  });

  it('treats a paused track as PLAYING playback state with is_playing=false', async () => {
    const calls: RecordedCall[] = [];
    const http = createRecordingHttp(
      { ...FULL_PAYLOAD, is_playing: false },
      calls,
    );

    const result = await fetchSpicetifyNowPlaying(http);

    expect(result.playbackState).toBe(PlaybackState.PLAYING);
    expect(result.track?.is_playing).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Empty branch — !title -> NOTHING_PLAYING                                    */
/* -------------------------------------------------------------------------- */

describe('adapter-spicetify empty branch', () => {
  it('maps an empty payload to NOTHING_PLAYING with a null track', async () => {
    const calls: RecordedCall[] = [];
    const http = createRecordingHttp({}, calls);

    const result = await fetchSpicetifyNowPlaying(http);

    expect(result.track).toBeNull();
    expect(result.playbackState).toBe(PlaybackState.NOTHING_PLAYING);
    expect(result.widgetState).toBe(WidgetStatus.SUCCESS);
  });

  it('treats a payload with no title (but other fields) as nothing playing', async () => {
    const calls: RecordedCall[] = [];
    const http = createRecordingHttp(
      { id: 'spotify:track:x', artist: 'A', duration: 1000 },
      calls,
    );

    const result = await fetchSpicetifyNowPlaying(http);

    expect(result.track).toBeNull();
    expect(result.playbackState).toBe(PlaybackState.NOTHING_PLAYING);
    expect(mapSpicetifySong({ id: 'spotify:track:x' })).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Error branch — request throws -> NOTHING_PLAYING                            */
/* -------------------------------------------------------------------------- */

describe('adapter-spicetify error branch', () => {
  it('maps a thrown request to NOTHING_PLAYING and keeps the error', async () => {
    const boom = new Error('connection refused');
    const http = createThrowingHttp(boom);

    const result = await fetchSpicetifyNowPlaying(http);

    expect(result.track).toBeNull();
    expect(result.playbackState).toBe(PlaybackState.NOTHING_PLAYING);
    expect(result.widgetState).toBe(WidgetStatus.SUCCESS);
    expect(result.raw).toBeNull();
    expect(result.error).toBe(boom);
  });
});

/* -------------------------------------------------------------------------- */
/* Polling loop — 1s interval                                                  */
/* -------------------------------------------------------------------------- */

describe('adapter-spicetify polling', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls immediately and again every 1000ms until stopped', async () => {
    vi.useFakeTimers();
    const calls: RecordedCall[] = [];
    const http = createRecordingHttp(FULL_PAYLOAD, calls);
    const results: unknown[] = [];

    const stop = startSpicetifyPolling({
      http,
      onResult: (result) => results.push(result),
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(3);

    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toHaveLength(3);
    expect(results).toHaveLength(3);
  });
});
