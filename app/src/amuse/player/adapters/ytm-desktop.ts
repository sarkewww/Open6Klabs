/**
 * ytm-desktop source adapter — ported from the original Amuse widget bundle.
 *
 * Source: `app/_reference/AmuseWidget.js:3275-3454` (the `si()` hook) and
 * `app/_reference/useSocket2-CiuC2fti.js:1303` (the module-level socket).
 *
 * The original is a React hook that:
 *  1. uses the shared `youtubeMusicDesktopV2Socket` singleton, created with
 *     `io("http://localhost:9863/api/v1/realtime", { transports:["websocket"],
 *      reconnection:true, reconnectionDelay:1e3, reconnectionDelayMax:5e3,
 *      reconnectionAttempts:1/0, autoConnect:false })`
 *     (`useSocket2-CiuC2fti.js:1303`);
 *  2. on mount, `fetch("/api/widget/accounts/ytmdesktop", { headers:{
 *      Authorization: \`Bearer ${widget_token}\`, "Content-Type":"application/json" }})`;
 *     on a `404: Youtube Music Desktop App is not connected` detail it sets the
 *     widget state to `YTMD_NOT_CONNECTED`, otherwise on success it assigns
 *     `socket.auth = { token }`, connects and sets `SUCCESS`;
 *  3. binds `connect`/`connect_error`/`connect_timeout`/`reconnect_failed`/
 *     `disconnect`/`state-update` and removes them on unmount.
 *
 * The original keeps the raw `state-update` payload in React state and maps it
 * to the player store inside a 1s react-query `queryFn`. Per the plan's Todo 13
 * ("`state-update` reads `video.{...}` and `player.{...}`; `trackState===1` →
 * playing; ad → Ad Break") this adapter collapses that mapping into the
 * `state-update` handler. Event names, field paths, URL and reconnect options
 * are preserved verbatim.
 *
 * Out of scope (owned elsewhere): the Spotify "canvas" lookup (`Qe`) and the
 * title/artist cleanup helpers (`removeOfficialVideoFromTitle`,
 * `extractTitleFromMultiTitle`, `extractBeforeFirstDot`). This adapter maps the
 * raw `video.title`/`video.author` paths the task names.
 */

import { io } from 'socket.io-client';
import { PlaybackState, WidgetStatus, type PlayerTrack } from '../store';

/* -------------------------------------------------------------------------- */
/* Constants — exact realtime URL, socket options, token endpoint              */
/* -------------------------------------------------------------------------- */

/** Original `useSocket2-CiuC2fti.js:1303` — byte-identical URL. */
export const YTM_DESKTOP_REALTIME_URL = 'http://localhost:9863/api/v1/realtime';

/** Original token endpoint (`AmuseWidget.js:3402`). */
export const YTM_DESKTOP_TOKEN_URL = '/api/widget/accounts/ytmdesktop';

/** Original 404 `detail` that maps to `YTMD_NOT_CONNECTED` (`AmuseWidget.js:3411`). */
export const YTM_DESKTOP_NOT_CONNECTED_DETAIL =
  '404: Youtube Music Desktop App is not connected';

/**
 * Original `Tt` (`AmuseWidget.js:333`, used in the ad branch at `:3343`) — the
 * ad cover asset. Byte-identical to `SPOTIFY_AD_COVER` / `PEAR_DESKTOP_AD_COVER`
 * (all three reference the same module-level `Tt` constant in the original).
 */
export const YTM_DESKTOP_AD_COVER = '/assets/spotify_ad_cover-B6syg7Z1.svg';

/**
 * Original socket options (`useSocket2-CiuC2fti.js:1303`). `reconnectionAttempts`
 * is `1/0` (Infinity) in the original.
 */
export interface YtmDesktopSocketOptions {
  transports: string[];
  reconnection: boolean;
  reconnectionDelay: number;
  reconnectionDelayMax: number;
  reconnectionAttempts: number;
  autoConnect: boolean;
}

