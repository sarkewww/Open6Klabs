/**
 * Realtime client — pusher settings channel + Spotify BroadcastChannel election.
 *
 * Source of truth (`app/_reference/AmuseWidget.js`):
 *   - `Si()` pusher singleton config ................... lines 7634-7653
 *       · app key `3dd5f6a0-6026-4a71-b223-e1d2697fcec3`
 *       · `channelAuthorization.endpoint = "/api/pusher/realtime/auth"`
 *       · `enabledTransports: ["ws", "wss"]`
 *   - `Di()` subscription / `user_changed_settings` ... lines 7685-7790
 *       · channel `private-amuse-${widget_token}` (line 7688)
 *       · `bind("pusher:subscription_succeeded")`,
 *         `bind("pusher:subscription_error")`,
 *         `bind("user_changed_settings")` -> profile-scoped query
 *         `setQueryData(["amuse-profile", profile_id, widget_token], profile)`
 *         or `invalidateQueries({ queryKey: ["amuse-profile"] })`
 *       · cleanup `E.unbind_all(); E.unsubscribe()`
 *   - `Fs()` Spotify master election ................... lines 425-554
 *       · instance id `Math.random().toString(36).substring(2, 10)`
 *       · channel `amuse-spotify-${widget_token}` (line 486)
 *       · 500 ms initial election, 3 s heartbeat, 3 s watchdog, 6 s stale
 *
 * The captured bundle only uses pusher-js. The `/api/events` SSE refresh is
 * injected by the verbatim host (`widget-server.mjs:63-65`), NOT by the widget
 * code; the rewrite host (plan Todo 29) must provide an equivalent refresh
 * mechanism. This module therefore owns the pusher path + the BroadcastChannel
 * master election only.
 *
 * `ws://localhost:6001` is the local self-hosted Pusher-protocol server
 * (`mock-server/src/realtime.ts`, `REALTIME_PORT` default 6001). The app key,
 * channel names, event names and auth endpoint are byte-identical to the
 * original and must not change.
 *
 * Pusher / BroadcastChannel / timers are injectable so Vitest can exercise the
 * exact runtime behaviour without a live socket.
 */

import Pusher, { type Options as PusherOptions } from 'pusher-js';
import type { StoreApi } from 'zustand';
import { SPOTIFY_NO_COVER_IMAGE } from '../settings/registry';
import {
  PlaybackState,
  WidgetStatus,
  type PlayerStore,
  type PlayerTrack,
} from './store';

/* -------------------------------------------------------------------------- */
/* Constants (verbatim)                                                        */
/* -------------------------------------------------------------------------- */

/** Original pusher app key. DO NOT CHANGE. */
export const PUSHER_APP_KEY = '3dd5f6a0-6026-4a71-b223-e1d2697fcec3';

/** Original channel-authorization endpoint. DO NOT CHANGE. */
export const PUSHER_AUTH_ENDPOINT = '/api/pusher/realtime/auth';

/** Local self-hosted Pusher-protocol WebSocket (mock-server, default 6001). */
export const REALTIME_WS_HOST = 'localhost';
export const REALTIME_WS_PORT = 6001;
export const REALTIME_WS_URL = `ws://${REALTIME_WS_HOST}:${REALTIME_WS_PORT}`;

/** Original cluster value (ignored by pusher-js when `wsHost` is set). */
export const PUSHER_CLUSTER = 'mt1';

/** Original realtime event name. DO NOT CHANGE. */
export const USER_CHANGED_SETTINGS_EVENT = 'user_changed_settings';

/** Original pusher lifecycle event names. */
export const PUSHER_SUBSCRIPTION_SUCCEEDED = 'pusher:subscription_succeeded';
export const PUSHER_SUBSCRIPTION_ERROR = 'pusher:subscription_error';

/** Spotify election timings (original `We`, `6e3`, `500`, `3e3`). */
export const SPOTIFY_HEARTBEAT_INTERVAL_MS = 3000;
export const SPOTIFY_STALE_MS = 6000;
export const SPOTIFY_INITIAL_ELECTION_MS = 500;
export const SPOTIFY_WATCHDOG_INTERVAL_MS = 3000;

/* -------------------------------------------------------------------------- */
/* Channel names                                                               */
/* -------------------------------------------------------------------------- */

/** Settings channel: original `` `private-amuse-${widget_token}` ``. */
export function realtimeChannelName(widgetToken: string): string {
  return `private-amuse-${widgetToken}`;
}

