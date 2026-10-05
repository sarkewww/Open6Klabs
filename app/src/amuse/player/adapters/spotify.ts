/**
 * Spotify source adapter — ported from the original Amuse widget bundle.
 *
 * Two original sources are merged here, because the Spotify source is the only
 * one split across a shared axios factory and the widget hook:
 *
 *  1. Token query — `app/_reference/useAxios-Rfx7aUEI.js:9-16` (minified
 *     `widget/assets/useAxios-Rfx7aUEI.js` @956):
 *
 *       const { widget_token: s } = ...;
 *       const r = useQuery({
 *         queryKey: ["spotify-access-token", s],
 *         queryFn: async () => {
 *           const e = await fetch("/api/widget/spotify/token", {
 *             headers: { Authorization: `Bearer ${s}`, "Content-Type": "application/json" },
 *           });
 *           const t = await e.json().catch(() => null);
 *           if (!e.ok) {
 *             const o = new Error(t?.error || "Failed to get Spotify token");
 *             throw (o.status = e.status, o.code = t?.code,
 *                    o.needsReconnect = !!t?.needsReconnect, o);
 *           }
 *           return t;
 *         },
 *         enabled: !!s,
 *         refetchInterval: 33e5,          // 3,300,000 ms
 *         retry: 2,
 *         retryDelay: (e) => Math.min(1e3 * 2 ** e, 3e4),
 *         refetchOnWindowFocus: false,
 *       });
 *       // `withSpotifyToken` request interceptor:
 *       p.interceptors.request.use((e) => (e.headers.Authorization = `Bearer ${r.data}`, e));
 *
 *  2. Currently-playing poll — `app/_reference/AmuseWidget.js:650-815`
 *     (minified `widget/assets/AmuseWidget-6oaOOCSo.js` @13104 request,
 *     @15002 poll, @15400 mapping):
 *
 *       const { data: R, status: $ } = await withSpotifyToken.get(
 *         "https://api.spotify.com/v1/me/player/currently-playing?additional_types=episode",
 *       );
 *       if ($ === 200 && R.item) { b(D.PLAYING); S(q.SUCCESS); return R; }
 *       if ($ === 204)           { b(D.NOTHING_PLAYING); S(q.SUCCESS); return null; }
 *       // useQuery({ queryKey:["spotify-current-song"], refetchInterval: l,
 *       //            refetchIntervalInBackground: !0, retry: !1 });
 *
 *     The `useEffect` on the poll result maps `item` onto the store
 *     (`AmuseWidget.js:905-963`):
 *
 *       const { item: R, currently_playing_type: $, is_playing: ie, progress_ms: he } = V.data;
 *       x(R); _(R);                       // x = raw-item state, _ = setRawSpotifyItem
 *       const N = { id: R.id, title: R.name, is_playing: ie, canvas_url: p,
 *                   progress: he, duration: R.duration_ms };
 *       switch ($) {
 *         case "track":
 *           R && !R.is_local
 *             ? c({ ...N, artist: R.artists[0].name || "Unknown Artist",
 *                   cover_url: R.album.images[0]?.url || Ee })
 *             : c({ ...N, artist: R.artists[0].name || "No Artist", cover_url: Ee });
 *           break;
 *         case "episode":
 *           c({ ...N, artist: R.show.name || "Unknown Show",
 *               cover_url: R.images[0]?.url || Ee });
 *           break;
 *         case "ad":
 *           c({ title: "Ad Break", artist: "Music will resume shortly",
 *               cover_url: Tt, progress: 0, duration: 0, is_playing: !0 });
 *           break;
 *         default:
 *           c({ title: "-", artist: "-", cover_url: Ee, progress: 0,
 *               duration: 0, is_playing: !1 });
 *       }
 *
 *     Error branches (`xe`, `AmuseWidget.js:709-815`):
 *       401 -> silent token recovery (`ce`): force-refresh the token and retry
 *              the poll; `TOKEN_EXPIRED` / `SPOTIFY_TOKEN_EXPIRED` are only
 *              surfaced after recovery fails
 *       400 -> NO_SPOTIFY_ACCOUNT
 *       503 -> SERVER_ERROR
 *       429 -> RATE_LIMITED (61s * multiplier back-off; the poll is paused and
 *              resumed when the back-off elapses)
 *       default -> SPOTIFY_ERROR
 *       403 -> free-account notice (`SPOTIFY_FREE_ACCOUNT`)
 *
 * Documented deviations from the minified bundle (per plan Todo 14, which is
 * authoritative for this rewrite):
 *  - The original 403 branch is a no-op (`\`${status}\``); the plan's Todo 14
 *    explicitly lists "free account" as one of the three error branches, so 403
 *    maps to `WidgetStatus.SPOTIFY_FREE_ACCOUNT`. The other branches are copied
 *    verbatim.
 *  - `fetch` (token) and the shared `withSpotifyToken` axios instance (poll) are
 *    collapsed onto one injectable `SpotifyHttpClient`. URLs, headers, status
 *    handling and retry options are unchanged; only the transport seam is
 *    unified so Vitest can mock a single client.
 *  - The original stores the token response verbatim (`Bearer ${r.data}`). This
 *    adapter accepts a bare string (the original) and the plan's mock-server
 *    contract `{ token: string }`; an object without a `token` field (e.g. the
 *    Spotify OAuth `{ access_token }` shape) is rejected rather than silently
 *    interpolated as `[object Object]`.
 *  - The original's silent token recovery (`ce`) only surfaces
 *    `SPOTIFY_TOKEN_EXPIRED` after a 60s grace period AND >= 3 failed refreshes
 *    whose error carries `needsReconnect` + `invalid_grant`/`invalid_client`
 *    (`me`, `AmuseWidget.js:569-616`). This adapter performs the same
 *    force-refresh + retry, but surfaces expiry as soon as the recovery refresh
 *    fails (no attempt counter / grace timer). The 429 back-off
 *    (`61s * min(multiplier*2, 8)`) and the pause/resume of the poll are ported.
 *  - The BroadcastChannel master election (`Fs`, `AmuseWidget.js:425-554`) is
 *    mounted by the runtime (see `masterElection` below); this adapter still
 *    supports a standalone 500ms fallback timer when no election is injected.
 *
 * Out of scope (owned elsewhere): the Spotify "canvas" lookup and the
 * title/artist cleanup helpers. `canvas_url` is injected via options and
 * defaults to `''`.
 */

