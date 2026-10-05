/**
 * Spicetify source adapter — ported from the original Amuse widget bundle.
 *
 * Source: `widget/assets/AmuseWidget-6oaOOCSo.js` (beautified copy
 * `app/_reference/AmuseWidget.js:2896-2951`, the `Zs` component). The original
 * is a react-query `useQuery` hook (`we({ queryKey: ["spicetify-song"], ... })`)
 * whose `queryFn` performs the mapping below and writes into the player store:
 *
 *   g(q.SUCCESS);                                   // setWidgetState(SUCCESS)
 *   const { data: p } = await Ue.get(
 *     "http://localhost:7271/spicetify",
 *     {
 *       headers: { "Content-Type": "application/json" },
 *       transformRequest: [(P, x) => (delete x["sentry-trace"], P)],
 *     },
 *   );
 *   if (!p.title) return (o(D.NOTHING_PLAYING), p);
 *   ... setCurrentTrack({ id, title, artist, duration, progress, cover_url, is_playing }) ...
 *   return (o(D.PLAYING), p);
 *   // catch -> o(D.NOTHING_PLAYING)
 *
 *   refetchIntervalInBackground: true,
 *   refetchInterval: 1e3,
 *   enabled: true,
 *
 * This module keeps the exact URL, headers, `transformRequest` and field
 * mapping, but exposes them as pure, injectable functions instead of a React
 * hook so they can be unit-tested and reused by the realtime/wrapper tasks
 * without pulling react-query into the adapter. HTTP is injectable via the
 * `SpicetifyHttpClient` parameter; the default client is a thin axios wrapper
 * and preserves the original runtime behaviour exactly.
 *
 * Documented simplifications (deviations from the original `Zs` hook):
 *  - the original keeps a `lastId` ref (`h.current`): an unchanged id re-writes
 *    the track without a canvas lookup, while a changed id skips the write
 *    entirely when `!artist || duration === 0` (returning before `PLAYING`).
 *    Those guards only gate the (out-of-scope) Spotify canvas lookup; this
 *    adapter performs no canvas fetch, so it always writes the mapped track and
 *    sets `PLAYING`. The `!title` empty branch is reproduced verbatim.
 */

import axios, { type AxiosRequestConfig } from 'axios';
import { PlaybackState, WidgetStatus, type PlayerTrack } from '../store';

/* -------------------------------------------------------------------------- */
/* Constants — verbatim from the original                                      */
/* -------------------------------------------------------------------------- */

/** Original endpoint: `"http://localhost:7271/spicetify"`. */
export const SPICETIFY_URL = 'http://localhost:7271/spicetify';

/** Original `refetchInterval: 1e3`. */
export const SPICETIFY_POLL_INTERVAL_MS = 1000;

/** Original `headers: { "Content-Type": "application/json" }`. */
export const SPICETIFY_HEADERS = {
  'Content-Type': 'application/json',
} as const;

/** Original `refetchIntervalInBackground: true` / `enabled: true`. */
export const SPICETIFY_POLLS_IN_BACKGROUND = true;
export const SPICETIFY_ENABLED = true;

/* -------------------------------------------------------------------------- */
/* Request shaping — the `sentry-trace` deletion                               */
/* -------------------------------------------------------------------------- */

/**
 * Original `transformRequest: [(P, x) => (delete x["sentry-trace"], P)]`.
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

export type SpicetifyTransformRequest = (
  data: unknown,
  headers: Record<string, unknown>,
) => unknown;

/** The exact `transformRequest` array the original passes to axios. */
export const SPICETIFY_TRANSFORM_REQUEST: SpicetifyTransformRequest[] = [
  deleteSentryTrace,
];

/* -------------------------------------------------------------------------- */
/* Raw payload + injectable HTTP                                               */
/* -------------------------------------------------------------------------- */

/** Shape of `GET http://localhost:7271/spicetify` used by the original. */
export interface SpicetifyRawSong {
  title?: string;
  artist?: string;
  duration?: number;
  progress?: number;
  cover_url?: string;
  is_playing?: boolean;
  id?: string;
  [key: string]: unknown;
}

