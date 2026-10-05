/**
 * Apple Music (Cider) source adapter — ported from the original Amuse widget
 * bundle.
 *
 * Source: `widget/assets/AmuseWidget-6oaOOCSo.js` (beautified copy
 * `app/_reference/AmuseWidget.js:2749-2854`, the `Qs` component). The original
 * is a react-query `useQuery` hook (`we({ queryKey: ["cider-song"], ... })`)
 * whose `queryFn` performs TWO sequential GETs and writes into the player
 * store:
 *
 *   c(q.SUCCESS);                                              // setWidgetState(SUCCESS)
 *   const { data: m } = await Ue.get(
 *     "http://localhost:10767/api/v1/playback/now-playing",    // 1st
 *   );
 *   const { data: d } = await Ue.get(
 *     "http://localhost:10767/api/v1/playback/is-playing",     // 2nd, after the 1st resolves
 *   );
 *   const I = m.info;
 *   if (I.name) {
 *     ... o({ id: I.playParams.id, title: I.name, artist: I.artistName,
 *              duration: I.durationInMillis,
 *              progress: I.currentPlaybackTime * 1e3,
 *              cover_url: S(I.artwork), is_playing: d.is_playing }) ...
 *     return (g(D.PLAYING), I);
 *   } else return (g(D.NOTHING_PLAYING), I);
 *   // catch -> g(D.NOTHING_PLAYING)
 *
 *   refetchIntervalInBackground: true,
 *   refetchInterval: 1e3,
 *   enabled: true,
 *
 * This module keeps the exact URLs, the SEQUENTIAL request order and every
 * field path (`info.{name,durationInMillis,currentPlaybackTime,artwork,
 * artistName,playParams.id}` + top-level `is_playing`), but exposes them as
 * pure, injectable functions instead of a React hook so they can be unit-tested
 * and reused by the realtime/wrapper tasks without pulling react-query into the
 * adapter. HTTP is injectable via the `AppleMusicHttpClient` parameter; the
 * default client is a thin axios wrapper and preserves the original runtime
 * behaviour exactly.
 */

import axios from 'axios';
import { PlaybackState, WidgetStatus, type PlayerTrack } from '../store';

/* -------------------------------------------------------------------------- */
/* Constants — verbatim from the original                                      */
/* -------------------------------------------------------------------------- */

/** Original 1st endpoint: `"http://localhost:10767/api/v1/playback/now-playing"`. */
export const APPLE_MUSIC_NOW_PLAYING_URL =
  'http://localhost:10767/api/v1/playback/now-playing';

/** Original 2nd endpoint: `"http://localhost:10767/api/v1/playback/is-playing"`. */
export const APPLE_MUSIC_IS_PLAYING_URL =
  'http://localhost:10767/api/v1/playback/is-playing';

/** Original `refetchInterval: 1e3`. */
export const APPLE_MUSIC_POLL_INTERVAL_MS = 1000;

/** Original `refetchIntervalInBackground: true` / `enabled: true`. */
export const APPLE_MUSIC_POLLS_IN_BACKGROUND = true;
export const APPLE_MUSIC_ENABLED = true;

/* -------------------------------------------------------------------------- */
/* Raw payload + injectable HTTP                                               */
/* -------------------------------------------------------------------------- */

/**
 * Apple Music artwork object (`info.artwork`). The original reformats it via
 * `getReformattedCoverUrl` (`PlayerWindows98:351-354`): it substitutes the
 * `{w}` / `{h}` placeholders in `url` with `width` / `height`.
 */
export interface AppleMusicArtwork {
  width?: number;
  height?: number;
  url?: string;
  [key: string]: unknown;
}

/** Apple Music `info.playParams` (only `.id` is read by the original). */
export interface AppleMusicPlayParams {
  id?: string;
  [key: string]: unknown;
}

/** `GET .../now-playing` -> `.info` used by the original. */
export interface AppleMusicNowPlayingInfo {
  name?: string;
  durationInMillis?: number;
  currentPlaybackTime?: number;
  artwork?: AppleMusicArtwork;
  artistName?: string;
  playParams?: AppleMusicPlayParams;
  [key: string]: unknown;
}

export interface AppleMusicNowPlayingResponse {
  info?: AppleMusicNowPlayingInfo;
  [key: string]: unknown;
}

/** `GET .../is-playing` -> top-level `.is_playing`. */
export interface AppleMusicIsPlayingResponse {
  is_playing?: boolean;
  [key: string]: unknown;
}

export interface AppleMusicHttpResponse<T> {
  data: T;
}

/** Minimal injectable HTTP surface (matches `axios.get`). */
export interface AppleMusicHttpClient {
  get<T>(url: string): Promise<AppleMusicHttpResponse<T>>;
}

/** Default runtime client — thin axios wrapper, no behaviour change. */
export const defaultAppleMusicHttpClient: AppleMusicHttpClient = {
  get: <T>(url: string) => axios.get<T>(url),
};

