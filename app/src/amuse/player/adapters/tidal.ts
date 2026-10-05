/**
 * Tidal source adapter — ported from the original Amuse widget bundle.
 *
 * Source: `widget/assets/AmuseWidget-6oaOOCSo.js` (request at char offset
 * ~50242, poll at ~51066; beautified copy `app/_reference/AmuseWidget.js:3050+`,
 * the `ri` component). The original is a react-query `useQuery` hook
 * (`we({ queryKey: ["tidal-song"], ... })`) whose `queryFn` performs the mapping
 * below and writes into the player store:
 *
 *   g(q.SUCCESS);                                   // setWidgetState(SUCCESS)
 *   const { data: x } = await Ue.get(
 *     "http://localhost:47836/current",
 *     {
 *       headers: { "Content-Type": "application/json" },
 *       transformRequest: [(m, d) => (delete d["sentry-trace"], m)],
 *     },
 *   );
 *   if (!x.title) return (o(D.NOTHING_PLAYING), x);
 *   const m = x.durationInSeconds * 1e3,   // seconds -> milliseconds
 *         d = x.currentInSeconds  * 1e3,   // seconds -> milliseconds
 *         O = x.artist || x.artists,       // artist, falling back to artists
 *         M = x.status.toLowerCase() === "playing";
 *   ... setCurrentTrack({ id: x.url, title: x.title, artist: O, duration: m,
 *                          progress: d, is_playing: M, canvas_url: void 0 }) ...
 *   ... x.image -> cover_url (base64 via convertImgToBase64) ...
 *   return (o(D.PLAYING), x);
 *   // catch -> o(D.NOTHING_PLAYING)
 *
 *   refetchIntervalInBackground: true,
 *   refetchInterval: 1e3,
 *   enabled: true,
 *
 * This module keeps the exact URL, headers, `transformRequest`, field paths and
 * the second->millisecond conversion, but exposes them as pure, injectable
 * functions instead of a React hook so they can be unit-tested and reused by the
 * realtime/wrapper tasks without pulling react-query into the adapter. HTTP is
 * injectable via the `TidalHttpClient` parameter; the default client is a thin
 * axios wrapper and preserves the original runtime behaviour exactly.
 *
 * Documented simplifications (deviations from the original `ri` hook):
 *  - the original fetches a Spotify "canvas" (`Qe`) and base64-encodes `image`
 *    (`convertImgToBase64`) after the first track write. Both helpers are owned
 *    by other tasks, so `image` is assigned to `cover_url` verbatim (exactly as
 *    the plan's Todo 12 requires: "image -> cover_url") and `canvas_url` stays
 *    `''`.
 *  - the original's `url`-change guard and the `k()` "-" title/artist skip are
 *    not reproduced; Todo 12 only specifies the `!title` empty branch, so a
 *    missing/blank `title` is the sole "nothing playing" condition here.
 */

import axios, { type AxiosRequestConfig } from 'axios';
import { PlaybackState, WidgetStatus, type PlayerTrack } from '../store';

/* -------------------------------------------------------------------------- */
/* Constants — verbatim from the original                                      */
/* -------------------------------------------------------------------------- */

/** Original endpoint: `"http://localhost:47836/current"`. */
export const TIDAL_URL = 'http://localhost:47836/current';

/** Original `refetchInterval: 1e3`. */
export const TIDAL_POLL_INTERVAL_MS = 1000;

/** Original `headers: { "Content-Type": "application/json" }`. */
export const TIDAL_HEADERS = {
  'Content-Type': 'application/json',
} as const;

/** Original `refetchIntervalInBackground: true` / `enabled: true`. */
export const TIDAL_POLLS_IN_BACKGROUND = true;
export const TIDAL_ENABLED = true;

/* -------------------------------------------------------------------------- */
/* Request shaping — the `sentry-trace` deletion                               */
/* -------------------------------------------------------------------------- */

/**
 * Original `transformRequest: [(m, d) => (delete d["sentry-trace"], m)]`.
 *
 * Axios invokes every `transformRequest` entry as `(data, headers)` before the
 * request leaves the client; the original deletes the `sentry-trace` header
 * from the outgoing request (a tracing header the surrounding app injects) and
 * returns the untouched data. Reproduced verbatim so the outgoing request never
 * carries `sentry-trace`.
 */
export function deleteSentryTrace(
  data: unknown,
  headers: Record<string, unknown>,
): unknown {
  delete headers['sentry-trace'];
  return data;
}

export type TidalTransformRequest = (
  data: unknown,
  headers: Record<string, unknown>,
) => unknown;

/** The exact `transformRequest` array the original passes to axios. */
export const TIDAL_TRANSFORM_REQUEST: TidalTransformRequest[] = [
  deleteSentryTrace,
];

/* -------------------------------------------------------------------------- */
/* Raw payload + injectable HTTP                                               */
/* -------------------------------------------------------------------------- */

