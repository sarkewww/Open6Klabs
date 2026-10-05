/**
 * Widget state machine + display branches — ported from the original Amuse
 * widget bundle.
 *
 * Source of truth (beautified, 7848-line readable copy):
 *   - `app/_reference/AmuseWidget.js`
 *       · error-message table `Is` ................ lines 77-167
 *       · nothing-playing defaults `Ne()` .......... lines 386-418
 *       · status colour `Hs()` ..................... lines 998-1013
 *       · playback colour `Vt()` ................... lines 984-997
 *       · overlay-content predicate `l()` .......... lines 7756-7757
 *       · top-level display branches `Di()` ........ lines 7800-7846
 *   - minified cross-check: `widget/assets/AmuseWidget-6oaOOCSo.js`
 *       · `Ne` at char offset ~8566
 *       · `l=()=>b===q.LOADING?!1:...` at char offset ~129100
 *
 * The two enums (`WidgetStatus` 15 members, `PlaybackState` 5 members) are
 * owned by `./store.ts` (Task 7) and are re-exported here — never redefined —
 * so there is exactly one source for the byte-exact runtime strings.
 *
 * `l()` (overlay content predicate), reproduced verbatim:
 *
 *   l = () =>
 *     b === q.LOADING ? !1
 *     : b !== q.SUCCESS ? !0
 *     : P && x ? !1
 *     : !g();
 *
 * where `b` = widgetState, `P` = `subscriptionPrivate.status === ACTIVE`,
 * `x` = `settings.general.hide_popup`, and `g()` = "the 5500 ms welcome-popup
 * delay has elapsed" (the `_i(5500)` timer, restarted on every widgetState
 * change). Consequently LOADING renders NO overlay content.
 */

import { SPOTIFY_NO_COVER_IMAGE } from '../settings/registry';
import { PlaybackState, WidgetStatus, type PlayerTrack } from './store';

/* Re-export the enums (value + type) from the single source in `store.ts`. */
export { PlaybackState, WidgetStatus };

/* -------------------------------------------------------------------------- */
/* Enum member lists (order mirrors the original `q` / `Q` enum declarations)  */
/* -------------------------------------------------------------------------- */

/** All 15 `WidgetStatus` runtime strings, in original declaration order. */
export const WIDGET_STATUS_VALUES: readonly WidgetStatus[] =
  Object.values(WidgetStatus);

/** All 5 `PlaybackState` runtime strings, in original declaration order. */
export const PLAYBACK_STATE_VALUES: readonly PlaybackState[] =
  Object.values(PlaybackState);

/* -------------------------------------------------------------------------- */
/* Error-message table (original `Is.WidgetErrorMessage.message`)              */
/* -------------------------------------------------------------------------- */

export interface WidgetErrorMessageImage {
  url: string;
}

export interface WidgetErrorMessage {
  id: string;
  state: WidgetStatus;
  message: string;
  description: string;
  images: readonly WidgetErrorMessageImage[];
}

/**
 * The original `Is` table — 11 entries, verbatim. Note it does NOT contain
 * `SESSION_EXPIRED`, `LOADING`, `SUCCESS` or `DISABLED_DISCORD_SKIN`: those
 * states exist in the enum but have no splash entry (the original renders an
 * empty popup shell for them). This is intentional parity, not an omission.
 */