import axios, { type AxiosRequestConfig } from 'axios';
import { SPOTIFY_NO_COVER_IMAGE } from '../../settings/registry';
import {
  DEFAULT_PLAYER_TRACK,
  PlaybackState,
  WidgetStatus,
  type PlayerTrack,
  type RawSpotifyItem,
} from '../store';
import {
  createNothingPlayingTrack,
  type NothingPlayingDefaults,
} from '../state-machine';
import type { SpotifyMasterElection } from '../realtime';

/* -------------------------------------------------------------------------- */
/* Constants — verbatim from the original                                      */
/* -------------------------------------------------------------------------- */

/** Original token endpoint (`useAxios-Rfx7aUEI.js:10`) — never change. */
export const SPOTIFY_TOKEN_URL = '/api/widget/spotify/token';

/** Original `refetchInterval: 33e5` (ms). */
export const SPOTIFY_TOKEN_REFETCH_INTERVAL_MS = 3_300_000;

/** Original `retry: 2`. */
export const SPOTIFY_TOKEN_RETRY = 2;

/** Original token error message fallback. */
export const SPOTIFY_TOKEN_ERROR_MESSAGE = 'Failed to get Spotify token';

/**
 * Original `retryDelay: (e) => Math.min(1e3 * 2 ** e, 3e4)`.
 * `attempt` is the 0-based failure index (react-query `retryDelay`).
 */
export function spotifyTokenRetryDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 30_000);
}

/**
 * Original currently-playing endpoint (`AmuseWidget.js:663`) — byte-identical,
 * including `additional_types=episode`. Never change.
 */
export const SPOTIFY_CURRENTLY_PLAYING_URL =
  'https://api.spotify.com/v1/me/player/currently-playing?additional_types=episode';