export interface SpicetifyRequestConfig {
  headers: Record<string, string>;
  transformRequest: SpicetifyTransformRequest[];
}

export interface SpicetifyHttpResponse<T> {
  data: T;
}

/** Minimal injectable HTTP surface (matches `axios.get`). */
export interface SpicetifyHttpClient {
  get<T>(
    url: string,
    config?: SpicetifyRequestConfig,
  ): Promise<SpicetifyHttpResponse<T>>;
}

/** Default runtime client — thin axios wrapper, no behaviour change. */
export const defaultSpicetifyHttpClient: SpicetifyHttpClient = {
  get: <T>(url: string, config?: SpicetifyRequestConfig) =>
    axios.get<T>(url, config as AxiosRequestConfig),
};

/* -------------------------------------------------------------------------- */
/* Mapping                                                                     */
/* -------------------------------------------------------------------------- */

/** Result of one poll tick, mapped onto the player store's enums. */
export interface SpicetifyPollResult {
  /** Mapped track, or `null` when nothing is playing (`!title`). */
  track: PlayerTrack | null;
  playbackState: PlaybackState;
  widgetState: WidgetStatus;
  /** Raw payload for canvas/other consumers; `null` on network error. */
  raw: SpicetifyRawSong | null;
  /** Present only when the request threw (original `catch` branch). */
  error?: unknown;
}

/**
 * Map a raw `/spicetify` payload onto `PlayerTrack`. Returns `null` for the
 * empty branch (`!title`), exactly like the original.
 *
 * The original only writes `canvas_url` after a separate canvas fetch (not part
 * of this adapter); it is left as `''` here and `isLiveStream` defaults to
 * `false` (the original never sets it for this source).
 */
export function mapSpicetifySong(raw: SpicetifyRawSong): PlayerTrack | null {
  if (!raw.title) return null;
  return {
    title: raw.title,
    artist: raw.artist ?? '',
    duration: raw.duration ?? 0,
    progress: raw.progress ?? 0,
    cover_url: raw.cover_url ?? '',
    is_playing: Boolean(raw.is_playing),
    canvas_url: '',
    id: raw.id ?? '',
    isLiveStream: false,
  };
}

/* -------------------------------------------------------------------------- */
/* Poll tick                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Perform one poll of the Spicetify endpoint and map the response.
 *
 * Mirrors the original `queryFn`:
 *  - `widgetState` is always `SUCCESS` once the query runs (`g(q.SUCCESS)`);
 *  - `!title` -> `NOTHING_PLAYING` + `track: null`;
 *  - otherwise -> `PLAYING` + mapped `PlayerTrack`;
 *  - a thrown request -> `NOTHING_PLAYING` (original `catch` branch).
 */
export async function fetchSpicetifyNowPlaying(
  http: SpicetifyHttpClient = defaultSpicetifyHttpClient,
): Promise<SpicetifyPollResult> {
  try {
    const { data } = await http.get<SpicetifyRawSong>(SPICETIFY_URL, {
      headers: { ...SPICETIFY_HEADERS },
      transformRequest: [...SPICETIFY_TRANSFORM_REQUEST],
    });
    const track = mapSpicetifySong(data);
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

export interface SpicetifyPollingOptions {
  /** Injectable HTTP client (defaults to axios). */
  http?: SpicetifyHttpClient;
  /** Poll interval in ms (defaults to the original 1000). */
  intervalMs?: number;
  /** Called with each mapped poll result. */
  onResult: (result: SpicetifyPollResult) => void;
}

/**
 * Start the 1s poll loop (original `refetchInterval: 1e3`,
 * `refetchIntervalInBackground: true`, `enabled: true`). Returns a stop
 * function. The first tick fires immediately, matching react-query.
 */
export function startSpicetifyPolling(
  options: SpicetifyPollingOptions,
): () => void {
  const {
    http = defaultSpicetifyHttpClient,
    intervalMs = SPICETIFY_POLL_INTERVAL_MS,
    onResult,
  } = options;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = async (): Promise<void> => {
    const result = await fetchSpicetifyNowPlaying(http);
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
