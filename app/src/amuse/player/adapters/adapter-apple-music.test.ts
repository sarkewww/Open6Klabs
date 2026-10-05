import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlaybackState, WidgetStatus } from '../store';
import {
  APPLE_MUSIC_ENABLED,
  APPLE_MUSIC_IS_PLAYING_URL,
  APPLE_MUSIC_NOW_PLAYING_URL,
  APPLE_MUSIC_POLL_INTERVAL_MS,
  APPLE_MUSIC_POLLS_IN_BACKGROUND,
  fetchAppleMusicNowPlaying,
  mapAppleMusicTrack,
  reformatCoverUrl,
  startAppleMusicPolling,
  type AppleMusicHttpClient,
  type AppleMusicHttpResponse,
  type AppleMusicNowPlayingInfo,
} from './apple-music';

/* -------------------------------------------------------------------------- */
/* Test doubles                                                                */
/* -------------------------------------------------------------------------- */

/** Route GETs by URL and record the request order. */
function createRoutingHttp(
  responses: Record<string, unknown>,
  calls: string[],
): AppleMusicHttpClient {
  return {
    async get<T>(url: string): Promise<AppleMusicHttpResponse<T>> {
      calls.push(url);
      return { data: responses[url] as T };
    },
  };
}

function createThrowingHttp(
  error: unknown,
  url?: string,
): AppleMusicHttpClient {
  return {
    async get<T>(requestUrl: string): Promise<AppleMusicHttpResponse<T>> {
      if (url !== undefined && requestUrl !== url) {
        return { data: {} as T };
      }
      throw error;
    },
  };
}

const NOW_PLAYING = {
  info: {
    name: 'Never Gonna Give You Up',
    durationInMillis: 213000,
    currentPlaybackTime: 42,
    artwork: {
      width: 1000,
      height: 1000,
      url: 'https://is1-ssl.mzstatic.com/image/thumb/{w}x{h}bb.jpg',
    },
    artistName: 'Rick Astley',
    playParams: { id: '1440833098' },
  },
};

const IS_PLAYING = { is_playing: true };

/** Both endpoints, ready for `createRoutingHttp`. */
function fullResponses(): Record<string, unknown> {
  return {
    [APPLE_MUSIC_NOW_PLAYING_URL]: NOW_PLAYING,
    [APPLE_MUSIC_IS_PLAYING_URL]: IS_PLAYING,
  };
}

const FULL_TRACK = {
  title: 'Never Gonna Give You Up',
  artist: 'Rick Astley',
  duration: 213000,
  progress: 42000,
  cover_url: 'https://is1-ssl.mzstatic.com/image/thumb/1000x1000bb.jpg',
  is_playing: true,
  canvas_url: '',
  id: '1440833098',
  isLiveStream: false,
};

/* -------------------------------------------------------------------------- */
/* Constants — exact URLs / interval / flags                                   */
/* -------------------------------------------------------------------------- */