/** Original poll `refetchInterval` — 3s (`we(..., { refetchInterval: l })`). */
export const SPOTIFY_POLL_INTERVAL_MS = 3000;

/**
 * Original `Fs` BroadcastChannel master-election delay
 * (`AmuseWidget.js:498-500`): after 500 ms with no competing heartbeat the
 * widget promotes itself to master and sets `SUCCESS`.
 */
export const SPOTIFY_MASTER_ELECTION_DELAY_MS = 500;

/** Original `Tt` (`AmuseWidget.js:333`) — ad cover asset. */
export const SPOTIFY_AD_COVER = '/assets/spotify_ad_cover-B6syg7Z1.svg';

/* -------------------------------------------------------------------------- */
/* Injectable HTTP surface (axios-compatible)                                  */
/* -------------------------------------------------------------------------- */

export interface SpotifyRequestConfig {
  headers: Record<string, string>;
  /**
   * Only the token request uses this (`validateStatus: () => true`) so the
   * original `if (!e.ok)` branch can run instead of axios throwing. The poll
   * omits it, matching the original where axios rejects non-2xx.
   */
  validateStatus?: (status: number) => boolean;
}

export interface SpotifyHttpResponse<T> {
  status: number;
  data: T;
}

/** Minimal injectable HTTP surface (matches `axios.get`). */
export interface SpotifyHttpClient {
  get<T>(
    url: string,
    config?: SpotifyRequestConfig,
  ): Promise<SpotifyHttpResponse<T>>;
}

/** Default runtime client — thin axios wrapper, no behaviour change. */
export const defaultSpotifyHttpClient: SpotifyHttpClient = {
  get: <T>(url: string, config?: SpotifyRequestConfig) =>
    axios.get<T>(url, config as AxiosRequestConfig) as Promise<
      SpotifyHttpResponse<T>
    >,
};

/* -------------------------------------------------------------------------- */
/* Raw payload types — exact field paths from the original                     */
/* -------------------------------------------------------------------------- */

export interface SpotifyImage {
  url: string;
}

export interface SpotifyArtist {
  name?: string;
}

export interface SpotifyAlbum {
  images?: SpotifyImage[];
}

export interface SpotifyShow {
  name?: string;
}

/** `data.item` of the currently-playing payload (track or episode). */
export interface SpotifyItem {
  id?: string;
  name?: string;
  type?: string;
  duration_ms?: number;
  is_local?: boolean;
  artists?: SpotifyArtist[];
  album?: SpotifyAlbum;
  show?: SpotifyShow;
  images?: SpotifyImage[];
  [key: string]: unknown;
}

/** `GET .../currently-playing` response body. */
export interface SpotifyCurrentlyPlaying {
  item?: SpotifyItem | null;
  currently_playing_type?: string;
  is_playing?: boolean;
  progress_ms?: number;
}

/* -------------------------------------------------------------------------- */
/* Token fetch                                                                 */
/* -------------------------------------------------------------------------- */

