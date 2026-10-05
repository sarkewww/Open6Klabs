/**
 * Widget runtime bootstrap — the missing wiring between the rewrite's modules.
 *
 * Until now the rewrite shipped every module (adapters / realtime / session /
 * settings) but nothing drove them: `WidgetRoot` rendered `Player` with the
 * default settings + `widgetState=LOADING`, so the rewrite painted an EMPTY
 * shell. This module reproduces the original `Di()` bootstrap
 * (`app/_reference/AmuseWidget.js:7685-7846`) as a framework-agnostic controller
 * the React hook (`useWidgetRuntime`) can own.
 *
 * Original flow (verbatim source, `Di()`):
 *   1. read `widget_token` / `profile_id` from the route
 *   2. `GET /api/widget/settings` with `Authorization: Bearer <widget_token>`
 *      (queryKey `["widget-settings", widget_token]`); a failure sets
 *      `ACCOUNT_NOT_EXISTING`
 *   3. `kt()` -> `GET /api/widget/subscription` (queryKey `["subscription-private"]`)
 *   4. `k()`  -> `GET /api/widgets/amuse/profiles/<id ?? "main">`; the error body
 *      `error` string maps to PROFILE_NOT_EXISTING / ACCOUNT_NOT_EXISTING /
 *      DISABLED_PROFILE / DISABLED_PRO_SKIN / DISABLED_DISCORD_SKIN; a 502 maps
 *      to SERVER_ERROR; anything else resets the track
 *   5. `m?.music_service && (setActiveMusicService(m.music_service), resetCurrentTrack())`
 *   6. one source component mounts per `music_service` (pear/apple/spicetify/
 *      tidal/spotify/ytm) and polls into the player store
 *   7. pusher `private-amuse-<widget_token>` -> `user_changed_settings`
 *   8. `k().settings` -> profile settings (demo -> `hs`), fallback `ds`
 *
 * The rewrite adds one client-side concern the original delegated to the server:
 * subscription/skin gating via `isSkinLocked`, which is wired here. Session
 * expiry is NOT gated: the better-auth session client only records a
 * `sessionExpired` flag for the shell (the original `Di()` never downgrades
 * `widgetState` on expiry). The earlier `applySessionToWidget` /
 * `resolveSubscriptionGating` helpers were removed as dead code.
 *
 * Everything external (fetch, pusher, session, source adapters, timers) is
 * injectable so the flow is unit-testable with zero network/socket I/O.
 */

import Pusher, { type Options as PusherOptions } from 'pusher-js';
import type { StoreApi } from 'zustand';
import { createPlayerStore, type PlayerStore } from '../player/store';
import { PlaybackState, WidgetStatus } from '../player/store';
import {
  DEFAULT_PROFILE_SETTINGS,
  resolveProfileSettings,
  type AmuseProfileSettings,
} from '../profile/settings';
import {
  isSkinLocked,
  SKINS,
  SkinTier,
  SPOTIFY_NO_COVER_IMAGE,
  type SkinEntry,
} from '../settings/registry';
import {
  NOTHING_PLAYING_DEFAULTS,
  resolveNothingPlayingDefaults,
  type NothingPlayingDefaults,
} from '../player/state-machine';
import { MusicSource } from '../types/user';
import { SubscriptionStatus } from '../types/subscription';
import {
  createSessionClient,
  isSessionExpired,
  type SessionClient,
  type SessionState,
  type SessionUser,
} from '../auth/session';
import {
  createPusherConfig,
  createRealtimeClient,
  createSpotifyMasterElection,
  PUSHER_APP_KEY,
  type PusherClientLike,
  type PusherFactory,
  type RealtimeClient,
  type SpotifyMasterElection,
  type SpotifyMasterElectionOptions,
} from '../player/realtime';
import {
  createPearDesktopAdapter,
  PEAR_DESKTOP_QUERY_URL,
  type PearDesktopQuery,
} from '../player/adapters/pear-desktop';
import {
  startAppleMusicPolling,
  type AppleMusicHttpClient,
} from '../player/adapters/apple-music';
import {
  startSpicetifyPolling,
  type SpicetifyHttpClient,
} from '../player/adapters/spicetify';
import {
  startTidalPolling,
  type TidalHttpClient,
} from '../player/adapters/tidal';
import {
  createSpotifyAdapter,
  type SpotifyHttpClient,
  type SpotifyRequestConfig,
} from '../player/adapters/spotify';
import {
  createYtmDesktopAdapter,
  type YtmDesktopFetch,
  type YtmDesktopSocket,
  type YtmDesktopSocketFactory,
} from '../player/adapters/ytm-desktop';