/* -------------------------------------------------------------------------- */
/* Mapping                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Original `getReformattedCoverUrl` (`PlayerWindows98:351-354`):
 *
 *   function u(p) { const { width: g, height: v, url: m } = p;
 *     return m.replace("{w}", g.toString()).replace("{h}", v.toString()); }
 *
 * Reproduced verbatim. A missing/invalid artwork object throws, exactly like
 * the original (the throw is caught by `fetchAppleMusicNowPlaying` and maps to
 * NOTHING_PLAYING).
 */
export function reformatCoverUrl(artwork: AppleMusicArtwork): string {
  const url = artwork.url as string;
  return url
    .replace('{w}', String(artwork.width))
    .replace('{h}', String(artwork.height));
}

/**
 * Map a raw `now-playing` info payload onto `PlayerTrack`. Returns `null` for
 * the empty branch (`!info.name`), exactly like the original.
 *
 * The original only writes `canvas_url` after a separate canvas fetch (not part
 * of this adapter); it is left as `''` here and `isLiveStream` defaults to
 * `false` (the original never sets it for this source).
 */
export function mapAppleMusicTrack(
  info: AppleMusicNowPlayingInfo,
  isPlaying: boolean,
): PlayerTrack | null {
  if (!info.name) return null;
  return {
    title: info.name,
    artist: info.artistName ?? '',
    duration: info.durationInMillis ?? 0,
    progress: (info.currentPlaybackTime ?? 0) * 1e3,
    cover_url: reformatCoverUrl(info.artwork as AppleMusicArtwork),
    is_playing: Boolean(isPlaying),
    canvas_url: '',
    id: info.playParams?.id ?? '',
    isLiveStream: false,
  };
}

/* -------------------------------------------------------------------------- */
/* Poll tick                                                                   */
/* -------------------------------------------------------------------------- */

/** Result of one poll tick, mapped onto the player store's enums. */
export interface AppleMusicPollResult {
  /** Mapped track, or `null` when nothing is playing (`!info.name`). */
  track: PlayerTrack | null;
  playbackState: PlaybackState;
  widgetState: WidgetStatus;
  /** Raw `info` for canvas/other consumers; `null` on network error. */
  raw: AppleMusicNowPlayingInfo | null;
  /** Present only when the request threw (original `catch` branch). */
  error?: unknown;
}

/**
 * Perform one poll of the Apple Music (Cider) endpoints and map the response.
 *
 * Mirrors the original `queryFn`:
 *  - `widgetState` is always `SUCCESS` once the query runs (`c(q.SUCCESS)`);
 *  - the two GETs are SEQUENTIAL: `now-playing` first, then `is-playing`;
 *  - `!info.name` -> `NOTHING_PLAYING` + `track: null`;
 *  - otherwise -> `PLAYING` + mapped `PlayerTrack` (with `is_playing` from the
 *    second response);
 *  - a thrown request -> `NOTHING_PLAYING` (original `catch` branch).
 */
export async function fetchAppleMusicNowPlaying(
  http: AppleMusicHttpClient = defaultAppleMusicHttpClient,
): Promise<AppleMusicPollResult> {
  try {
    const { data: nowPlaying } = await http.get<AppleMusicNowPlayingResponse>(
      APPLE_MUSIC_NOW_PLAYING_URL,
    );
    const { data: isPlayingResponse } =
      await http.get<AppleMusicIsPlayingResponse>(APPLE_MUSIC_IS_PLAYING_URL);
    const info = nowPlaying.info;
    if (!info?.name) {
      return {
        track: null,
        playbackState: PlaybackState.NOTHING_PLAYING,
        widgetState: WidgetStatus.SUCCESS,
        raw: info ?? null,
      };
    }
    const track = mapAppleMusicTrack(
      info,
      Boolean(isPlayingResponse.is_playing),
    );
    return {
      track,
      playbackState: PlaybackState.PLAYING,
      widgetState: WidgetStatus.SUCCESS,
      raw: info,
    };
  } catch (error) {
    return {
      track: null,
      playbackState: PlaybackState.NOTHING_PLAYING,
      widgetState: WidgetStatus.SUCCESS,
      raw: null,
      error,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Polling loop — original `refetchInterval: 1e3`                              */
/* -------------------------------------------------------------------------- */

export interface AppleMusicPollingOptions {
  /** Injectable HTTP client (defaults to axios). */
  http?: AppleMusicHttpClient;
  /** Poll interval in ms (defaults to the original 1000). */
  intervalMs?: number;
  /** Called with each mapped poll result. */
  onResult: (result: AppleMusicPollResult) => void;
}

/**
 * Start the 1s poll loop (original `refetchInterval: 1e3`,
 * `refetchIntervalInBackground: true`, `enabled: true`). Returns a stop
 * function. The first tick fires immediately, matching react-query.
 */
export function startAppleMusicPolling(
  options: AppleMusicPollingOptions,
): () => void {
  const {
    http = defaultAppleMusicHttpClient,
    intervalMs = APPLE_MUSIC_POLL_INTERVAL_MS,
    onResult,
  } = options;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = async (): Promise<void> => {
    const result = await fetchAppleMusicNowPlaying(http);
    if (stopped) return;
    onResult(result);
    timer = setTimeout(() => void tick(), intervalMs);
  };

  void tick();

  return () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
  };
}