describe('adapter-apple constants', () => {
  it('uses the exact original endpoints', () => {
    expect(APPLE_MUSIC_NOW_PLAYING_URL).toBe(
      'http://localhost:10767/api/v1/playback/now-playing',
    );
    expect(APPLE_MUSIC_IS_PLAYING_URL).toBe(
      'http://localhost:10767/api/v1/playback/is-playing',
    );
  });

  it('polls every 1000ms in the background', () => {
    expect(APPLE_MUSIC_POLL_INTERVAL_MS).toBe(1000);
    expect(APPLE_MUSIC_POLLS_IN_BACKGROUND).toBe(true);
    expect(APPLE_MUSIC_ENABLED).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Sequential request order — now-playing THEN is-playing                      */
/* -------------------------------------------------------------------------- */

describe('adapter-apple sequential requests', () => {
  it('requests now-playing before is-playing', async () => {
    const calls: string[] = [];
    let releaseNowPlaying!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseNowPlaying = resolve;
    });
    const http: AppleMusicHttpClient = {
      async get<T>(url: string): Promise<AppleMusicHttpResponse<T>> {
        calls.push(url);
        if (url === APPLE_MUSIC_NOW_PLAYING_URL) {
          await gate;
          return { data: NOW_PLAYING as T };
        }
        return { data: IS_PLAYING as T };
      },
    };

    const pending = fetchAppleMusicNowPlaying(http);

    // The first GET is issued synchronously; the second must NOT start until
    // the first resolves.
    expect(calls).toEqual([APPLE_MUSIC_NOW_PLAYING_URL]);

    releaseNowPlaying();
    await pending;

    expect(calls).toEqual([
      APPLE_MUSIC_NOW_PLAYING_URL,
      APPLE_MUSIC_IS_PLAYING_URL,
    ]);
  });

  it('issues both GETs even for an empty payload (order preserved)', async () => {
    const calls: string[] = [];
    const responses = {
      [APPLE_MUSIC_NOW_PLAYING_URL]: { info: {} },
      [APPLE_MUSIC_IS_PLAYING_URL]: { is_playing: false },
    };
    const http = createRoutingHttp(responses, calls);

    await fetchAppleMusicNowPlaying(http);

    expect(calls).toEqual([
      APPLE_MUSIC_NOW_PLAYING_URL,
      APPLE_MUSIC_IS_PLAYING_URL,
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* Mapping — happy path                                                        */
/* -------------------------------------------------------------------------- */

describe('adapter-apple mapping', () => {
  it('maps a full payload onto PlayerTrack + PLAYING + SUCCESS', async () => {
    const calls: string[] = [];
    const http = createRoutingHttp(fullResponses(), calls);

    const result = await fetchAppleMusicNowPlaying(http);

    expect(result.playbackState).toBe(PlaybackState.PLAYING);
    expect(result.widgetState).toBe(WidgetStatus.SUCCESS);
    expect(result.track).toEqual(FULL_TRACK);
    expect(result.raw).toBe(NOW_PLAYING.info);
  });

  it('reformats the artwork url by substituting {w}/{h}', () => {
    expect(
      reformatCoverUrl({
        width: 600,
        height: 600,
        url: 'https://example.test/{w}x{h}bb.jpg',
      }),
    ).toBe('https://example.test/600x600bb.jpg');
  });

  it('converts currentPlaybackTime seconds to milliseconds', async () => {
    const calls: string[] = [];
    const http = createRoutingHttp(
      {
        ...fullResponses(),
        [APPLE_MUSIC_NOW_PLAYING_URL]: {
          info: { ...NOW_PLAYING.info, currentPlaybackTime: 3 },
        },
      },
      calls,
    );

    const result = await fetchAppleMusicNowPlaying(http);

    expect(result.track?.progress).toBe(3000);
  });

  it('reads is_playing from the SECOND response', async () => {
    const calls: string[] = [];
    const http = createRoutingHttp(
      {
        ...fullResponses(),
        [APPLE_MUSIC_IS_PLAYING_URL]: { is_playing: false },
      },
      calls,
    );

    const result = await fetchAppleMusicNowPlaying(http);

    expect(result.playbackState).toBe(PlaybackState.PLAYING);
    expect(result.track?.is_playing).toBe(false);
  });

  it('mapAppleMusicTrack returns null without a name', () => {
    expect(mapAppleMusicTrack({ artistName: 'A' }, true)).toBeNull();
    expect(mapAppleMusicTrack({}, false)).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Empty branch — !info.name -> NOTHING_PLAYING                                */
/* -------------------------------------------------------------------------- */

describe('adapter-apple empty branch', () => {
  it('maps an empty info object to NOTHING_PLAYING with a null track', async () => {
    const calls: string[] = [];
    const http = createRoutingHttp(
      {
        [APPLE_MUSIC_NOW_PLAYING_URL]: { info: {} },
        [APPLE_MUSIC_IS_PLAYING_URL]: { is_playing: false },
      },
      calls,
    );

    const result = await fetchAppleMusicNowPlaying(http);

    expect(result.track).toBeNull();
    expect(result.playbackState).toBe(PlaybackState.NOTHING_PLAYING);
    expect(result.widgetState).toBe(WidgetStatus.SUCCESS);
  });

  it('treats a payload with no info at all as nothing playing', async () => {
    const calls: string[] = [];
    const http = createRoutingHttp(
      {
        [APPLE_MUSIC_NOW_PLAYING_URL]: {},
        [APPLE_MUSIC_IS_PLAYING_URL]: { is_playing: true },
      },
      calls,
    );

    const result = await fetchAppleMusicNowPlaying(http);

    expect(result.track).toBeNull();
    expect(result.playbackState).toBe(PlaybackState.NOTHING_PLAYING);
    expect(result.raw).toBeNull();
  });

  it('treats info with other fields but no name as nothing playing', async () => {
    const calls: string[] = [];
    const http = createRoutingHttp(
      {
        [APPLE_MUSIC_NOW_PLAYING_URL]: {
          info: {
            durationInMillis: 1000,
            artistName: 'A',
            playParams: { id: 'x' },
          } satisfies AppleMusicNowPlayingInfo,
        },
        [APPLE_MUSIC_IS_PLAYING_URL]: { is_playing: true },
      },
      calls,
    );

    const result = await fetchAppleMusicNowPlaying(http);

    expect(result.track).toBeNull();
    expect(result.playbackState).toBe(PlaybackState.NOTHING_PLAYING);
  });
});

/* -------------------------------------------------------------------------- */
/* Error branch — request throws -> NOTHING_PLAYING                            */
/* -------------------------------------------------------------------------- */

describe('adapter-apple error branch', () => {
  it('maps a thrown now-playing request to NOTHING_PLAYING', async () => {
    const boom = new Error('connection refused');
    const http = createThrowingHttp(boom, APPLE_MUSIC_NOW_PLAYING_URL);

    const result = await fetchAppleMusicNowPlaying(http);

    expect(result.track).toBeNull();
    expect(result.playbackState).toBe(PlaybackState.NOTHING_PLAYING);
    expect(result.widgetState).toBe(WidgetStatus.SUCCESS);
    expect(result.raw).toBeNull();
    expect(result.error).toBe(boom);
  });

  it('maps a thrown is-playing request to NOTHING_PLAYING', async () => {
    const boom = new Error('is-playing 500');
    const http = createThrowingHttp(boom, APPLE_MUSIC_IS_PLAYING_URL);

    const result = await fetchAppleMusicNowPlaying(http);

    expect(result.track).toBeNull();
    expect(result.playbackState).toBe(PlaybackState.NOTHING_PLAYING);
    expect(result.error).toBe(boom);
  });
});

/* -------------------------------------------------------------------------- */
/* Polling loop — 1s interval                                                  */
/* -------------------------------------------------------------------------- */

describe('adapter-apple polling', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls immediately and again every 1000ms until stopped', async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const http = createRoutingHttp(fullResponses(), calls);
    const results: unknown[] = [];

    const stop = startAppleMusicPolling({
      http,
      onResult: (result) => results.push(result),
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(4);

    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(6);

    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toHaveLength(6);
    expect(results).toHaveLength(3);
  });
});
