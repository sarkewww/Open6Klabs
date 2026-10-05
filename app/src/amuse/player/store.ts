/**
 * Player store — ported from the original Amuse widget bundle.
 *
 * Source: `widget/assets/PlayerWindows98-ChpRHqWu.js` (export `b as u`), the
 * beautified copy at `app/_reference/PlayerWindows98-ChpRHqWu.js:81-98`.
 *
 * The original is a zustand React-hook store wrapped in the `devtools`
 * middleware under the name `"amuse-storage"`:
 *
 *   b = Ot()(Lt((e) => ({ ... }), { name: "amuse-storage" }))
 *   //    create(devtools(initializer, { name: "amuse-storage" }))
 *
 * Field names, action names and default values are preserved verbatim from the
 * original — including the module-level progress clock (`je`/`ae`/`Y`) that
 * `setCurrentTrack` reads/writes so the displayed progress bar can interpolate
 * smoothly between API updates.
 *
 * NOTE on defaults (documented deviation from the plan text): the plan's Todo 7
 * lists the default `currentTrack` as
 * `{id:"",title:"",artist:"",cover_url:"",duration:0,...}`. That shape is the
 * *reset* payload passed by `useAmuseProfileSettings` (`setCurrentTrack({ id:"",
 * title:"", ... })`), NOT the store's initial value. The original store default
 * (`st`) is:
 *   { title:"-", artist:"-", duration:1, progress:0,
 *     cover_url: SPOTIFY_NO_COVER_IMAGE, is_playing:false,
 *     canvas_url:"", id:"", isLiveStream:false }
 * Per the task's MUST-DO ("If the original names differ from the plan's list,
 * FOLLOW THE ORIGINAL and document the deviation") the original default wins.
 */

import { create, createStore, type StateCreator, type StoreApi } from 'zustand';
import { devtools } from 'zustand/middleware';
import { SPOTIFY_NO_COVER_IMAGE } from '../settings/registry';
import type { MusicSource } from '../types/user';

/* -------------------------------------------------------------------------- */
/* Enums (mirror `P` / `W` in `widget/assets/useAmuseSettings-CqN9zWcV.js`)    */
/* -------------------------------------------------------------------------- */

/**
 * Playback state (`P`/`Q` in the original — 5 members). Runtime strings are
 * byte-identical to the original.
 */
export const PlaybackState = {
  NOTHING_PLAYING: 'nothing_playing',
  PLAYING: 'playing',
  RATE_LIMITED: 'rate_limited',
  ADVERTISEMENT: 'advertisement',
  TOKEN_EXPIRED: 'token_expired',
} as const;
export type PlaybackState = (typeof PlaybackState)[keyof typeof PlaybackState];

/**
 * Widget status (`W`/`q` in the original — 15 members). Runtime strings are
 * byte-identical to the original.
 *
 * Task 8 (`state-machine.ts`) owns the *transition/display* logic; these enum
 * definitions live here so the store can be built and tested standalone. Task 8
 * should import (or move + re-export) these rather than redefining them.
 */
export const WidgetStatus = {
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  LOADING: 'LOADING',
  SUCCESS: 'SUCCESS',
  NO_SPOTIFY_ACCOUNT: 'NO_SPOTIFY_ACCOUNT',
  YTMD_NOT_CONNECTED: 'YTMD_NOT_CONNECTED',
  PROFILE_NOT_EXISTING: 'PROFILE_NOT_EXISTING',
  SPOTIFY_ERROR: 'SPOTIFY_ERROR',
  SPOTIFY_ACCOUNT_ERROR: 'SPOTIFY_ACCOUNT_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
  ACCOUNT_NOT_EXISTING: 'ACCOUNT_NOT_EXISTING',
  DISABLED_PROFILE: 'DISABLED_PROFILE',
  DISABLED_PRO_SKIN: 'DISABLED_PRO_SKIN',
  DISABLED_DISCORD_SKIN: 'DISABLED_DISCORD_SKIN',
  SPOTIFY_FREE_ACCOUNT: 'SPOTIFY_FREE_ACCOUNT',
  SPOTIFY_TOKEN_EXPIRED: 'SPOTIFY_TOKEN_EXPIRED',
} as const;
export type WidgetStatus = (typeof WidgetStatus)[keyof typeof WidgetStatus];

/* -------------------------------------------------------------------------- */
/* Track / raw item types                                                      */
/* -------------------------------------------------------------------------- */

/** Now-playing track. Field order matches the original `st` literal. */
export interface PlayerTrack {
  title: string;
  artist: string;
  duration: number;
  progress: number;
  cover_url: string;
  is_playing: boolean;
  canvas_url: string;
  id: string;
  isLiveStream: boolean;
}

/**
 * Raw Spotify API item stored on the store (`rawSpotifyItem`). The original
 * reads `.id`, `.name`, `.duration_ms`, `.explicit`, `.popularity`,
 * `.preview_url`, `.track_number`, `.disc_number` from it.
 */