/** Spotify election channel: original `` `amuse-spotify-${widget_token}` ``. */
export function spotifyChannelName(widgetToken: string): string {
  return `amuse-spotify-${widgetToken}`;
}

/* -------------------------------------------------------------------------- */
/* Pusher config                                                               */
/* -------------------------------------------------------------------------- */

export interface RealtimePusherConfig {
  wsHost: string;
  wsPort: number;
  wssPort: number;
  forceTLS: boolean;
  wsPath: undefined;
  enabledTransports: string[];
  cluster: string;
  channelAuthorization: { endpoint: string; transport: 'ajax' };
}

/** Build the pusher options. Local host override, everything else verbatim. */
export function createPusherConfig(): RealtimePusherConfig {
  return {
    wsHost: REALTIME_WS_HOST,
    wsPort: REALTIME_WS_PORT,
    wssPort: REALTIME_WS_PORT,
    forceTLS: false,
    wsPath: undefined,
    enabledTransports: ['ws', 'wss'],
    cluster: PUSHER_CLUSTER,
    channelAuthorization: {
      endpoint: PUSHER_AUTH_ENDPOINT,
      transport: 'ajax',
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Injectable pusher surface                                                   */
/* -------------------------------------------------------------------------- */

export interface PusherChannelLike {
  bind(event: string, handler: (data: unknown) => void): unknown;
  unbind_all(): void;
  unsubscribe(): void;
}

export interface PusherClientLike {
  subscribe(channel: string): PusherChannelLike;
  unsubscribe(channel: string): void;
  disconnect(): void;
}

export type PusherFactory = (
  key: string,
  options: RealtimePusherConfig,
) => PusherClientLike;

const defaultPusherFactory: PusherFactory = (key, options) =>
  new Pusher(
    key,
    options as unknown as PusherOptions,
  ) as unknown as PusherClientLike;

let sharedPusher: PusherClientLike | null = null;

/** Lazily-created module singleton (original `Si()` caches `mt`). */
export function getSharedPusher(
  factory: PusherFactory = defaultPusherFactory,
): PusherClientLike {
  if (!sharedPusher)
    sharedPusher = factory(PUSHER_APP_KEY, createPusherConfig());
  return sharedPusher;
}

/** Test-only: disconnect + drop the module singleton. */
export function resetSharedPusher(): void {
  sharedPusher?.disconnect();
  sharedPusher = null;
}

/* -------------------------------------------------------------------------- */
/* Settings subscription                                                       */
/* -------------------------------------------------------------------------- */

/** Payload shape broadcast by the mock server's `notifyProfileChange`. */
export interface UserChangedSettingsPayload {
  profile_id?: string;
  profile?: unknown;
  [key: string]: unknown;
}

export interface RealtimeClientOptions {
  widgetToken: string;
  /** Current profile id; original `o ?? "main"`. */
  profileId?: string;
  /** Called only when `payload.profile_id` matches the active profile. */
  onSettingsChanged: (payload: UserChangedSettingsPayload) => void;
  onSubscriptionError?: (error: unknown) => void;
  /** Injected pusher instance (tests) — takes precedence over the factory. */
  pusher?: PusherClientLike;
  /** Injected pusher factory (tests) — bypasses the module singleton. */
  pusherFactory?: PusherFactory;
  logger?: Pick<Console, 'warn'>;
}

export interface RealtimeClient {
  readonly channelName: string;
  readonly profileId: string;
  subscribe(): PusherChannelLike | null;
  unsubscribe(): void;
  destroy(): void;
}

/**
 * Create a settings-realtime client. `subscribe()` mirrors the original
 * `Di()` effect; `unsubscribe()` mirrors its cleanup.
 */
export function createRealtimeClient(
  options: RealtimeClientOptions,
): RealtimeClient {
  const profileId = options.profileId ?? 'main';
  const channelName = realtimeChannelName(options.widgetToken);
  const logger = options.logger ?? console;

  let channel: PusherChannelLike | null = null;
  let pusher: PusherClientLike | null = options.pusher ?? null;

  const resolvePusher = (): PusherClientLike => {
    if (pusher) return pusher;
    pusher = options.pusherFactory
      ? options.pusherFactory(PUSHER_APP_KEY, createPusherConfig())
      : getSharedPusher();
    return pusher;
  };

  const subscribe = (): PusherChannelLike | null => {
    if (!options.widgetToken) return null;
    const subscribed = resolvePusher().subscribe(channelName);
    subscribed.bind(PUSHER_SUBSCRIPTION_SUCCEEDED, () => {});
    subscribed.bind(PUSHER_SUBSCRIPTION_ERROR, (error) => {
      logger.warn(
        '[Amuse] Realtime settings subscription failed — settings will sync on next refresh',
        error,
      );
      options.onSubscriptionError?.(error);
    });
    subscribed.bind(USER_CHANGED_SETTINGS_EVENT, (data) => {
      const payload = (data ?? {}) as UserChangedSettingsPayload;
      if (payload.profile_id !== profileId) return;
      options.onSettingsChanged(payload);
    });
    channel = subscribed;
    return subscribed;
  };

  const unsubscribe = (): void => {
    if (!channel) return;
    channel.unbind_all();
    channel.unsubscribe();
    channel = null;
  };

  return {
    channelName,
    profileId,
    subscribe,
    unsubscribe,
    destroy: unsubscribe,
  };
}

/* -------------------------------------------------------------------------- */
/* BroadcastChannel master election                                            */
/* -------------------------------------------------------------------------- */

export interface BroadcastChannelLike {
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage(message: unknown): void;
  close(): void;
}

export type BroadcastChannelCtor = new (name: string) => BroadcastChannelLike;

export type TimerHandle = ReturnType<typeof setTimeout>;
export type IntervalHandle = ReturnType<typeof setInterval>;

export interface RealtimeTimers {
  setTimeout(handler: () => void, timeout?: number): TimerHandle;
  clearTimeout(handle: TimerHandle | undefined): void;
  setInterval(handler: () => void, timeout?: number): IntervalHandle;
  clearInterval(handle: IntervalHandle | undefined): void;
}

const defaultTimers: RealtimeTimers = {
  setTimeout: (handler, timeout) => setTimeout(handler, timeout),
  clearTimeout: (handle) => clearTimeout(handle as never),
  setInterval: (handler, timeout) => setInterval(handler, timeout),
  clearInterval: (handle) => clearInterval(handle as never),
};

function defaultBroadcastChannel(): BroadcastChannelCtor | null {
  return typeof BroadcastChannel !== 'undefined'
    ? (BroadcastChannel as unknown as BroadcastChannelCtor)
    : null;
}

/** Original instance id: `Math.random().toString(36).substring(2, 10)`. */
export function createElectionInstanceId(): string {
  return Math.random().toString(36).substring(2, 10);
}

/** Original `re` empty-track literal (canvas_url is intentionally undefined). */
export function createElectionEmptyTrack(): Partial<PlayerTrack> {
  return {
    title: 'Nothing Playing',
    artist: 'Get the music started',
    cover_url: SPOTIFY_NO_COVER_IMAGE,
    duration: 0,
    progress: 0,
    is_playing: false,
    canvas_url: undefined,
  };
}

export interface SpotifyHeartbeatPayload {
  type: 'heartbeat';
  masterId: string;
  track: PlayerTrack;
  playbackState: PlaybackState;
  widgetState: WidgetStatus;
}

export interface SpotifyMasterElectionOptions {
  widgetToken: string;
  store: StoreApi<PlayerStore>;
  instanceId?: string;
  BroadcastChannelImpl?: BroadcastChannelCtor | null;
  emptyTrack?: () => Partial<PlayerTrack>;
  now?: () => number;
  timers?: RealtimeTimers;
  onMasterChange?: (isMaster: boolean) => void;
  logger?: Pick<Console, 'warn'>;
}

export interface SpotifyMasterElection {
  readonly channelName: string;
  readonly instanceId: string;
  getIsMaster(): boolean;
  start(): void;
  stop(): void;
}

/**
 * Port of the original Spotify tab master election (`Fs`, lines 425-554).
 *
 * - On start, open `amuse-spotify-${widget_token}` and wait 500 ms. If no
 *   heartbeat was seen, promote this tab and set `widgetState = SUCCESS`.
 * - While slave, adopt a master's heartbeat (track / playback / widget state).
 * - If this tab is master and sees a lower `masterId`, yield.
 * - A 3 s watchdog promotes this tab when the master has been silent > 6 s.
 * - While master, broadcast a heartbeat on every state change and every 3 s.
 */
export function createSpotifyMasterElection(
  options: SpotifyMasterElectionOptions,
): SpotifyMasterElection {
  const instanceId = options.instanceId ?? createElectionInstanceId();
  const channelName = spotifyChannelName(options.widgetToken);
  const now = options.now ?? (() => Date.now());
  const timers = options.timers ?? defaultTimers;
  const logger = options.logger ?? console;
  const emptyTrack = options.emptyTrack ?? createElectionEmptyTrack;
  const ChannelImpl =
    options.BroadcastChannelImpl === undefined
      ? defaultBroadcastChannel()
      : options.BroadcastChannelImpl;

  let channel: BroadcastChannelLike | null = null;
  let isMaster = false;
  let lastHeartbeat = 0;
  let started = false;
  let electionTimer: TimerHandle | undefined;
  let watchdogTimer: IntervalHandle | undefined;
  let heartbeatTimer: IntervalHandle | undefined;
  let unsubscribeStore: (() => void) | undefined;

  const setIsMaster = (next: boolean): void => {
    if (isMaster === next) return;
    isMaster = next;
    options.onMasterChange?.(next);
  };

  const postHeartbeat = (): void => {
    if (!channel) return;
    const state = options.store.getState();
    const payload: SpotifyHeartbeatPayload = {
      type: 'heartbeat',
      masterId: instanceId,
      track: state.currentTrack,
      playbackState: state.playbackState,
      widgetState: state.widgetState,
    };
    channel.postMessage(payload);
  };

  const handleMessage = (event: { data: unknown }): void => {
    const data = event?.data as SpotifyHeartbeatPayload | undefined;
    if (!data || data.type !== 'heartbeat') return;
    lastHeartbeat = now();
    if (
      isMaster &&
      typeof data.masterId === 'string' &&
      data.masterId < instanceId
    ) {
      setIsMaster(false);
    }
    if (isMaster) return;
    const state = options.store.getState();
    if (data.playbackState === PlaybackState.NOTHING_PLAYING) {
      state.setPlaybackState(PlaybackState.NOTHING_PLAYING);
      state.setWidgetState(data.widgetState);
      state.setCurrentTrack(emptyTrack());
    } else {
      state.setCurrentTrack(data.track);
      state.setPlaybackState(data.playbackState);
      state.setWidgetState(data.widgetState);
    }
  };

  const start = (): void => {
    if (started || !options.widgetToken || !ChannelImpl) return;
    started = true;
    channel = new ChannelImpl(channelName);
    channel.onmessage = handleMessage;

    electionTimer = timers.setTimeout(() => {
      if (lastHeartbeat !== 0) return;
      setIsMaster(true);
      options.store.getState().setWidgetState(WidgetStatus.SUCCESS);
    }, SPOTIFY_INITIAL_ELECTION_MS);

    watchdogTimer = timers.setInterval(() => {
      if (isMaster || lastHeartbeat === 0) return;
      if (now() - lastHeartbeat <= SPOTIFY_STALE_MS) return;
      logger.warn('[Spotify] Master disappeared, promoting to master');
      setIsMaster(true);
      lastHeartbeat = 0;
    }, SPOTIFY_WATCHDOG_INTERVAL_MS);

    unsubscribeStore = options.store.subscribe((state, previous) => {
      if (!isMaster) return;
      if (
        state.currentTrack !== previous.currentTrack ||
        state.playbackState !== previous.playbackState ||
        state.widgetState !== previous.widgetState
      ) {
        postHeartbeat();
      }
    });

    heartbeatTimer = timers.setInterval(() => {
      if (isMaster) postHeartbeat();
    }, SPOTIFY_HEARTBEAT_INTERVAL_MS);
  };

  const stop = (): void => {
    if (!started) return;
    started = false;
    if (electionTimer !== undefined) timers.clearTimeout(electionTimer);
    if (watchdogTimer !== undefined) timers.clearInterval(watchdogTimer);
    if (heartbeatTimer !== undefined) timers.clearInterval(heartbeatTimer);
    unsubscribeStore?.();
    channel?.close();
    channel = null;
    unsubscribeStore = undefined;
    electionTimer = undefined;
    watchdogTimer = undefined;
    heartbeatTimer = undefined;
    isMaster = false;
    lastHeartbeat = 0;
  };

  return {
    channelName,
    instanceId,
    getIsMaster: () => isMaster,
    start,
    stop,
  };
}
