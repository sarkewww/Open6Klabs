/**
 * Pear Desktop source adapter — ported from the original Amuse widget bundle.
 *
 * Source of truth (beautified, readable copy):
 *   `app/_reference/AmuseWidget.js` lines 3115-3268 (the `ni()` hook — its
 *   `useQuery({ queryKey: ["pear-desktop-song"] })` block):
 *
 *     const { data: d } = await Ue.get("http://localhost:9863/query");
 *     d.track.duration == 0
 *       ? o({ isLiveStream: !0, progress: 100, duration: 100 })
 *       : o({ isLiveStream: !1 });
 *     d.player.hasSong || d.track.title != ""
 *       ? (ad
 *           ? o({ id, title: "Ad Break", artist: "Music will resume shortly",
 *                 cover_url: Tt, progress: 0, duration: 0, is_playing: !isPaused })
 *           : o({ id, title, artist, duration: d.track.duration * 1e3,
 *                 progress: d.player.seekbarCurrentPosition * 1e3,
 *                 is_playing: !d.player.isPaused }))
 *       : c(D.NOTHING_PLAYING);
 *
 * Minified cross-check: `widget/assets/AmuseWidget-6oaOOCSo.js` @52244
 * (request), @52244-53700 (mapping), @53890 (poll: `refetchInterval: 1e3`,
 * `refetchIntervalInBackground: !0`).
 *
 * Ad detection (verbatim negated condition from the original): an item is an
 * ad when `author === "Video will play after ad"` OR `isAdvertisement` is
 * truthy OR the RAW `duration` (seconds, pre-×1000) is one of 10/15/20/30.
 *
 * Documented deviations from the minified bundle (per plan Todo 9, which is
 * authoritative for this rewrite):
 *   - Live stream (`duration === 0`) emits exactly
 *     `{ isLiveStream: true, progress: 100, duration: 100 }`. In the original
 *     the following generic `o({ duration: d.track.duration * 1e3, ... })`
 *     would overwrite those with `0`/`0`; the plan mandates the 100/100 values
 *     (which the original's own first override already sets).
 *   - The title-cleaning helper chain (`removeOfficialVideoFromTitle` →
 *     `extractTitleFromMultiTitle` → `extractBeforeFirstDot`) lives in the
 *     PlayerWindows98 hook (`Ke()`) and is out of scope for Todo 9; the raw
 *     `track.title` / `track.author` are mapped straight through, exactly as
 *     the plan's field list specifies.
 *   - `widgetState` is always `SUCCESS`: the original calls
 *     `h(q.SUCCESS)` (setWidgetState) *before* the try/catch, so every branch —
 *     including empty playback and a thrown fetch — leaves it `SUCCESS`. Only
 *     `playbackState` changes.
 *   - The normal branch's `title === ""` sub-case omits `title`/`artist` in the
 *     original (`o({ id, duration, progress, is_playing })`,
 *     `AmuseWidget.js:3206-3212`); this adapter returns a full `PlayerTrack`, so
 *     it always carries `title`/`artist`. The outer
 *     `hasSong || title != ""` gate is reproduced verbatim.
 */

import axios from 'axios';
import {
  DEFAULT_PLAYER_TRACK,
  PlaybackState,
  WidgetStatus,
  type PlayerTrack,
} from '../store';
import {
  createNothingPlayingTrack,
  NOTHING_PLAYING_DEFAULTS,
  type NothingPlayingDefaults,
} from '../state-machine';

/* -------------------------------------------------------------------------- */
/* Constants (verbatim from the original)                                      */
/* -------------------------------------------------------------------------- */

/** Original request URL — never change. */
export const PEAR_DESKTOP_QUERY_URL = 'http://localhost:9863/query';

/** Original `refetchInterval: 1e3` (ms). */
export const PEAR_DESKTOP_POLL_INTERVAL_MS = 1000;

/** Original `Tt` (`app/_reference/AmuseWidget.js:333`) — ad cover asset. */
export const PEAR_DESKTOP_AD_COVER = '/assets/spotify_ad_cover-B6syg7Z1.svg';

/** Original ad sentinel author. */
export const PEAR_DESKTOP_AD_AUTHOR = 'Video will play after ad';