export const WIDGET_ERROR_MESSAGES: readonly WidgetErrorMessage[] = [
  {
    id: '87',
    state: WidgetStatus.NO_SPOTIFY_ACCOUNT,
    message: 'Your Spotify account is not linked.',
    description: 'Please link your Spotify account to continue.',
    images: [],
  },
  {
    id: '88',
    state: WidgetStatus.PROFILE_NOT_EXISTING,
    message: "This profile doesn't exist.",
    description:
      'You either removed this profile or the URL is malformed. Try to again copy and paste the URL for the profile you want to use. If the problem persists, contact our support team.',
    images: [],
  },
  {
    id: '89',
    state: WidgetStatus.SPOTIFY_ERROR,
    message: 'There was an error with Spotify.',
    description: 'If the problem persists, contact our support team.',
    images: [],
  },
  {
    id: '90',
    state: WidgetStatus.SPOTIFY_ACCOUNT_ERROR,
    message: 'There was an error with your Spotify account.',
    description: 'Please contact our support team.',
    images: [],
  },
  {
    id: '91',
    state: WidgetStatus.SERVER_ERROR,
    message: '6K Labs is currently experiencing technical difficulties.',
    description:
      'Please try again later. If the problem persists, contact our support team.',
    images: [],
  },
  {
    id: '92',
    state: WidgetStatus.ACCOUNT_NOT_EXISTING,
    message: "This account doesn't exist.",
    description:
      'Copy the widget URL again and replace it with the current one.',
    images: [],
  },
  {
    id: '93',
    state: WidgetStatus.DISABLED_PROFILE,
    message: 'Upgrade to get unlimited profiles.',
    description:
      'Upgrade to a pro account to get unlimited profiles and more features.',
    images: [],
  },
  {
    id: '94',
    state: WidgetStatus.DISABLED_PRO_SKIN,
    message: 'Upgrade to Pro to use this skin',
    description: 'Upgrade to Pro to use this skin and get more out of Amuse.',
    images: [],
  },
  {
    id: '95',
    state: WidgetStatus.YTMD_NOT_CONNECTED,
    message: "You haven't connected the YouTube Music Desktop App",
    description:
      'Please visit the connection settings and follow the guide in the docs.',
    images: [],
  },
  {
    id: '96',
    state: WidgetStatus.SPOTIFY_FREE_ACCOUNT,
    message: 'Free Spotify Account Notice',
    description:
      'Please be patient while a workaround for free Spotify accounts is in development. Join the Discord to stay up to date.',
    images: [],
  },
  {
    id: '97',
    state: WidgetStatus.SPOTIFY_TOKEN_EXPIRED,
    message: 'Spotify Session Expired',
    description:
      'Your Spotify connection needs to be refreshed. Please go to your 6K Labs dashboard and reconnect Spotify.',
    images: [],
  },
];

/** Original `As` memo — look up the splash entry for a widget state. */
export function getWidgetErrorMessage(
  widgetState: WidgetStatus,
): WidgetErrorMessage | null {
  return (
    WIDGET_ERROR_MESSAGES.find((entry) => entry.state === widgetState) ?? null
  );
}

/**
 * Original `As` fallbacks: `message || "Information"` and
 * `description || "No additional information available."`.
 */
export function resolveWidgetErrorMessage(widgetState: WidgetStatus): {
  message: string;
  description: string;
  images: readonly WidgetErrorMessageImage[];
} | null {
  const entry = getWidgetErrorMessage(widgetState);
  if (!entry) return null;
  return {
    message: entry.message || 'Information',
    description: entry.description || 'No additional information available.',
    images: entry.images,
  };
}

/* -------------------------------------------------------------------------- */
/* Nothing-playing defaults (original `Ne()` + `vt`/`bt`/`St`)                 */
/* -------------------------------------------------------------------------- */

/** Original `vt` — `Ee` / `Tt` = `SPOTIFY_NO_COVER_IMAGE`. */
export const NOTHING_PLAYING_COVER = SPOTIFY_NO_COVER_IMAGE;
/** Original `bt` — "Nothing Playing". */
export const NOTHING_PLAYING_TITLE = 'Nothing Playing';
/** Original `St` — "Get the music started". */
export const NOTHING_PLAYING_ARTIST = 'Get the music started';

export interface NothingPlayingDefaults {
  cover: string;
  title: string;
  artist: string;
}

export const NOTHING_PLAYING_DEFAULTS: NothingPlayingDefaults = {
  cover: NOTHING_PLAYING_COVER,
  title: NOTHING_PLAYING_TITLE,
  artist: NOTHING_PLAYING_ARTIST,
};

export interface NothingPlayingSettings {
  nothing_playing_cover?: string | null;
  nothing_playing_title?: string | null;
  nothing_playing_artist?: string | null;
}

export interface NothingPlayingInput {
  settings?: NothingPlayingSettings | null;
  settingsLoading?: boolean;
  subscriptionLoading?: boolean;
  /** The store's current values — returned untouched while loading. */
  current?: NothingPlayingDefaults;
}

export interface NothingPlayingResolution extends NothingPlayingDefaults {
  isLoading: boolean;
}