/* -------------------------------------------------------------------------- */
/* Endpoints + defaults (verbatim from the original)                           */
/* -------------------------------------------------------------------------- */

/** Original settings query endpoint. */
export const WIDGET_SETTINGS_URL = '/api/widget/settings';

/** Original subscription query endpoint (`kt()`). */
export const WIDGET_SUBSCRIPTION_URL = '/api/widget/subscription';

/** Original profile endpoint: `` `/api/widgets/amuse/profiles/${id ?? "main"}` ``. */
export function widgetProfileUrl(profileId?: string): string {
  return `/api/widgets/amuse/profiles/${profileId || 'main'}`;
}

/** Original `o ?? "main"`. */
export const DEFAULT_PROFILE_ID = 'main';

/** The mock-server's default `music_service` (plan fallback). */
export const DEFAULT_MUSIC_SERVICE: MusicSource = MusicSource.PEAR_DESKTOP;

/** Feature flags that gate the apple-music / tidal sources (`Ye(...)`). */
export interface WidgetFeatureFlags {
  APPLE_MUSIC: boolean;
  TIDAL: boolean;
}

export const DEFAULT_FEATURE_FLAGS: WidgetFeatureFlags = {
  APPLE_MUSIC: false,
  TIDAL: false,
};

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

/** `GET /api/widget/settings` body. */
export interface WidgetGeneralSettings {
  general?: { hide_popup?: boolean; [key: string]: unknown };
  [key: string]: unknown;
}

/** `GET /api/widget/subscription` body (original `subscriptionPrivate`). */
export interface WidgetSubscription {
  tier?: string;
  status?: string;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  [key: string]: unknown;
}

/** `GET /api/widgets/amuse/profiles/:id` body. */
export interface WidgetProfile {
  _id?: string;
  profile_id?: string;
  name?: string;
  music_service?: string;
  settings?: Partial<AmuseProfileSettings> | null;
  [key: string]: unknown;
}

/** A failed profile fetch (`{ response: { data, status } }` in the original). */
export interface WidgetProfileFetchError {
  status: number;
  error?: string;
}

export interface WidgetProfileFetchResult {
  profile: WidgetProfile | null;
  error: WidgetProfileFetchError | null;
}

/** A unified source adapter handle (start/stop). */
export interface WidgetSourceAdapter {
  start(): void;
  stop(): void;
}

export interface WidgetSourceContext {
  store: StoreApi<PlayerStore>;
  widgetToken: string;
  settings: AmuseProfileSettings;
  fetchImpl: typeof fetch;
  onError?: (message: string, error: unknown) => void;
  ytmSocketFactory?: YtmDesktopSocketFactory;
  /** Override the Spotify master election (Vitest). Defaults to the real one. */
  spotifyElectionFactory?: (
    options: SpotifyMasterElectionOptions,
  ) => SpotifyMasterElection;
}

export type WidgetSourceFactory = (
  service: MusicSource,
  context: WidgetSourceContext,
) => WidgetSourceAdapter | null;

/** Public runtime state the React hook mirrors into React state. */
export interface WidgetBootstrapState {
  general: WidgetGeneralSettings | null;
  subscription: WidgetSubscription | null;
  profile: WidgetProfile | null;
  settings: AmuseProfileSettings;
  musicService: MusicSource | null;
  sessionExpired: boolean;
  ready: boolean;
}