/** Original ad `duration` set (RAW seconds, pre-×1000). */
export const PEAR_DESKTOP_AD_DURATIONS: readonly number[] = [10, 15, 20, 30];

/* -------------------------------------------------------------------------- */
/* Raw payload shape (`data` from GET /query)                                  */
/* -------------------------------------------------------------------------- */

export interface PearDesktopTrack {
  id: string;
  title: string;
  author: string;
  /** RAW seconds; the adapter multiplies by 1000 for the store. */
  duration: number;
  isAdvertisement?: boolean;
  cover: string;
}

export interface PearDesktopPlayer {
  hasSong: boolean;
  /** RAW seconds; the adapter multiplies by 1000 for the store. */
  seekbarCurrentPosition: number;
  isPaused: boolean;
}

export interface PearDesktopQuery {
  track: PearDesktopTrack;
  player: PearDesktopPlayer;
}

/* -------------------------------------------------------------------------- */
/* Adapter output (maps onto the store / state machine)                        */
/* -------------------------------------------------------------------------- */

export interface PearDesktopResult {
  track: PlayerTrack;
  playbackState: PlaybackState;
  widgetState: WidgetStatus;
}

/** Injectable HTTP call so Vitest can mock it (default hits the real URL). */
export type PearDesktopFetcher = () => Promise<PearDesktopQuery>;

async function defaultPearDesktopFetcher(): Promise<PearDesktopQuery> {
  const { data } = await axios.get<PearDesktopQuery>(PEAR_DESKTOP_QUERY_URL);
  return data;
}

/* -------------------------------------------------------------------------- */
/* Pure mapping                                                                */
/* -------------------------------------------------------------------------- */

/** Original negated condition, restored to its positive form. */
export function isPearDesktopAdvertisement(
  track: PearDesktopTrack | undefined,
): boolean {
  if (!track) return false;
  return (
    track.author === PEAR_DESKTOP_AD_AUTHOR ||
    track.isAdvertisement === true ||
    PEAR_DESKTOP_AD_DURATIONS.includes(track.duration)
  );
}

/** Full `PlayerTrack` from a partial, seeded by the store default. */
function buildTrack(overrides: Partial<PlayerTrack>): PlayerTrack {
  return { ...DEFAULT_PLAYER_TRACK, ...overrides };
}

/** Empty-playback result (original `c(D.NOTHING_PLAYING)` + `o(P)` effect). */
export function createPearDesktopNothingPlayingResult(
  nothingPlaying: NothingPlayingDefaults = NOTHING_PLAYING_DEFAULTS,
): PearDesktopResult {
  const empty = createNothingPlayingTrack(nothingPlaying);
  return {
    track: buildTrack({ ...empty, canvas_url: '' }),
    playbackState: PlaybackState.NOTHING_PLAYING,
    widgetState: WidgetStatus.SUCCESS,
  };
}

/**
 * Map one `GET http://localhost:9863/query` payload to the store shape.
 * Branch order mirrors the original's final resolved state:
 *   empty playback (gated) → advertisement → live stream → normal.
 */
export function mapPearDesktopResponse(
  data: Partial<PearDesktopQuery> | null | undefined,
  options: { nothingPlaying?: NothingPlayingDefaults } = {},
): PearDesktopResult {
  const track = data?.track;
  const player = data?.player;

  const duration = track?.duration ?? 0;
  const progress = player?.seekbarCurrentPosition ?? 0;
  const isPlaying = player?.isPaused !== true;

  // Original outer gate: `hasSong || title != ""`. Empty playback otherwise.
  const hasSong = player?.hasSong === true;
  const title = track?.title ?? '';
  if (!hasSong && title === '') {
    return createPearDesktopNothingPlayingResult(options.nothingPlaying);
  }

  // Advertisement — `Ad Break` / `Music will resume shortly` + ADVERTISEMENT.
  if (isPearDesktopAdvertisement(track)) {
    return {
      track: buildTrack({
        id: track?.id ?? '',
        title: 'Ad Break',
        artist: 'Music will resume shortly',
        cover_url: PEAR_DESKTOP_AD_COVER,
        progress: 0,
        duration: 0,
        is_playing: isPlaying,
        isLiveStream: duration === 0,
      }),
      playbackState: PlaybackState.ADVERTISEMENT,
      widgetState: WidgetStatus.SUCCESS,
    };
  }

  // Live stream — plan-mandated `{ isLiveStream: true, progress: 100, duration: 100 }`.
  if (duration === 0) {
    return {
      track: buildTrack({
        id: track?.id ?? '',
        title,
        artist: track?.author ?? '',
        cover_url: track?.cover ?? DEFAULT_PLAYER_TRACK.cover_url,
        progress: 100,
        duration: 100,
        is_playing: isPlaying,
        isLiveStream: true,
      }),
      playbackState: PlaybackState.PLAYING,
      widgetState: WidgetStatus.SUCCESS,
    };
  }

  // Normal — RAW seconds × 1000.
  return {
    track: buildTrack({
      id: track?.id ?? '',
      title,
      artist: track?.author ?? '',
      cover_url: track?.cover ?? DEFAULT_PLAYER_TRACK.cover_url,
      progress: progress * 1000,
      duration: duration * 1000,
      is_playing: isPlaying,
      isLiveStream: false,
    }),
    playbackState: PlaybackState.PLAYING,
    widgetState: WidgetStatus.SUCCESS,
  };
}