/**
 * Port of `Ne()`: while settings/subscription are loading the current values
 * are kept; once loaded, `settings.nothing_playing_*` override the built-in
 * defaults (empty/falsy values fall back to the defaults).
 */
export function resolveNothingPlayingDefaults(
  input: NothingPlayingInput = {},
): NothingPlayingResolution {
  const isLoading = Boolean(input.settingsLoading || input.subscriptionLoading);
  if (isLoading) {
    return {
      ...(input.current ?? NOTHING_PLAYING_DEFAULTS),
      isLoading: true,
    };
  }
  const settings = input.settings;
  if (!settings) {
    return { ...NOTHING_PLAYING_DEFAULTS, isLoading: false };
  }
  return {
    cover: settings.nothing_playing_cover || NOTHING_PLAYING_COVER,
    title: settings.nothing_playing_title || NOTHING_PLAYING_TITLE,
    artist: settings.nothing_playing_artist || NOTHING_PLAYING_ARTIST,
    isLoading: false,
  };
}

/**
 * Port of the original `re` empty track (built from `Ne()` and passed to
 * `setCurrentTrack` when `playbackState === NOTHING_PLAYING`). It carries no
 * `id`/`isLiveStream`, exactly like the original literal.
 */
export function createNothingPlayingTrack(
  defaults: NothingPlayingDefaults = NOTHING_PLAYING_DEFAULTS,
): Partial<PlayerTrack> {
  return {
    title: defaults.title,
    artist: defaults.artist,
    cover_url: defaults.cover,
    duration: 0,
    progress: 0,
    is_playing: false,
    canvas_url: undefined,
  };
}

/* -------------------------------------------------------------------------- */
/* Display context + `l()` predicate                                           */
/* -------------------------------------------------------------------------- */

export interface WidgetDisplayContext {
  /** Original `m` — the `/api/widget/settings` query resolved. */
  hasSettings: boolean;
  /** Original `P` — `subscriptionPrivate.status === ACTIVE`. */
  subscriptionActive: boolean;
  /** Original `x` — `settings.general.hide_popup`. */
  hidePopup: boolean;
  /** Original `g()` — the 5500 ms welcome-popup delay elapsed. */
  welcomeDelayElapsed: boolean;
  /** Resolved `Ne()` values, used for the empty-playback track. */
  nothingPlaying: NothingPlayingDefaults;
}

export const DEFAULT_WIDGET_DISPLAY_CONTEXT: WidgetDisplayContext = {
  hasSettings: false,
  subscriptionActive: false,
  hidePopup: false,
  welcomeDelayElapsed: false,
  nothingPlaying: NOTHING_PLAYING_DEFAULTS,
};

function withContext(
  context: Partial<WidgetDisplayContext> = {},
): WidgetDisplayContext {
  return { ...DEFAULT_WIDGET_DISPLAY_CONTEXT, ...context };
}

/**
 * Port of the original `l()` overlay-content predicate.
 *
 *   LOADING                          -> false (render no content)
 *   any other non-SUCCESS state      -> true
 *   SUCCESS + active subscription + hide_popup -> false
 *   SUCCESS otherwise                -> !welcomeDelayElapsed
 */
export function shouldRenderWidgetContent(
  widgetState: WidgetStatus,
  context: Partial<WidgetDisplayContext> = {},
): boolean {
  const ctx = withContext(context);
  if (widgetState === WidgetStatus.LOADING) return false;
  if (widgetState !== WidgetStatus.SUCCESS) return true;
  if (ctx.subscriptionActive && ctx.hidePopup) return false;
  return !ctx.welcomeDelayElapsed;
}

/** The player branch: `settings && widgetState === SUCCESS` (original `Di`). */
export function shouldRenderPlayer(
  widgetState: WidgetStatus,
  hasSettings: boolean,
): boolean {
  return hasSettings && widgetState === WidgetStatus.SUCCESS;
}

/** Welcome popup: `l()` true AND widgetState === SUCCESS. */
export function shouldShowWelcomePopup(
  widgetState: WidgetStatus,
  context: Partial<WidgetDisplayContext> = {},
): boolean {
  return (
    widgetState === WidgetStatus.SUCCESS &&
    shouldRenderWidgetContent(widgetState, context)
  );
}