export interface WidgetBootstrapOptions {
  widgetToken: string;
  /** Defaults to `"main"` (original `o ?? "main"`). */
  profileId?: string;
  /** Isolated player store; defaults to a fresh vanilla store. */
  store?: StoreApi<PlayerStore>;
  /** Injectable fetch; defaults to `globalThis.fetch`. */
  fetchImpl?: typeof fetch;
  /** Injectable source adapter factory; defaults to {@link createWidgetSource}. */
  sourceFactory?: WidgetSourceFactory;
  /** Injectable pusher factory; defaults to a real pusher-js client. */
  pusherFactory?: PusherFactory;
  /** Injectable session client factory; defaults to `createSessionClient`. */
  sessionFactory?: (options: { onSessionExpired: () => void }) => SessionClient;
  /** Injectable ytm-desktop socket factory; defaults to socket.io `io`. */
  ytmSocketFactory?: YtmDesktopSocketFactory;
  /** Injectable Spotify master-election factory; defaults to the real one. */
  spotifyElectionFactory?: (
    options: SpotifyMasterElectionOptions,
  ) => SpotifyMasterElection;
  featureFlags?: Partial<WidgetFeatureFlags>;
  onStateChange?: (state: WidgetBootstrapState) => void;
  onError?: (message: string, error: unknown) => void;
}

export interface WidgetBootstrap {
  readonly store: StoreApi<PlayerStore>;
  start(): Promise<WidgetBootstrapState>;
  stop(): void;
  getState(): WidgetBootstrapState;
}

/* -------------------------------------------------------------------------- */
/* Fetch helpers                                                               */
/* -------------------------------------------------------------------------- */

interface JsonFetchResult<T> {
  ok: boolean;
  status: number;
  body: T | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function fetchJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  init?: RequestInit,
): Promise<JsonFetchResult<T>> {
  const response = await fetchImpl(url, init);
  let body: T | null;
  try {
    body = (await response.json()) as T;
  } catch {
    body = null;
  }
  return { ok: response.ok, status: response.status, body };
}