export interface SpotifyTokenError extends Error {
  status?: number;
  code?: string;
  needsReconnect?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Normalise the token response to the raw bearer value.
 *
 * The original uses the parsed body verbatim (`Bearer ${r.data}`); the plan's
 * mock-server contract is `{ token: string }`. A bare non-empty string wins,
 * then `.token`; anything else (e.g. `{ access_token }`) is rejected so a wrong
 * splice fails loudly instead of sending `Bearer [object Object]`.
 */
export function extractSpotifyToken(data: unknown): string {
  if (typeof data === 'string' && data.length > 0) return data;
  if (
    isRecord(data) &&
    typeof data.token === 'string' &&
    data.token.length > 0
  ) {
    return data.token;
  }
  throw new Error(SPOTIFY_TOKEN_ERROR_MESSAGE);
}

export interface FetchSpotifyTokenOptions {
  /** `widget_token` used for the `Authorization: Bearer <widget_token>` header. */
  widgetToken: string;
  /** Injectable HTTP client (defaults to axios). */
  http?: SpotifyHttpClient;
}

/**
 * One token request. Mirrors the original `queryFn` exactly:
 * `GET /api/widget/spotify/token` with `Authorization: Bearer <widget_token>`
 * and `Content-Type: application/json`; a non-2xx response throws an error
 * carrying `.status`, `.code` and `.needsReconnect`.
 */
export async function fetchSpotifyToken(
  options: FetchSpotifyTokenOptions,
): Promise<string> {
  const http = options.http ?? defaultSpotifyHttpClient;
  const response = await http.get<unknown>(SPOTIFY_TOKEN_URL, {
    headers: {
      Authorization: `Bearer ${options.widgetToken}`,
      'Content-Type': 'application/json',
    },
    validateStatus: () => true,
  });

  const data = response.data;
  if (response.status < 200 || response.status >= 300) {
    const body = isRecord(data) ? data : {};
    const error = new Error(
      typeof body.error === 'string' ? body.error : SPOTIFY_TOKEN_ERROR_MESSAGE,
    ) as SpotifyTokenError;
    error.status = response.status;
    error.code = typeof body.code === 'string' ? body.code : undefined;
    error.needsReconnect = body.needsReconnect === true;
    throw error;
  }
  return extractSpotifyToken(data);
}

export interface FetchSpotifyTokenWithRetryOptions extends FetchSpotifyTokenOptions {
  /** Number of retries (original `retry: 2` → 3 total attempts). */
  retry?: number;
  /** Called before each retry wait (Vitest seam / diagnostics). */
  onRetry?: (attempt: number, error: unknown) => void;
}

/** `retry: 2` with `retryDelay(e) = min(1000 * 2 ** e, 30000)`. */
export async function fetchSpotifyTokenWithRetry(
  options: FetchSpotifyTokenWithRetryOptions,
): Promise<string> {
  const retry = options.retry ?? SPOTIFY_TOKEN_RETRY;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retry; attempt += 1) {
    try {
      return await fetchSpotifyToken({
        widgetToken: options.widgetToken,
        http: options.http,
      });
    } catch (error) {
      lastError = error;
      if (attempt < retry) {
        options.onRetry?.(attempt, error);
        await new Promise<void>((resolve) => {
          setTimeout(resolve, spotifyTokenRetryDelay(attempt));
        });
      }
    }
  }
  throw lastError;
}

/* -------------------------------------------------------------------------- */
/* Result + mapping                                                            */
/* -------------------------------------------------------------------------- */

/** Result of one poll tick, mapped onto the player store's enums. */
export interface SpotifyPollResult {
  /** Mapped track, or `null` when nothing is playing / on error. */
  track: PlayerTrack | null;
  /** `null` => leave the store's current value untouched. */
  playbackState: PlaybackState | null;
  /** `null` => leave the store's current value untouched. */
  widgetState: WidgetStatus | null;
  /** Raw item, stored via `setRawSpotifyItem` (original `_(R)`). */
  rawItem: RawSpotifyItem | null;
  /** Present only when the request threw. */
  error?: unknown;
}

/** Full `PlayerTrack` from a partial, seeded by the store default. */
function buildTrack(overrides: Partial<PlayerTrack>): PlayerTrack {
  return { ...DEFAULT_PLAYER_TRACK, ...overrides };
}

/** Empty-playback result (original `b(D.NOTHING_PLAYING)` + `S(q.SUCCESS)`). */
export function createSpotifyNothingPlayingResult(
  nothingPlaying?: NothingPlayingDefaults,
): SpotifyPollResult {
  const empty = createNothingPlayingTrack(nothingPlaying);
  return {
    track: buildTrack({ ...empty, canvas_url: '' }),
    playbackState: PlaybackState.NOTHING_PLAYING,
    widgetState: WidgetStatus.SUCCESS,
    rawItem: null,
  };
}

export interface MapSpotifyOptions {
  /** Canvas URL injected from the (out-of-scope) canvas lookup; default `''`. */
  canvasUrl?: string;
  /** Nothing-playing defaults forwarded to the empty branch. */
  nothingPlaying?: NothingPlayingDefaults;
}