/** Error splash: `l()` true AND widgetState !== SUCCESS. */
export function shouldShowErrorMessage(
  widgetState: WidgetStatus,
  context: Partial<WidgetDisplayContext> = {},
): boolean {
  return (
    widgetState !== WidgetStatus.SUCCESS &&
    shouldRenderWidgetContent(widgetState, context)
  );
}

/* -------------------------------------------------------------------------- */
/* Truth-table resolver                                                        */
/* -------------------------------------------------------------------------- */

export type WidgetContentKind = 'loading' | 'none' | 'welcome' | 'error';

export interface WidgetDisplay {
  widgetState: WidgetStatus;
  playbackState: PlaybackState;
  contentKind: WidgetContentKind;
  /** `l()` — overlay content visible at all. */
  renderContent: boolean;
  /** `hasSettings && widgetState === SUCCESS`. */
  showPlayer: boolean;
  /** `l() && widgetState === SUCCESS`. */
  showWelcomePopup: boolean;
  /** `l() && widgetState !== SUCCESS`. */
  showErrorMessage: boolean;
  /** Welcome CTA: `!subscriptionActive`. */
  showSubscribeHint: boolean;
  /** Resolved splash entry (null when the state has none / not an error). */
  error: WidgetErrorMessage | null;
  /** Empty-playback default track when `playbackState === NOTHING_PLAYING`. */
  track: Partial<PlayerTrack> | null;
}

/**
 * The full display truth table: `(widgetState, playbackState, context)` ->
 * what the overlay shows, matching the original branches in `Di()` + `As`.
 */
export function resolveWidgetDisplay(
  widgetState: WidgetStatus,
  playbackState: PlaybackState,
  context: Partial<WidgetDisplayContext> = {},
): WidgetDisplay {
  const ctx = withContext(context);
  const renderContent = shouldRenderWidgetContent(widgetState, ctx);
  const isSuccess = widgetState === WidgetStatus.SUCCESS;
  const isLoading = widgetState === WidgetStatus.LOADING;

  const contentKind: WidgetContentKind = !renderContent
    ? isLoading
      ? 'loading'
      : 'none'
    : isSuccess
      ? 'welcome'
      : 'error';

  const showWelcomePopup = renderContent && isSuccess;
  const showErrorMessage = renderContent && !isSuccess;

  return {
    widgetState,
    playbackState,
    contentKind,
    renderContent,
    showPlayer: ctx.hasSettings && isSuccess,
    showWelcomePopup,
    showErrorMessage,
    showSubscribeHint: !ctx.subscriptionActive,
    error: showErrorMessage ? getWidgetErrorMessage(widgetState) : null,
    track:
      playbackState === PlaybackState.NOTHING_PLAYING
        ? createNothingPlayingTrack(ctx.nothingPlaying)
        : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Status / playback colours (original `Hs()` and `Vt()`)                      */
/* -------------------------------------------------------------------------- */

/** Original `Hs()` — widget-status debug colour. */
export function getWidgetStatusColor(widgetState: WidgetStatus): string {
  switch (widgetState) {
    case WidgetStatus.SUCCESS:
      return '#22c55e';
    case WidgetStatus.LOADING:
      return '#3b82f6';
    case WidgetStatus.SPOTIFY_FREE_ACCOUNT:
    case WidgetStatus.NO_SPOTIFY_ACCOUNT:
    case WidgetStatus.SPOTIFY_ERROR:
    case WidgetStatus.SPOTIFY_ACCOUNT_ERROR:
    case WidgetStatus.SERVER_ERROR:
      return '#ef4444';
    default:
      return '#f59e0b';
  }
}

/** Original `Vt()` — playback-state debug colour. */
export function getPlaybackStateColor(playbackState: PlaybackState): string {
  switch (playbackState) {
    case PlaybackState.PLAYING:
      return '#22c55e';
    case PlaybackState.NOTHING_PLAYING:
      return '#6b7280';
    case PlaybackState.RATE_LIMITED:
      return '#ef4444';
    case PlaybackState.ADVERTISEMENT:
      return '#f59e0b';
    default:
      return '#94a3b8';
  }
}