/** `Authorization: Bearer <widget_token>` + JSON (original header shape). */
function authInit(widgetToken: string): RequestInit {
  return {
    headers: {
      Authorization: `Bearer ${widgetToken}`,
      'Content-Type': 'application/json',
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Pure resolution helpers                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Map a failed profile fetch onto the original `k()` error switch.
 * Returns `null` for "reset the track but keep LOADING" (e.g. a network error),
 * exactly like the original's fall-through.
 */
export function resolveProfileWidgetStatus(
  error: WidgetProfileFetchError | null,
): WidgetStatus | null {
  if (!error) return null;
  switch (error.error) {
    case 'Profile not found':
      return WidgetStatus.PROFILE_NOT_EXISTING;
    case 'User not found':
      return WidgetStatus.ACCOUNT_NOT_EXISTING;
    case 'Upgrade to Pro to get unlimited profiles':
      return WidgetStatus.DISABLED_PROFILE;
    case 'Upgrade to Pro to use this skin':
      return WidgetStatus.DISABLED_PRO_SKIN;
    case 'Join the Discord Server to use this skin':
      return WidgetStatus.DISABLED_DISCORD_SKIN;
    default:
      break;
  }
  if (error.status === 502) return WidgetStatus.SERVER_ERROR;
  return null;
}

/** Normalise a raw `subscription.status` string onto the shared enum. */
export function normalizeSubscriptionStatus(
  raw: string | undefined,
): SubscriptionStatus {
  const values = Object.values(SubscriptionStatus) as string[];
  return values.includes(raw ?? '')
    ? (raw as SubscriptionStatus)
    : SubscriptionStatus.INACTIVE;
}

/** `session.data.user` -> the two `isSkinLocked` membership inputs. */
export function resolveDiscordMembership(session: SessionState | null): {
  hasDiscordConnection: boolean;
  isDiscordMember: boolean;
} {
  const user = session?.data?.user as
    | (SessionUser & {
        connections?: { discord?: unknown };
      })
    | undefined;
  const isDiscordMember = user?.is_discord_member === true;
  const hasDiscordConnection =
    isDiscordMember || Boolean(user?.connections?.discord);
  return { hasDiscordConnection, isDiscordMember };
}

/**
 * Client-side skin gate: `isSkinLocked(skin, {subscriptionStatus, ...})` ->
 * `DISABLED_PRO_SKIN` (PRO tier) or `DISABLED_DISCORD_SKIN` (DISCORD tier).
 * Returns `null` when the skin is usable.
 */
export function resolveSkinGating(input: {
  settings: AmuseProfileSettings;
  subscriptionStatus?: SubscriptionStatus;
  hasDiscordConnection?: boolean;
  isDiscordMember?: boolean;
}): WidgetStatus | null {
  const entry: SkinEntry | undefined = SKINS.find(
    (skin) => skin.id === input.settings.skin,
  );
  if (!entry) return null;
  const locked = isSkinLocked(entry, {
    subscriptionStatus: input.subscriptionStatus,
    hasDiscordConnection: input.hasDiscordConnection,
    isDiscordMember: input.isDiscordMember,
  });
  if (!locked) return null;
  return entry.tier === SkinTier.PRO
    ? WidgetStatus.DISABLED_PRO_SKIN
    : WidgetStatus.DISABLED_DISCORD_SKIN;
}

/** Resolve the active music service from a profile (validated against the enum). */
export function resolveActiveMusicService(
  profile: WidgetProfile | null,
): MusicSource | null {
  const raw = profile?.music_service;
  const values = Object.values(MusicSource) as string[];
  return typeof raw === 'string' && values.includes(raw)
    ? (raw as MusicSource)
    : null;
}

/** `Ye("APPLE_MUSIC")` / `Ye("TIDAL")` gate — every other source is enabled. */
export function isMusicServiceEnabled(
  service: MusicSource,
  flags: WidgetFeatureFlags = DEFAULT_FEATURE_FLAGS,
): boolean {
  if (service === MusicSource.APPLE) return flags.APPLE_MUSIC !== false;
  if (service === MusicSource.TIDAL) return flags.TIDAL !== false;
  return true;
}

/* -------------------------------------------------------------------------- */
/* Default source adapters (thin wrappers over the ported adapters)            */
/* -------------------------------------------------------------------------- */

function buildHttpClient<TConfig>(
  fetchImpl: typeof fetch,
  applyTransform?: (
    config: TConfig | undefined,
    headers: Record<string, string>,
  ) => void,
) {
  return {
    get: async <T>(url: string, config?: TConfig) => {
      const headers: Record<string, string> = {};
      applyTransform?.(config, headers);
      const response = await fetchImpl(url, { headers });
      const data = (await response.json().catch(() => null)) as T;
      return { data };
    },
  };
}

function createAppleHttpClient(fetchImpl: typeof fetch): AppleMusicHttpClient {
  return buildHttpClient(fetchImpl) as AppleMusicHttpClient;
}

function createSpicetifyHttpClient(
  fetchImpl: typeof fetch,
): SpicetifyHttpClient {
  return buildHttpClient(fetchImpl, (config, headers) => {
    const cfg = config as
      | {
          headers?: Record<string, string>;
          transformRequest?: Array<
            (data: unknown, h: Record<string, unknown>) => unknown
          >;
        }
      | undefined;
    Object.assign(headers, cfg?.headers ?? {});
    for (const transform of cfg?.transformRequest ?? [])
      transform(undefined, headers);
  }) as SpicetifyHttpClient;
}

function createTidalHttpClient(fetchImpl: typeof fetch): TidalHttpClient {
  return buildHttpClient(fetchImpl, (config, headers) => {
    const cfg = config as
      | {
          headers?: Record<string, string>;
          transformRequest?: Array<
            (data: unknown, h: Record<string, unknown>) => unknown
          >;
        }
      | undefined;
    Object.assign(headers, cfg?.headers ?? {});
    for (const transform of cfg?.transformRequest ?? [])
      transform(undefined, headers);
  }) as TidalHttpClient;
}

/**
 * Spotify client. Mirrors axios: a non-2xx response rejects UNLESS the caller
 * passed `validateStatus` accepting it (the token request does). This is
 * load-bearing — the poll's error branches (`401/403/400/503`) only run inside
 * the adapter's `catch`.
 */
function createSpotifyHttpClient(fetchImpl: typeof fetch): SpotifyHttpClient {
  return {
    get: async <T>(url: string, config?: SpotifyRequestConfig) => {
      const response = await fetchImpl(url, { headers: config?.headers });
      const data = (await response.json().catch(() => null)) as T;
      const accepted = config?.validateStatus
        ? config.validateStatus(response.status)
        : response.status >= 200 && response.status < 300;
      if (!accepted) {
        const error = new Error(
          `Request failed with status ${response.status}`,
        ) as Error & {
          response: { status: number; data: T };
        };
        error.response = { status: response.status, data };
        throw error;
      }
      return { status: response.status, data };
    },
  };
}

function buildYtmFetch(fetchImpl: typeof fetch): YtmDesktopFetch {
  return async (url, init) => {
    const response = await fetchImpl(url, init);
    return { ok: response.ok, json: () => response.json() };
  };
}

function applyResult(
  store: StoreApi<PlayerStore>,
  result: {
    track: PlayerStore['currentTrack'] | null;
    playbackState: PlaybackState | null;
    widgetState: WidgetStatus | null;
  },
): void {
  const state = store.getState();
  if (result.track !== null) state.setCurrentTrack(result.track);
  if (result.playbackState !== null)
    state.setPlaybackState(result.playbackState);
  if (result.widgetState !== null) state.setWidgetState(result.widgetState);
}

/**
 * Default source adapter factory. Every source writes into the same player
 * store; polling sources are wrapped into a single `{start, stop}` handle.
 */
export function createWidgetSource(
  service: MusicSource,
  context: WidgetSourceContext,
): WidgetSourceAdapter | null {
  const { store, fetchImpl } = context;
  const nothingPlaying: NothingPlayingDefaults = resolveNothingPlayingDefaults({
    settings: context.settings,
  });
  const onError =
    context.onError ?? ((message, error) => console.error(message, error));

  switch (service) {
    case MusicSource.PEAR_DESKTOP: {
      const adapter = createPearDesktopAdapter({
        fetcher: async () => {
          const response = await fetchImpl(PEAR_DESKTOP_QUERY_URL);
          if (!response.ok) {
            throw new Error(`pear-desktop request failed: ${response.status}`);
          }
          return (await response.json()) as PearDesktopQuery;
        },
        onUpdate: (result) => {
          store.getState().setCurrentTrack(result.track);
          store.getState().setPlaybackState(result.playbackState);
          store.getState().setWidgetState(result.widgetState);
        },
        onError: (error) => onError('[Amuse] pear-desktop poll failed', error),
        nothingPlaying,
      });
      return { start: () => adapter.start(), stop: () => adapter.stop() };
    }
    case MusicSource.APPLE: {
      const stop = startAppleMusicPolling({
        http: createAppleHttpClient(fetchImpl),
        onResult: (result) => applyResult(store, result),
      });
      return { start: () => {}, stop };
    }
    case MusicSource.SPICETIFY: {
      const stop = startSpicetifyPolling({
        http: createSpicetifyHttpClient(fetchImpl),
        onResult: (result) => applyResult(store, result),
      });
      return { start: () => {}, stop };
    }
    case MusicSource.TIDAL: {
      const stop = startTidalPolling({
        http: createTidalHttpClient(fetchImpl),
        onResult: (result) => applyResult(store, result),
      });
      return { start: () => {}, stop };
    }
    case MusicSource.SPOTIFY: {
      // Original `Fs` BroadcastChannel master election, mounted by the runtime
      // (the adapter starts/stops it alongside the poll).
      const masterElection = (
        context.spotifyElectionFactory ?? createSpotifyMasterElection
      )({ widgetToken: context.widgetToken, store });
      const adapter = createSpotifyAdapter({
        widgetToken: context.widgetToken,
        sink: {
          setCurrentTrack: (track) => store.getState().setCurrentTrack(track),
          setPlaybackState: (state) => store.getState().setPlaybackState(state),
          setWidgetState: (state) => store.getState().setWidgetState(state),
          setRawSpotifyItem: (item) => store.getState().setRawSpotifyItem(item),
        },
        http: createSpotifyHttpClient(fetchImpl),
        onError,
        masterElection,
      });
      return { start: () => adapter.start(), stop: () => adapter.stop() };
    }
    case MusicSource.YTM_DESKTOP: {
      let adapter: ReturnType<typeof createYtmDesktopAdapter> | null = null;
      return {
        start: () => {
          adapter = createYtmDesktopAdapter({
            widgetToken: context.widgetToken,
            sink: {
              setCurrentTrack: (track) =>
                store.getState().setCurrentTrack(track),
              setPlaybackState: (state) =>
                store.getState().setPlaybackState(state),
              setWidgetState: (state) => store.getState().setWidgetState(state),
            },
            fetchToken: buildYtmFetch(fetchImpl),
            createSocket: context.ytmSocketFactory,
            onError,
          });
        },
        stop: () => {
          if (!adapter) return;
          adapter.dispose();
          const socket = adapter.socket as YtmDesktopSocket & {
            disconnect?: () => void;
          };
          socket.disconnect?.();
          adapter = null;
        },
      };
    }
    default:
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Default pusher factory                                                      */
/* -------------------------------------------------------------------------- */

const defaultPusherFactory: PusherFactory = (key, options) =>
  new Pusher(
    key,
    options as unknown as PusherOptions,
  ) as unknown as PusherClientLike;

/* -------------------------------------------------------------------------- */
/* Bootstrap controller                                                        */
/* -------------------------------------------------------------------------- */

export function createWidgetBootstrap(
  options: WidgetBootstrapOptions,
): WidgetBootstrap {
  const widgetToken = options.widgetToken;
  const profileId = options.profileId || DEFAULT_PROFILE_ID;
  const store = options.store ?? createPlayerStore();
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const featureFlags: WidgetFeatureFlags = {
    ...DEFAULT_FEATURE_FLAGS,
    ...options.featureFlags,
  };
  const onError =
    options.onError ?? ((message, error) => console.error(message, error));

  const state: WidgetBootstrapState = {
    general: null,
    subscription: null,
    profile: null,
    settings: DEFAULT_PROFILE_SETTINGS,
    musicService: null,
    sessionExpired: false,
    ready: false,
  };

  let started = false;
  let stopped = false;
  let sessionClient: SessionClient | null = null;
  let realtimeClient: RealtimeClient | null = null;
  let pusherClient: PusherClientLike | null = null;
  let sourceAdapter: WidgetSourceAdapter | null = null;
  let currentService: MusicSource | null = null;
  let gated = false;

  const setWidgetState = (status: WidgetStatus): void => {
    store.getState().setWidgetState(status);
  };

  const updateState = (patch: Partial<WidgetBootstrapState>): void => {
    if (stopped) return;
    Object.assign(state, patch);
    options.onStateChange?.(state);
  };

  const handleSessionExpired = (): void => {
    // Original parity: the overlay does NOT gate the widget on session expiry
    // (`Di()` never reads the better-auth session). It still resolves the
    // profile + starts the source, so the widget renders normally; the session
    // flag is surfaced for the shell only.
    updateState({ sessionExpired: true });
  };

  const stopSource = (): void => {
    sourceAdapter?.stop();
    sourceAdapter = null;
    currentService = null;
  };

  const startSource = (service: MusicSource): void => {
    if (currentService === service && sourceAdapter) return;
    stopSource();
    if (!isMusicServiceEnabled(service, featureFlags)) return;
    const factory = options.sourceFactory ?? createWidgetSource;
    const adapter = factory(service, {
      store,
      widgetToken,
      settings: state.settings,
      fetchImpl,
      onError,
      ytmSocketFactory: options.ytmSocketFactory,
      spotifyElectionFactory: options.spotifyElectionFactory,
    });
    if (!adapter) return;
    sourceAdapter = adapter;
    currentService = service;
    adapter.start();
  };

  /** Apply a resolved profile: settings + active service + source adapter. */
  const applyProfile = (profile: WidgetProfile): void => {
    const settings = resolveProfileSettings(profile.settings);
    const musicService = resolveActiveMusicService(profile);
    updateState({ profile, settings, musicService });
    store.getState().setActiveMusicService(musicService);
    store.getState().resetCurrentTrack();
    if (musicService) startSource(musicService);
  };

  const handleSettingsChanged = (): void => {
    if (stopped) return;
    void refresh();
  };

  const startRealtime = (): void => {
    if (!widgetToken) return;
    try {
      pusherClient = (options.pusherFactory ?? defaultPusherFactory)(
        PUSHER_APP_KEY,
        createPusherConfig(),
      );
      realtimeClient = createRealtimeClient({
        widgetToken,
        profileId,
        pusher: pusherClient,
        onSettingsChanged: handleSettingsChanged,
      });
      realtimeClient.subscribe();
    } catch (error) {
      onError(
        '[Amuse] Pusher subscribe failed — settings will sync on next refresh',
        error,
      );
    }
  };

  const refresh = async (): Promise<void> => {
    try {
      // Refetch settings + subscription + profile (the original invalidates the
      // profile-scoped query; the rewrite also re-reads subscription so a
      // pushed membership change is honoured).
      const [settingsResult, subscriptionResult, profileResult] =
        await Promise.all([
          fetchJson<WidgetGeneralSettings>(
            fetchImpl,
            WIDGET_SETTINGS_URL,
            authInit(widgetToken),
          ),
          fetchJson<WidgetSubscription>(
            fetchImpl,
            WIDGET_SUBSCRIPTION_URL,
            authInit(widgetToken),
          ),
          fetchWidgetProfile(fetchImpl, widgetToken, profileId),
        ]);
      if (stopped) return;
      if (settingsResult.ok && settingsResult.body) {
        updateState({ general: settingsResult.body });
      }
      const subscription = subscriptionResult.ok
        ? subscriptionResult.body
        : null;
      if (subscriptionResult.ok) updateState({ subscription });
      if (profileResult.error || !profileResult.profile) return;

      const profile = profileResult.profile;
      const settings = resolveProfileSettings(profile.settings);
      const musicService = resolveActiveMusicService(profile);
      const { hasDiscordConnection, isDiscordMember } =
        resolveDiscordMembership(sessionClient?.getState() ?? null);
      const skinStatus = resolveSkinGating({
        settings,
        subscriptionStatus: normalizeSubscriptionStatus(subscription?.status),
        hasDiscordConnection,
        isDiscordMember,
      });

      if (skinStatus) {
        // A pushed profile switching to a locked skin must gate immediately:
        // stop the running source and surface the locked status.
        stopSource();
        updateState({ profile, settings, musicService });
        setWidgetState(skinStatus);
        gated = true;
        return;
      }

      // Unlocked: update settings so a pushed skin change re-renders, and
      // (re)start the source. `gated` recovery covers locked -> unlocked.
      updateState({ profile, settings, musicService });
      store.getState().setActiveMusicService(musicService);
      if (gated || currentService !== musicService) {
        store.getState().resetCurrentTrack();
        if (musicService) startSource(musicService);
      }
      gated = false;
    } catch (error) {
      onError('[Amuse] Failed to refresh widget settings', error);
    }
  };

  const start = async (): Promise<WidgetBootstrapState> => {
    if (started) return state;
    started = true;

    // 1) Session (better-auth port). A 401 / SESSION_EXPIRED is recorded as a
    // `sessionExpired` flag only; parity keeps `widgetState` unchanged (no
    // SESSION_EXPIRED downgrade — see the `isSessionExpired` branch below).
    try {
      sessionClient = options.sessionFactory
        ? options.sessionFactory({ onSessionExpired: handleSessionExpired })
        : createSessionClient({
            onSessionExpired: handleSessionExpired,
            fetchImpl,
          });
      sessionClient.init();
      const sessionState = await sessionClient.fetchSession();
      if (stopped) return state;
      if (isSessionExpired(sessionState)) {
        // Parity: the original overlay never downgrades the widget state on
        // session expiry — it proceeds to the settings/profile queries and the
        // source adapter (which drives `SUCCESS`). Record the flag and continue.
        updateState({ sessionExpired: true });
      }
    } catch (error) {
      onError('[Amuse] Session bootstrap failed', error);
    }
    if (stopped) return state;

    const { hasDiscordConnection, isDiscordMember } = resolveDiscordMembership(
      sessionClient?.getState() ?? null,
    );

    // 2) Settings + subscription + profile in parallel (original 3 queries).
    let settingsResult: JsonFetchResult<WidgetGeneralSettings>;
    let subscriptionResult: JsonFetchResult<WidgetSubscription>;
    let profileResult: WidgetProfileFetchResult;
    try {
      [settingsResult, subscriptionResult, profileResult] = await Promise.all([
        fetchJson<WidgetGeneralSettings>(
          fetchImpl,
          WIDGET_SETTINGS_URL,
          authInit(widgetToken),
        ),
        fetchJson<WidgetSubscription>(
          fetchImpl,
          WIDGET_SUBSCRIPTION_URL,
          authInit(widgetToken),
        ),
        fetchWidgetProfile(fetchImpl, widgetToken, profileId),
      ]);
    } catch (error) {
      // Original settings catch: `setWidgetState(ACCOUNT_NOT_EXISTING)`.
      setWidgetState(WidgetStatus.ACCOUNT_NOT_EXISTING);
      updateState({ ready: true });
      onError('[Amuse] Failed to fetch widget settings', error);
      return state;
    }
    if (stopped) return state;

    if (!settingsResult.ok) {
      setWidgetState(WidgetStatus.ACCOUNT_NOT_EXISTING);
      updateState({ ready: true });
      return state;
    }

    const subscription = subscriptionResult.ok ? subscriptionResult.body : null;
    updateState({ general: settingsResult.body, subscription });

    // 3) Profile error -> the original `k()` error switch.
    if (profileResult.error) {
      const status = resolveProfileWidgetStatus(profileResult.error);
      if (status) setWidgetState(status);
      store.getState().resetCurrentTrack();
      updateState({ ready: true });
      return state;
    }

    const profile = profileResult.profile;
    if (!profile) {
      updateState({ ready: true });
      return state;
    }

    // 4) Client-side skin gating (subscription + discord membership).
    const settings = resolveProfileSettings(profile.settings);
    const subscriptionStatus = normalizeSubscriptionStatus(
      subscription?.status,
    );
    const skinStatus = resolveSkinGating({
      settings,
      subscriptionStatus,
      hasDiscordConnection,
      isDiscordMember,
    });
    if (skinStatus) {
      updateState({ profile, settings, ready: true });
      setWidgetState(skinStatus);
      gated = true;
      return state;
    }

    // 5) Success path: apply profile + start the matching source adapter.
    applyProfile(profile);

    // 6) Realtime settings channel.
    startRealtime();

    updateState({ ready: true });
    return state;
  };

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    stopSource();
    realtimeClient?.unsubscribe();
    realtimeClient = null;
    pusherClient?.disconnect();
    pusherClient = null;
    sessionClient?.cleanup();
    sessionClient = null;
  };

  return {
    store,
    start,
    stop,
    getState: () => state,
  };
}

/** Fetch the profile; mirrors the original `k()` query + error shape. */
export async function fetchWidgetProfile(
  fetchImpl: typeof fetch,
  widgetToken: string,
  profileId?: string,
): Promise<WidgetProfileFetchResult> {
  try {
    const response = await fetchImpl(
      widgetProfileUrl(profileId),
      authInit(widgetToken),
    );
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok) {
      return {
        profile: null,
        error: {
          status: response.status,
          error:
            isRecord(body) && typeof body.error === 'string'
              ? body.error
              : undefined,
        },
      };
    }
    return {
      profile: isRecord(body) ? (body as WidgetProfile) : null,
      error: null,
    };
  } catch {
    return { profile: null, error: { status: 0, error: undefined } };
  }
}

/** Re-exported for consumers that only need the empty-track default. */
export { NOTHING_PLAYING_DEFAULTS, SPOTIFY_NO_COVER_IMAGE };