/* -------------------------------------------------------------------------- */
/* Polling adapter (start / stop, 1000 ms, continues in background)            */
/* -------------------------------------------------------------------------- */

export interface PearDesktopAdapterOptions {
  /** Injectable HTTP call; defaults to the real `GET /query` via axios. */
  fetcher?: PearDesktopFetcher;
  /** Poll interval in ms; defaults to `PEAR_DESKTOP_POLL_INTERVAL_MS` (1000). */
  intervalMs?: number;
  /** Called with every mapped result (including the empty/error fallback). */
  onUpdate?: (result: PearDesktopResult) => void;
  /** Called with the raw error whenever a poll throws. */
  onError?: (error: unknown) => void;
  /** Nothing-playing defaults forwarded to the empty-playback branch. */
  nothingPlaying?: NothingPlayingDefaults;
}

export interface PearDesktopAdapter {
  readonly isRunning: boolean;
  /** Poll once immediately and then every `intervalMs` (background-safe). */
  start(): void;
  stop(): void;
  /** Single fetch + map; never throws (a thrown fetch → NOTHING_PLAYING). */
  pollOnce(): Promise<PearDesktopResult>;
}

class PearDesktopAdapterImpl implements PearDesktopAdapter {
  private readonly fetcher: PearDesktopFetcher;
  private readonly intervalMs: number;
  private readonly onUpdate?: (result: PearDesktopResult) => void;
  private readonly onError?: (error: unknown) => void;
  private readonly nothingPlaying?: NothingPlayingDefaults;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: PearDesktopAdapterOptions) {
    this.fetcher = options.fetcher ?? defaultPearDesktopFetcher;
    this.intervalMs = options.intervalMs ?? PEAR_DESKTOP_POLL_INTERVAL_MS;
    this.onUpdate = options.onUpdate;
    this.onError = options.onError;
    this.nothingPlaying = options.nothingPlaying;
  }

  get isRunning(): boolean {
    return this.timer !== null;
  }

  async pollOnce(): Promise<PearDesktopResult> {
    try {
      const data = await this.fetcher();
      const result = mapPearDesktopResponse(data, {
        nothingPlaying: this.nothingPlaying,
      });
      this.onUpdate?.(result);
      return result;
    } catch (error) {
      // Original catch: `c(D.NOTHING_PLAYING)` + console.error.
      console.error('Error fetching pear-desktop song data:', error);
      const result = createPearDesktopNothingPlayingResult(this.nothingPlaying);
      this.onUpdate?.(result);
      this.onError?.(error);
      return result;
    }
  }

  start(): void {
    if (this.timer !== null) return;
    void this.pollOnce();
    // `setInterval` keeps firing regardless of tab visibility, matching the
    // original `refetchIntervalInBackground: true`.
    this.timer = setInterval(() => {
      void this.pollOnce();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}

/** Factory the runtime can start/stop. */
export function createPearDesktopAdapter(
  options: PearDesktopAdapterOptions = {},
): PearDesktopAdapter {
  return new PearDesktopAdapterImpl(options);
}