export interface RawSpotifyItem {
  id?: string;
  name?: string;
  duration_ms?: number;
  explicit?: boolean;
  popularity?: number;
  preview_url?: string | null;
  track_number?: number;
  disc_number?: number;
  [key: string]: unknown;
}

/* -------------------------------------------------------------------------- */
/* Module-level progress clock (original `je` / `ae` / `Y`)                    */
/* -------------------------------------------------------------------------- */

/** Original `ns` — minimum jump before an incoming API progress is trusted. */
const PROGRESS_JUMP_THRESHOLD_MS = 1500;
/** Original `is` — tolerance for matching the last API-reported progress. */
const API_PROGRESS_TOLERANCE_MS = 250;

/** Original `je` — last known progress value (ms). */
let progressValue = 0;
/** Original `ae` — epoch ms the progress clock started (0 = stopped). */
let progressStartedAt = 0;
/** Original `Y` — last progress reported by an API (null = unknown). */
let lastApiProgress: number | null = null;

/** Original `re` — clamp a value into `[0, max]` (Infinity when max invalid). */
function clampProgress(value: number, max: number): number {
  const limit =
    typeof max === 'number' && Number.isFinite(max) ? max : Infinity;
  return Math.min(Math.max(0, value), limit);
}

/** Original `tt` — progress as a percentage of duration. */
function toPercent(progress: number, duration: number): number {
  return !duration || duration <= 0 ? 0 : (progress / duration) * 100;
}

/** Original `as` — value equality over every track field. */
function tracksEqual(a: PlayerTrack, b: PlayerTrack): boolean {
  return (
    a.title === b.title &&
    a.artist === b.artist &&
    a.duration === b.duration &&
    a.progress === b.progress &&
    a.cover_url === b.cover_url &&
    a.is_playing === b.is_playing &&
    a.canvas_url === b.canvas_url &&
    a.id === b.id &&
    a.isLiveStream === b.isLiveStream
  );
}

interface ProgressStateInput {
  startedAt?: number;
  lastApiProgress?: number | null;
}

/** Original `os` — update the progress clock. */
function setProgressState(progress: number, state?: ProgressStateInput): void {
  progressValue = progress;
  progressStartedAt = state?.startedAt ?? Date.now();
  lastApiProgress =
    state?.lastApiProgress === undefined
      ? lastApiProgress
      : state.lastApiProgress;
}

/** Original `ls` — clear the progress clock. */
function resetProgressState(): void {
  progressValue = 0;
  progressStartedAt = 0;
  lastApiProgress = null;
}

/** Original `cs` — interpolated current progress, clamped to duration. */
function getProgress(duration: number, isPlaying: boolean): number {
  return clampProgress(
    progressValue +
      (isPlaying && progressStartedAt > 0
        ? Math.max(0, Date.now() - progressStartedAt)
        : 0),
    duration,
  );
}

/**
 * Original `_r` (exported as `k` and consumed by the progress-bar component as
 * `Wt()` in `AmuseWidget.js:2975`). Returns the raw clock, not the interpolated
 * value.
 */
export function getProgressState(): { progress: number; startedAt: number } {
  return { progress: progressValue, startedAt: progressStartedAt };
}

/* -------------------------------------------------------------------------- */
/* Default track (original `st`)                                               */
/* -------------------------------------------------------------------------- */

/** Original `st` — the initial / reset track. */
export const DEFAULT_PLAYER_TRACK: PlayerTrack = {
  title: '-',
  artist: '-',
  duration: 1,
  progress: 0,
  cover_url: SPOTIFY_NO_COVER_IMAGE,
  is_playing: false,
  canvas_url: '',
  id: '',
  isLiveStream: false,
};

/* -------------------------------------------------------------------------- */
/* Store                                                                       */
/* -------------------------------------------------------------------------- */

export interface PlayerStore {
  currentTrack: PlayerTrack;
  playbackState: PlaybackState;
  widgetState: WidgetStatus;
  progress: number;
  progressUpdateVersion: number;
  rawSpotifyItem: RawSpotifyItem | null;
  activeMusicService: MusicSource | null;

  setCurrentTrack: (track: Partial<PlayerTrack>) => void;
  setDisplayedProgress: (progress: number) => void;
  setPlaybackState: (state: PlaybackState) => void;
  setWidgetState: (state: WidgetStatus) => void;
  setRawSpotifyItem: (item: RawSpotifyItem | null) => void;
  setActiveMusicService: (service: MusicSource | null) => void;
  resetCurrentTrack: () => void;
}

type PlayerStateCreator = StateCreator<
  PlayerStore,
  [['zustand/devtools', never]],
  [],
  PlayerStore
>;