/** Shape of `GET http://localhost:47836/current` used by the original. */
export interface TidalRawSong {
  title?: string;
  durationInSeconds?: number;
  currentInSeconds?: number;
  /** Preferred artist field; falls back to `artists`. */
  artist?: string;
  /** Fallback artist field. */
  artists?: string;
  /** Playback status; `"playing"` (case-insensitive) means playing. */
  status?: string;
  /** Track identity used as `id`. */
  url?: string;
  /** Cover image -> `cover_url`. */
  image?: string;
  [key: string]: unknown;
}

export interface TidalRequestConfig {
  headers: Record<string, string>;
  transformRequest: TidalTransformRequest[];
}

export interface TidalHttpResponse<T> {
  data: T;
}

/** Minimal injectable HTTP surface (matches `axios.get`). */
export interface TidalHttpClient {
  get<T>(
    url: string,
    config?: TidalRequestConfig,
  ): Promise<TidalHttpResponse<T>>;
}

/** Default runtime client — thin axios wrapper, no behaviour change. */
export const defaultTidalHttpClient: TidalHttpClient = {
  get: <T>(url: string, config?: TidalRequestConfig) =>
    axios.get<T>(url, config as AxiosRequestConfig),
};

/* -------------------------------------------------------------------------- */
/* Mapping                                                                     */
/* -------------------------------------------------------------------------- */

/** Result of one poll tick, mapped onto the player store's enums. */
export interface TidalPollResult {
  /** Mapped track, or `null` when nothing is playing (`!title`). */
  track: PlayerTrack | null;
  playbackState: PlaybackState;
  widgetState: WidgetStatus;
  /** Raw payload for canvas/other consumers; `null` on network error. */
  raw: TidalRawSong | null;
  /** Present only when the request threw (original `catch` branch). */
  error?: unknown;
}

/**
 * Map a raw `/current` payload onto `PlayerTrack`. Returns `null` for the empty
 * branch (`!title`), exactly like the original.
 *
 * Field paths and conversions are preserved verbatim:
 *  - `duration = durationInSeconds * 1000`, `progress = currentInSeconds * 1000`;
 *  - `artist = artist || artists`;
 *  - `is_playing = status.toLowerCase() === "playing"`;
 *  - `id = url`, `cover_url = image`.
 *
 * The original writes `canvas_url: void 0` on the first write and only fills
 * `canvas_url`/`cover_url` after a separate canvas fetch; this adapter leaves
 * `canvas_url` as `''` and `isLiveStream` as `false` (the original never sets
 * `isLiveStream` for this source).
 */
export function mapTidalSong(raw: TidalRawSong): PlayerTrack | null {
  if (!raw.title) return null;
  return {
    title: raw.title,
    artist: raw.artist || raw.artists || '',
    duration: (raw.durationInSeconds ?? 0) * 1000,
    progress: (raw.currentInSeconds ?? 0) * 1000,
    cover_url: raw.image ?? '',
    is_playing: (raw.status ?? '').toLowerCase() === 'playing',
    canvas_url: '',
    id: raw.url ?? '',
    isLiveStream: false,
  };
}

/* -------------------------------------------------------------------------- */
/* Poll tick                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Perform one poll of the Tidal endpoint and map the response.
 *
 * Mirrors the original `queryFn`:
 *  - `widgetState` is always `SUCCESS` once the query runs (`g(q.SUCCESS)`);
 *  - `!title` -> `NOTHING_PLAYING` + `track: null`;
 *  - otherwise -> `PLAYING` + mapped `PlayerTrack`;
 *  - a thrown request -> `NOTHING_PLAYING` (original `catch` branch).
 */
export async function fetchTidalNowPlaying(
  http: TidalHttpClient = defaultTidalHttpClient,
): Promise<TidalPollResult> {
  try {
    const { data } = await http.get<TidalRawSong>(TIDAL_URL, {
      headers: { ...TIDAL_HEADERS },
      transformRequest: [...TIDAL_TRANSFORM_REQUEST],
    });
    const track = mapTidalSong(data);
    if (!track) {
      return {
        track: null,
        playbackState: PlaybackState.NOTHING_PLAYING,
        widgetState: WidgetStatus.SUCCESS,
        raw: data,
      };
    }
    return {
      track,
      playbackState: PlaybackState.PLAYING,
      widgetState: WidgetStatus.SUCCESS,
      raw: data,
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

export interface TidalPollingOptions {
  /** Injectable HTTP client (defaults to axios). */
  http?: TidalHttpClient;
  /** Poll interval in ms (defaults to the original 1000). */
  intervalMs?: number;
  /** Called with each mapped poll result. */
  onResult: (result: TidalPollResult) => void;
}

/**
 * Start the 1s poll loop (original `refetchInterval: 1e3`,
 * `refetchIntervalInBackground: true`, `enabled: true`). Returns a stop
 * function. The first tick fires immediately, matching react-query.
 */
export function startTidalPolling(options: TidalPollingOptions): () => void {
  const {
    http = defaultTidalHttpClient,
    intervalMs = TIDAL_POLL_INTERVAL_MS,
    onResult,
  } = options;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = async (): Promise<void> => {
    const result = await fetchTidalNowPlaying(http);
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