export const YTM_DESKTOP_SOCKET_OPTIONS: YtmDesktopSocketOptions = {
  transports: ['websocket'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: Infinity,
  autoConnect: false,
};

/* -------------------------------------------------------------------------- */
/* Socket seam (injectable for Vitest)                                         */
/* -------------------------------------------------------------------------- */

export type YtmDesktopSocketHandler = (...args: unknown[]) => void;

/** Minimal structural surface of the socket.io client the adapter uses. */
export interface YtmDesktopSocket {
  auth: Record<string, unknown> | undefined;
  connect: () => unknown;
  on: (event: string, handler: YtmDesktopSocketHandler) => unknown;
  off: (event: string, handler: YtmDesktopSocketHandler) => unknown;
}

export type YtmDesktopSocketFactory = (
  url: string,
  options: YtmDesktopSocketOptions,
) => YtmDesktopSocket;

const defaultCreateSocket: YtmDesktopSocketFactory = (url, options) =>
  io(url, options) as unknown as YtmDesktopSocket;

/* -------------------------------------------------------------------------- */
/* Token fetch seam (injectable for Vitest)                                    */
/* -------------------------------------------------------------------------- */

export interface YtmDesktopFetchResponse {
  ok: boolean;
  json: () => Promise<unknown>;
}

export type YtmDesktopFetch = (
  url: string,
  init: RequestInit,
) => Promise<YtmDesktopFetchResponse>;

const defaultFetch: YtmDesktopFetch = (url, init) => fetch(url, init);

/* -------------------------------------------------------------------------- */
/* Raw payload types — exact field paths from the original                     */
/* -------------------------------------------------------------------------- */

export interface YtmDesktopThumbnail {
  url: string;
}

export interface YtmDesktopVideo {
  id: string;
  title: string;
  author: string;
  durationSeconds: number;
  thumbnails: YtmDesktopThumbnail[];
}

export interface YtmDesktopPlayer {
  adPlaying: boolean;
  trackState: number;
  videoProgress: number;
}

/** Shape of a `state-update` event payload. */
export interface YtmDesktopStateUpdate {
  video?: YtmDesktopVideo;
  player?: YtmDesktopPlayer;
}

/** Player store surface the adapter writes into. */
export interface YtmDesktopPlayerSink {
  setCurrentTrack: (track: Partial<PlayerTrack>) => void;
  setPlaybackState: (state: PlaybackState) => void;
  setWidgetState: (state: WidgetStatus) => void;
}

export type YtmDesktopErrorReporter = (message: string, error: unknown) => void;

export interface YtmDesktopAdapterOptions {
  /** `widget_token` used for the `Authorization: Bearer <token>` header. */
  widgetToken: string;
  /** Store sink the adapter drives. */
  sink: YtmDesktopPlayerSink;
  /** Override the socket factory (Vitest). Defaults to socket.io `io`. */
  createSocket?: YtmDesktopSocketFactory;
  /** Override the token fetch (Vitest). Defaults to global `fetch`. */
  fetchToken?: YtmDesktopFetch;
  /** Override the error logger (Vitest). Defaults to `console.error`. */
  onError?: YtmDesktopErrorReporter;
}

export interface YtmDesktopAdapter {
  /** The socket instance the adapter created. */
  socket: YtmDesktopSocket;
  /** Remove every listener registered by the adapter (original cleanup). */
  dispose: () => void;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const defaultErrorReporter: YtmDesktopErrorReporter = (message, error) => {
  console.error(message, error);
};

/**
 * Map one `state-update` payload onto the player store.
 *
 * Mirrors the original `queryFn` (`AmuseWidget.js:3335-3395`):
 *  - no `video` → `NOTHING_PLAYING`;
 *  - `player.adPlaying` → "Ad Break" track + `ADVERTISEMENT`;
 *  - `player.trackState === 0` → pause the current track (`is_playing:false`);
 *  - `player.trackState === 1` → `PLAYING` + full track mapping
 *    (`durationSeconds * 1000`, `videoProgress * 1000`, `thumbnails[0].url`
 *    cover, `thumbnails[2].url` canvas).
 */
export function applyYtmDesktopStateUpdate(
  payload: unknown,
  sink: YtmDesktopPlayerSink,
): void {
  if (!isRecord(payload) || !isRecord(payload.video)) {
    sink.setPlaybackState(PlaybackState.NOTHING_PLAYING);
    return;
  }

  const video = payload.video as unknown as YtmDesktopVideo;
  const player = isRecord(payload.player)
    ? (payload.player as unknown as YtmDesktopPlayer)
    : undefined;

  if (player?.adPlaying) {
    sink.setCurrentTrack({
      id: video.id,
      title: 'Ad Break',
      artist: 'Music will resume shortly',
      cover_url: YTM_DESKTOP_AD_COVER,
      progress: 0,
      duration: 0,
      is_playing: true,
      canvas_url: undefined,
    });
    sink.setPlaybackState(PlaybackState.ADVERTISEMENT);
    return;
  }

  if (player?.trackState === 0) {
    sink.setCurrentTrack({ is_playing: false });
    return;
  }

  if (player?.trackState === 1) {
    sink.setPlaybackState(PlaybackState.PLAYING);
    sink.setCurrentTrack({
      id: video.id,
      title: video.title,
      artist: video.author,
      duration: video.durationSeconds * 1000,
      progress: player.videoProgress * 1000,
      is_playing: true,
      cover_url: video.thumbnails?.[0]?.url,
      canvas_url: video.thumbnails?.[2]?.url,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Adapter                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Wire the ytm-desktop socket + token handshake into a player store sink.
 *
 * Faithful to the original mount effect: listeners are registered synchronously
 * and the token fetch is kicked off immediately. Returns a handle whose
 * `dispose()` removes every listener.
 */
export function createYtmDesktopAdapter(
  options: YtmDesktopAdapterOptions,
): YtmDesktopAdapter {
  const { widgetToken, sink } = options;
  const createSocket = options.createSocket ?? defaultCreateSocket;
  const fetchToken = options.fetchToken ?? defaultFetch;
  const onError = options.onError ?? defaultErrorReporter;

  const socket = createSocket(YTM_DESKTOP_REALTIME_URL, {
    ...YTM_DESKTOP_SOCKET_OPTIONS,
  });

  const handleConnect: YtmDesktopSocketHandler = () => {
    sink.setWidgetState(WidgetStatus.SUCCESS);
  };
  const handleConnectionError: YtmDesktopSocketHandler = (error) => {
    onError('Failed to connect to youtube music desktop v2 socket:', error);
    sink.setPlaybackState(PlaybackState.NOTHING_PLAYING);
  };
  const handleDisconnect: YtmDesktopSocketHandler = () => {
    sink.setPlaybackState(PlaybackState.NOTHING_PLAYING);
  };
  const handleStateUpdate: YtmDesktopSocketHandler = (payload) => {
    applyYtmDesktopStateUpdate(payload, sink);
  };

  socket.on('connect', handleConnect);
  socket.on('connect_error', handleConnectionError);
  socket.on('connect_timeout', handleConnectionError);
  socket.on('reconnect_failed', handleConnectionError);
  socket.on('disconnect', handleDisconnect);
  socket.on('state-update', handleStateUpdate);

  void fetchToken(YTM_DESKTOP_TOKEN_URL, {
    headers: {
      Authorization: `Bearer ${widgetToken}`,
      'Content-Type': 'application/json',
    },
  })
    .then(async (response) => {
      if (!response.ok) {
        const body = await response.json();
        const detail = isRecord(body) ? body.detail : undefined;
        if (detail === YTM_DESKTOP_NOT_CONNECTED_DETAIL) {
          sink.setWidgetState(WidgetStatus.YTMD_NOT_CONNECTED);
        } else {
          onError('Error fetching ytmdesktop token:', body);
        }
        return;
      }
      const body = await response.json();
      const token = isRecord(body) ? body.token : undefined;
      socket.auth = { token };
      socket.connect();
      sink.setWidgetState(WidgetStatus.SUCCESS);
    })
    .catch((error: unknown) => {
      onError('Error fetching ytmdesktop token:', error);
    });

  return {
    socket,
    dispose: () => {
      socket.off('connect', handleConnect);
      socket.off('connect_error', handleConnectionError);
      socket.off('connect_timeout', handleConnectionError);
      socket.off('reconnect_failed', handleConnectionError);
      socket.off('disconnect', handleDisconnect);
      socket.off('state-update', handleStateUpdate);
    },
  };
}