/**
 * Map one `currently-playing` payload to the store shape.
 *
 * `currently_playing_type` selects the artist/cover source:
 *  - `"track"`   → `artists[0].name` + `album.images[0].url` (non-local) or the
 *                  `"No Artist"` / no-cover fallback (`is_local` truthy);
 *  - `"episode"` → `show.name` + `images[0].url`;
 *  - `"ad"`      → `Ad Break` / `Music will resume shortly`;
 *  - default     → `-` / `-`.
 * `id`, `name`, `duration_ms`, `is_playing` and `progress_ms` are always read.
 */
export function mapSpotifyCurrentlyPlaying(
  data: SpotifyCurrentlyPlaying | null | undefined,
  options: MapSpotifyOptions = {},
): SpotifyPollResult {
  const item = data?.item;
  if (!item) {
    return createSpotifyNothingPlayingResult(options.nothingPlaying);
  }

  const type = data?.currently_playing_type ?? item.type;
  const isPlaying = data?.is_playing === true;
  const base: Partial<PlayerTrack> = {
    id: item.id ?? '',
    title: item.name ?? '',
    is_playing: isPlaying,
    canvas_url: options.canvasUrl ?? '',
    progress: data?.progress_ms ?? 0,
    duration: item.duration_ms ?? 0,
  };

  let track: Partial<PlayerTrack>;
  switch (type) {
    case 'track':
      track = item.is_local
        ? {
            ...base,
            artist: item.artists?.[0]?.name || 'No Artist',
            cover_url: SPOTIFY_NO_COVER_IMAGE,
          }
        : {
            ...base,
            artist: item.artists?.[0]?.name || 'Unknown Artist',
            cover_url: item.album?.images?.[0]?.url || SPOTIFY_NO_COVER_IMAGE,
          };
      break;
    case 'episode':
      track = {
        ...base,
        artist: item.show?.name || 'Unknown Show',
        cover_url: item.images?.[0]?.url || SPOTIFY_NO_COVER_IMAGE,
      };
      break;
    case 'ad':
      track = {
        title: 'Ad Break',
        artist: 'Music will resume shortly',
        cover_url: SPOTIFY_AD_COVER,
        progress: 0,
        duration: 0,
        is_playing: true,
      };
      break;
    default:
      track = {
        ...base,
        title: '-',
        artist: '-',
        cover_url: SPOTIFY_NO_COVER_IMAGE,
        progress: 0,
        duration: 0,
        is_playing: false,
      };
  }

  return {
    track: buildTrack(track),
    playbackState: PlaybackState.PLAYING,
    widgetState: WidgetStatus.SUCCESS,
    rawItem: item as RawSpotifyItem,
  };
}

/* -------------------------------------------------------------------------- */
/* Error branches                                                              */
/* -------------------------------------------------------------------------- */

export interface SpotifyErrorBranch {
  playbackState?: PlaybackState;
  widgetState?: WidgetStatus;
}

/**
 * Copy of the original `xe` switch (`AmuseWidget.js:716-814`).
 * An undefined status means "request failed without a response": the original
 * keeps the last known state, represented here by an empty branch.
 */
export function resolveSpotifyErrorBranch(
  status: number | undefined,
): SpotifyErrorBranch {
  switch (status) {
    case 401:
      return {
        playbackState: PlaybackState.TOKEN_EXPIRED,
        widgetState: WidgetStatus.SPOTIFY_TOKEN_EXPIRED,
      };
    case 403:
      return { widgetState: WidgetStatus.SPOTIFY_FREE_ACCOUNT };
    case 400:
      return { widgetState: WidgetStatus.NO_SPOTIFY_ACCOUNT };
    case 503:
      return { widgetState: WidgetStatus.SERVER_ERROR };
    case 429:
      return { playbackState: PlaybackState.RATE_LIMITED };
    case undefined:
      return {};
    default:
      return { widgetState: WidgetStatus.SPOTIFY_ERROR };
  }
}