const createPlayerState: PlayerStateCreator = (set) => ({
  currentTrack: DEFAULT_PLAYER_TRACK,
  playbackState: PlaybackState.NOTHING_PLAYING,
  widgetState: WidgetStatus.LOADING,
  progress: 0,
  progressUpdateVersion: 0,
  rawSpotifyItem: null,
  activeMusicService: null,

  setCurrentTrack: (track) =>
    set((state) => {
      const nextTrack: PlayerTrack = { ...state.currentTrack, ...track };
      const hasProgress = track.progress !== undefined;
      const duration = nextTrack.duration;
      const incomingProgress = hasProgress
        ? clampProgress(track.progress ?? 0, duration)
        : undefined;
      const idChanged =
        track.id !== undefined && track.id !== state.currentTrack.id;
      const playingChanged =
        track.is_playing !== undefined &&
        track.is_playing !== state.currentTrack.is_playing;
      const isPlaying = nextTrack.is_playing;
      const currentProgress = getProgress(
        state.currentTrack.duration,
        state.currentTrack.is_playing,
      );
      const matchesApiProgress =
        hasProgress &&
        isPlaying &&
        lastApiProgress !== null &&
        incomingProgress !== undefined &&
        Math.abs(incomingProgress - lastApiProgress) <=
          API_PROGRESS_TOLERANCE_MS;
      const isLargeJump =
        hasProgress &&
        isPlaying &&
        !idChanged &&
        !playingChanged &&
        !matchesApiProgress &&
        incomingProgress !== undefined &&
        Math.abs(incomingProgress - currentProgress) >
          PROGRESS_JUMP_THRESHOLD_MS;
      const firstProgress = hasProgress && state.progressUpdateVersion === 0;
      const pausedProgressChanged =
        hasProgress &&
        !isPlaying &&
        incomingProgress !== undefined &&
        incomingProgress !== state.currentTrack.progress;
      const shouldAdvance =
        idChanged ||
        playingChanged ||
        isLargeJump ||
        firstProgress ||
        pausedProgressChanged;
      const resolvedProgress = shouldAdvance
        ? (incomingProgress ?? (idChanged ? 0 : state.currentTrack.progress))
        : clampProgress(state.currentTrack.progress, duration);
      nextTrack.progress = clampProgress(resolvedProgress, duration);
      if (hasProgress) {
        lastApiProgress = incomingProgress ?? null;
      }
      if (shouldAdvance) {
        setProgressState(nextTrack.progress, {
          startedAt: isPlaying ? Date.now() : 0,
          lastApiProgress: incomingProgress ?? lastApiProgress,
        });
      }
      const nextState = {
        currentTrack: nextTrack,
        progress: toPercent(nextTrack.progress, duration),
        progressUpdateVersion: shouldAdvance
          ? state.progressUpdateVersion + 1
          : state.progressUpdateVersion,
      };
      if (
        tracksEqual(nextState.currentTrack, state.currentTrack) &&
        nextState.progress === state.progress &&
        nextState.progressUpdateVersion === state.progressUpdateVersion
      ) {
        return state;
      }
      return nextState;
    }),

  setDisplayedProgress: (progress) =>
    set((state) => {
      const clamped = clampProgress(progress, state.currentTrack.duration);
      const percent = toPercent(clamped, state.currentTrack.duration);
      if (
        clamped === state.currentTrack.progress &&
        percent === state.progress
      ) {
        return state;
      }
      return {
        currentTrack: { ...state.currentTrack, progress: clamped },
        progress: percent,
      };
    }),

  setPlaybackState: (state) =>
    set((current) =>
      current.playbackState === state ? current : { playbackState: state },
    ),

  setWidgetState: (state) =>
    set((current) =>
      current.widgetState === state ? current : { widgetState: state },
    ),

  setRawSpotifyItem: (item) => set({ rawSpotifyItem: item }),

  setActiveMusicService: (service) => set({ activeMusicService: service }),

  resetCurrentTrack: () =>
    set((state) => {
      resetProgressState();
      return {
        currentTrack: DEFAULT_PLAYER_TRACK,
        progress: 0,
        progressUpdateVersion: 0,
        rawSpotifyItem: null,
        activeMusicService: state.activeMusicService,
        playbackState: PlaybackState.NOTHING_PLAYING,
      };
    }),
});

/** Original store name passed to `devtools`. */
export const PLAYER_STORE_NAME = 'amuse-storage';

/** Module-level singleton hook — the original shares this exact instance. */
export const usePlayerStore = create<PlayerStore>()(
  devtools(createPlayerState, { name: PLAYER_STORE_NAME }),
);

/**
 * Vanilla store factory. The original only ever creates the singleton; this is
 * added so the React context can inject an isolated instance (tests, multiple
 * widget roots) without changing the singleton's semantics.
 */
export function createPlayerStore(): StoreApi<PlayerStore> {
  return createStore<PlayerStore>()(
    devtools(createPlayerState, { name: PLAYER_STORE_NAME }),
  );
}