/** Extract an HTTP status from either an axios error or a token error. */
export function getSpotifyErrorStatus(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;
  const response = error.response;
  if (isRecord(response) && typeof response.status === 'number') {
    return response.status;
  }
  if (typeof error.status === 'number') return error.status;
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Poll tick                                                                   */
/* -------------------------------------------------------------------------- */

export interface FetchSpotifyCurrentlyPlayingOptions {
  /** Bearer token obtained from `fetchSpotifyToken`. */
  token: string;
  /** Injectable HTTP client (defaults to axios). */
  http?: SpotifyHttpClient;
  /** Canvas URL forwarded to the mapper; default `''`. */
  canvasUrl?: string;
  /** Nothing-playing defaults forwarded to the empty branch. */
  nothingPlaying?: NothingPlayingDefaults;
}

/**
 * One poll of the currently-playing endpoint and map the response.
 *
 * Mirrors the original `Oe` queryFn + `xe` error handler:
 *  - `200` with `item` -> `PLAYING` + mapped track;
 *  - `204`             -> `NOTHING_PLAYING` + nothing-playing track;
 *  - a thrown request  -> the status branch from `resolveSpotifyErrorBranch`.
 */
export async function fetchSpotifyCurrentlyPlaying(
  options: FetchSpotifyCurrentlyPlayingOptions,
): Promise<SpotifyPollResult> {
  const http = options.http ?? defaultSpotifyHttpClient;
  try {
    const response = await http.get<SpotifyCurrentlyPlaying>(
      SPOTIFY_CURRENTLY_PLAYING_URL,
      { headers: { Authorization: `Bearer ${options.token}` } },
    );

    if (response.status === 204) {
      return createSpotifyNothingPlayingResult(options.nothingPlaying);
    }
    if (response.status === 200 && response.data?.item) {
      return mapSpotifyCurrentlyPlaying(response.data, {
        canvasUrl: options.canvasUrl,
        nothingPlaying: options.nothingPlaying,
      });
    }
    return createSpotifyNothingPlayingResult(options.nothingPlaying);
  } catch (error) {
    const branch = resolveSpotifyErrorBranch(getSpotifyErrorStatus(error));
    return {
      track: null,
      playbackState: branch.playbackState ?? null,
      widgetState: branch.widgetState ?? null,
      rawItem: null,
      error,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Player store sink                                                           */
/* -------------------------------------------------------------------------- */

/** Player store surface the adapter writes into. */
export interface SpotifyPlayerSink {
  setCurrentTrack: (track: Partial<PlayerTrack>) => void;
  setPlaybackState: (state: PlaybackState) => void;
  setWidgetState: (state: WidgetStatus) => void;
  setRawSpotifyItem: (item: RawSpotifyItem | null) => void;
}

/**
 * Write one poll result into the sink. `null` states mean "leave unchanged"
 * (the original keeps the last known playback state on a response-less error).
 */
export function applySpotifyResult(
  result: SpotifyPollResult,
  sink: SpotifyPlayerSink,
): void {
  if (result.track !== null) sink.setCurrentTrack(result.track);
  if (result.playbackState !== null)
    sink.setPlaybackState(result.playbackState);
  if (result.widgetState !== null) sink.setWidgetState(result.widgetState);
  sink.setRawSpotifyItem(result.rawItem);
}

/* -------------------------------------------------------------------------- */
/* Polling adapter (token refetch 3,300,000ms + poll 3000ms)                   */
/* -------------------------------------------------------------------------- */

export interface SpotifyAdapterOptions {
  /** `widget_token` used for the token request's Bearer header. */
  widgetToken: string;
  /** Store sink the adapter drives. */
  sink: SpotifyPlayerSink;
  /** Injectable HTTP client (defaults to axios). */
  http?: SpotifyHttpClient;
  /** Poll interval in ms; defaults to `SPOTIFY_POLL_INTERVAL_MS` (3000). */
  pollIntervalMs?: number;
  /** Token refetch interval; defaults to `SPOTIFY_TOKEN_REFETCH_INTERVAL_MS`. */
  tokenIntervalMs?: number;
  /** Token retry count; defaults to `SPOTIFY_TOKEN_RETRY` (2). */
  tokenRetry?: number;
  /** Canvas URL injected into the mapper; default `''`. */
  canvasUrl?: string;
  /** Nothing-playing defaults forwarded to the empty branch. */
  nothingPlaying?: NothingPlayingDefaults;
  /**
   * BroadcastChannel master election (`Fs`, `AmuseWidget.js:425-554`). When
   * supplied (the runtime wires it), `start()`/`stop()` mount and tear it down
   * instead of the standalone 500ms fallback timer.
   */
  masterElection?: SpotifyMasterElection;
  /** Error logger (defaults to `console.error`). */
  onError?: (message: string, error: unknown) => void;
}

export interface SpotifyAdapter {
  readonly isRunning: boolean;
  /** Current bearer token, or `null` before the first successful fetch. */
  readonly token: string | null;
  /** Poll once immediately, then every `pollIntervalMs`; also refetch the token. */
  start(): void;
  stop(): void;
  /** Single token + poll; never throws (errors become error-branch results). */
  pollOnce(): Promise<SpotifyPollResult>;
  /** Force a token refetch (original `forceRefreshSpotifyToken`). */
  refreshToken(): Promise<string>;
}

class SpotifyAdapterImpl implements SpotifyAdapter {
  private readonly widgetToken: string;
  private readonly sink: SpotifyPlayerSink;
  private readonly http: SpotifyHttpClient;
  private readonly pollIntervalMs: number;
  private readonly tokenIntervalMs: number;
  private readonly tokenRetry: number;
  private readonly canvasUrl: string | undefined;
  private readonly nothingPlaying: NothingPlayingDefaults | undefined;
  private readonly masterElection: SpotifyMasterElection | undefined;
  private readonly onError: (message: string, error: unknown) => void;
  private currentToken: string | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private tokenTimer: ReturnType<typeof setInterval> | null = null;
  private masterTimer: ReturnType<typeof setTimeout> | null = null;
  private resumeTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMultiplier = 1;

  constructor(options: SpotifyAdapterOptions) {
    this.widgetToken = options.widgetToken;
    this.sink = options.sink;
    this.http = options.http ?? defaultSpotifyHttpClient;
    this.pollIntervalMs = options.pollIntervalMs ?? SPOTIFY_POLL_INTERVAL_MS;
    this.tokenIntervalMs =
      options.tokenIntervalMs ?? SPOTIFY_TOKEN_REFETCH_INTERVAL_MS;
    this.tokenRetry = options.tokenRetry ?? SPOTIFY_TOKEN_RETRY;
    this.canvasUrl = options.canvasUrl;
    this.nothingPlaying = options.nothingPlaying;
    this.masterElection = options.masterElection;
    this.onError =
      options.onError ?? ((message, error) => console.error(message, error));
  }

  get isRunning(): boolean {
    return this.pollTimer !== null || this.resumeTimer !== null;
  }

  get token(): string | null {
    return this.currentToken;
  }

  private async loadToken(): Promise<string> {
    this.currentToken = await fetchSpotifyTokenWithRetry({
      widgetToken: this.widgetToken,
      http: this.http,
      retry: this.tokenRetry,
    });
    return this.currentToken;
  }

  async refreshToken(): Promise<string> {
    return this.loadToken();
  }

  async pollOnce(): Promise<SpotifyPollResult> {
    let token: string;
    try {
      token = this.currentToken ?? (await this.loadToken());
    } catch (error) {
      // Original parity: a TOKEN failure does NOT set a widget state. The
      // original's token query simply fails, the poll is disabled and the
      // BroadcastChannel master election (`AmuseWidget.js:498-500`) drives
      // `SUCCESS`. Only a playback-poll failure (with a valid token) maps onto
      // the error branches (`xe`, `AmuseWidget.js:709-815`). Keep last-known
      // state and let the master election render the widget.
      this.onError('Failed to get Spotify token', error);
      const result: SpotifyPollResult = {
        track: null,
        playbackState: null,
        widgetState: null,
        rawItem: null,
        error,
      };
      applySpotifyResult(result, this.sink);
      return result;
    }
    // `fetchSpotifyCurrentlyPlaying` never throws: poll errors become the
    // status branch from `resolveSpotifyErrorBranch`.
    let result = await fetchSpotifyCurrentlyPlaying({
      token,
      http: this.http,
      canvasUrl: this.canvasUrl,
      nothingPlaying: this.nothingPlaying,
    });

    // Original silent token recovery (`ce`, `AmuseWidget.js:617-649`): a 401
    // from the playback endpoint force-refreshes the token and retries before
    // the expiry state is surfaced.
    if (getSpotifyErrorStatus(result.error) === 401) {
      const recovered = await this.recoverToken();
      if (recovered && this.currentToken) {
        result = await fetchSpotifyCurrentlyPlaying({
          token: this.currentToken,
          http: this.http,
          canvasUrl: this.canvasUrl,
          nothingPlaying: this.nothingPlaying,
        });
      }
    }

    if (result.error === undefined) {
      // Original `ge()`: a successful poll resets the 429 back-off multiplier.
      this.backoffMultiplier = 1;
    } else if (getSpotifyErrorStatus(result.error) === 429) {
      this.scheduleRateLimitBackoff();
    }

    applySpotifyResult(result, this.sink);
    return result;
  }

  /** `ce`'s `forceRefreshSpotifyToken`; `true` when a fresh token was obtained. */
  private async recoverToken(): Promise<boolean> {
    try {
      await this.loadToken();
      return true;
    } catch (error) {
      this.onError('Failed to recover Spotify token', error);
      return false;
    }
  }

  /**
   * Original 429 back-off (`xe` case 429): `backoffSeconds = 61 * multiplier`,
   * then `multiplier = min(multiplier * 2, 8)`; the poll is paused and resumed
   * after the back-off elapses (`m(!1)` … `setTimeout(() => m(We), ie * 1e3)`).
   */
  private scheduleRateLimitBackoff(): void {
    const backoffSeconds = 61 * this.backoffMultiplier;
    this.backoffMultiplier = Math.min(this.backoffMultiplier * 2, 8);
    console.warn(
      `[Spotify] Rate limited (429). Backing off for ${backoffSeconds}s`,
    );
    this.pausePollTimer();
    if (this.resumeTimer !== null) clearTimeout(this.resumeTimer);
    this.resumeTimer = setTimeout(() => {
      this.resumeTimer = null;
      this.startPollTimer();
    }, backoffSeconds * 1000);
  }

  private startPollTimer(): void {
    if (this.pollTimer !== null) return;
    // `setInterval` keeps firing regardless of tab visibility, matching the
    // original `refetchIntervalInBackground: true`.
    this.pollTimer = setInterval(() => {
      void this.pollOnce();
    }, this.pollIntervalMs);
  }

  private pausePollTimer(): void {
    if (this.pollTimer === null) return;
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  start(): void {
    if (this.pollTimer !== null || this.resumeTimer !== null) return;
    if (this.masterElection) {
      // Original `Fs` BroadcastChannel master election: a 500ms initial
      // election (no competing heartbeat -> promote + `SUCCESS`), heartbeat +
      // watchdog across tabs. Mounted by the runtime for the Spotify source.
      this.masterElection.start();
    } else {
      // Standalone fallback (no election injected): the original `Fs` still
      // promotes the sole tab to master after 500ms and sets `SUCCESS`, so the
      // skin renders even while the Spotify token is unavailable.
      this.masterTimer = setTimeout(() => {
        this.sink.setWidgetState(WidgetStatus.SUCCESS);
      }, SPOTIFY_MASTER_ELECTION_DELAY_MS);
    }
    void this.pollOnce();
    this.startPollTimer();
    // Original token query `refetchInterval: 33e5`.
    this.tokenTimer = setInterval(() => {
      void this.refreshToken().catch((error: unknown) => {
        this.onError('Failed to refresh Spotify token', error);
      });
    }, this.tokenIntervalMs);
  }

  stop(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.tokenTimer !== null) {
      clearInterval(this.tokenTimer);
      this.tokenTimer = null;
    }
    if (this.masterTimer !== null) {
      clearTimeout(this.masterTimer);
      this.masterTimer = null;
    }
    if (this.resumeTimer !== null) {
      clearTimeout(this.resumeTimer);
      this.resumeTimer = null;
    }
    this.masterElection?.stop();
    this.backoffMultiplier = 1;
  }
}

/** Factory the runtime can start/stop. */
export function createSpotifyAdapter(
  options: SpotifyAdapterOptions,
): SpotifyAdapter {
  return new SpotifyAdapterImpl(options);
}
