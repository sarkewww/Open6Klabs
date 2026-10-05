import { describe, expect, it } from 'vitest';
import { SPOTIFY_NO_COVER_IMAGE } from '../settings/registry';
import {
  NOTHING_PLAYING_ARTIST,
  NOTHING_PLAYING_COVER,
  NOTHING_PLAYING_DEFAULTS,
  NOTHING_PLAYING_TITLE,
  PLAYBACK_STATE_VALUES,
  PlaybackState,
  WIDGET_ERROR_MESSAGES,
  WIDGET_STATUS_VALUES,
  WidgetStatus,
  createNothingPlayingTrack,
  getPlaybackStateColor,
  getWidgetErrorMessage,
  getWidgetStatusColor,
  resolveNothingPlayingDefaults,
  resolveWidgetDisplay,
  shouldRenderPlayer,
  shouldRenderWidgetContent,
} from './state-machine';
import {
  PlaybackState as StorePlaybackState,
  WidgetStatus as StoreWidgetStatus,
} from './store';

/* -------------------------------------------------------------------------- */
/* Enum completeness — exact strings, exact order, no redefinition             */
/* -------------------------------------------------------------------------- */

const EXPECTED_WIDGET_STATUSES = [
  'SESSION_EXPIRED',
  'LOADING',
  'SUCCESS',
  'NO_SPOTIFY_ACCOUNT',
  'YTMD_NOT_CONNECTED',
  'PROFILE_NOT_EXISTING',
  'SPOTIFY_ERROR',
  'SPOTIFY_ACCOUNT_ERROR',
  'SERVER_ERROR',
  'ACCOUNT_NOT_EXISTING',
  'DISABLED_PROFILE',
  'DISABLED_PRO_SKIN',
  'DISABLED_DISCORD_SKIN',
  'SPOTIFY_FREE_ACCOUNT',
  'SPOTIFY_TOKEN_EXPIRED',
] as const;

const EXPECTED_PLAYBACK_STATES = [
  'nothing_playing',
  'playing',
  'rate_limited',
  'advertisement',
  'token_expired',
] as const;

describe('state enums', () => {
  it('exposes all 15 WidgetStatus members with exact strings and order', () => {
    expect(Object.values(WidgetStatus)).toEqual([...EXPECTED_WIDGET_STATUSES]);
    expect(WIDGET_STATUS_VALUES).toEqual([...EXPECTED_WIDGET_STATUSES]);
    expect(WIDGET_STATUS_VALUES).toHaveLength(15);
    expect(new Set(WIDGET_STATUS_VALUES).size).toBe(15);
  });

  it('exposes all 5 PlaybackState members with exact strings and order', () => {
    expect(Object.values(PlaybackState)).toEqual([...EXPECTED_PLAYBACK_STATES]);
    expect(PLAYBACK_STATE_VALUES).toEqual([...EXPECTED_PLAYBACK_STATES]);
    expect(PLAYBACK_STATE_VALUES).toHaveLength(5);
    expect(new Set(PLAYBACK_STATE_VALUES).size).toBe(5);
  });

  it('re-exports the store enums by identity (no redefinition)', () => {
    expect(WidgetStatus).toBe(StoreWidgetStatus);
    expect(PlaybackState).toBe(StorePlaybackState);
  });
});

/* -------------------------------------------------------------------------- */
/* Error-message table (original `Is`)                                         */
/* -------------------------------------------------------------------------- */

describe('WIDGET_ERROR_MESSAGES', () => {
  it('has the original 11 splash entries with byte-identical ids/states', () => {
    expect(WIDGET_ERROR_MESSAGES).toHaveLength(11);
    expect(WIDGET_ERROR_MESSAGES.map((e) => e.state)).toEqual([
      'NO_SPOTIFY_ACCOUNT',
      'PROFILE_NOT_EXISTING',
      'SPOTIFY_ERROR',
      'SPOTIFY_ACCOUNT_ERROR',
      'SERVER_ERROR',
      'ACCOUNT_NOT_EXISTING',
      'DISABLED_PROFILE',
      'DISABLED_PRO_SKIN',
      'YTMD_NOT_CONNECTED',
      'SPOTIFY_FREE_ACCOUNT',
      'SPOTIFY_TOKEN_EXPIRED',
    ]);
    expect(WIDGET_ERROR_MESSAGES.map((e) => e.id)).toEqual([
      '87',
      '88',
      '89',
      '90',
      '91',
      '92',
      '93',
      '94',
      '95',
      '96',
      '97',
    ]);
  });

  it('keeps DISABLED_PRO_SKIN distinct from DISABLED_PROFILE', () => {
    const proSkin = getWidgetErrorMessage(WidgetStatus.DISABLED_PRO_SKIN);
    const proProfile = getWidgetErrorMessage(WidgetStatus.DISABLED_PROFILE);

    expect(proSkin).not.toBeNull();
    expect(proProfile).not.toBeNull();
    expect(proSkin?.state).toBe('DISABLED_PRO_SKIN');
    expect(proProfile?.state).toBe('DISABLED_PROFILE');
    expect(proSkin?.message).toBe('Upgrade to Pro to use this skin');
    expect(proProfile?.message).toBe('Upgrade to get unlimited profiles.');
    expect(proSkin?.state).not.toBe(proProfile?.state);
    expect(proSkin?.id).not.toBe(proProfile?.id);
  });

  it('has no splash entry for LOADING/SUCCESS/SESSION_EXPIRED/DISABLED_DISCORD_SKIN', () => {
    expect(getWidgetErrorMessage(WidgetStatus.LOADING)).toBeNull();
    expect(getWidgetErrorMessage(WidgetStatus.SUCCESS)).toBeNull();
    expect(getWidgetErrorMessage(WidgetStatus.SESSION_EXPIRED)).toBeNull();
    expect(
      getWidgetErrorMessage(WidgetStatus.DISABLED_DISCORD_SKIN),
    ).toBeNull();
  });

  it('preserves verbatim message text for every entry', () => {
    const byState = new Map(
      WIDGET_ERROR_MESSAGES.map((e) => [e.state, e.message]),
    );
    expect(byState.get(WidgetStatus.NO_SPOTIFY_ACCOUNT)).toBe(
      'Your Spotify account is not linked.',
    );
    expect(byState.get(WidgetStatus.PROFILE_NOT_EXISTING)).toBe(
      "This profile doesn't exist.",
    );
    expect(byState.get(WidgetStatus.SPOTIFY_TOKEN_EXPIRED)).toBe(
      'Spotify Session Expired',
    );
    expect(byState.get(WidgetStatus.YTMD_NOT_CONNECTED)).toBe(
      "You haven't connected the YouTube Music Desktop App",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* `l()` predicate — LOADING renders no content                                */
/* -------------------------------------------------------------------------- */

describe('shouldRenderWidgetContent (original l())', () => {
  const allContexts = [
    {},
    { subscriptionActive: true, hidePopup: true, welcomeDelayElapsed: false },
    { subscriptionActive: false, hidePopup: false, welcomeDelayElapsed: true },
    { subscriptionActive: true, hidePopup: false, welcomeDelayElapsed: true },
    { subscriptionActive: false, hidePopup: true, welcomeDelayElapsed: false },
  ] as const;

  it('returns false for LOADING under every context combination', () => {
    for (const ctx of allContexts) {
      expect(shouldRenderWidgetContent(WidgetStatus.LOADING, ctx)).toBe(false);
    }
  });

  it('returns true for every non-SUCCESS, non-LOADING state', () => {
    const errorStates = WIDGET_STATUS_VALUES.filter(
      (s) => s !== WidgetStatus.LOADING && s !== WidgetStatus.SUCCESS,
    );
    expect(errorStates).toHaveLength(13);
    for (const state of errorStates) {
      for (const ctx of allContexts) {
        expect(shouldRenderWidgetContent(state, ctx)).toBe(true);
      }
    }
  });

  it('gates SUCCESS on the welcome delay and the hide_popup override', () => {
    // Default: delay not elapsed -> popup visible.
    expect(shouldRenderWidgetContent(WidgetStatus.SUCCESS)).toBe(true);
    // Delay elapsed -> popup hidden.
    expect(
      shouldRenderWidgetContent(WidgetStatus.SUCCESS, {
        welcomeDelayElapsed: true,
      }),
    ).toBe(false);
    // Active subscription + hide_popup -> hidden even before the delay.
    expect(
      shouldRenderWidgetContent(WidgetStatus.SUCCESS, {
        subscriptionActive: true,
        hidePopup: true,
      }),
    ).toBe(false);
    // Active subscription without hide_popup -> still governed by the delay.
    expect(
      shouldRenderWidgetContent(WidgetStatus.SUCCESS, {
        subscriptionActive: true,
        hidePopup: false,
        welcomeDelayElapsed: false,
      }),
    ).toBe(true);
    // hide_popup alone (no active subscription) -> still governed by delay.
    expect(
      shouldRenderWidgetContent(WidgetStatus.SUCCESS, {
        subscriptionActive: false,
        hidePopup: true,
        welcomeDelayElapsed: false,
      }),
    ).toBe(true);
  });
});

describe('shouldRenderPlayer (original Di branch)', () => {
  it('renders the player only with settings AND SUCCESS', () => {
    expect(shouldRenderPlayer(WidgetStatus.SUCCESS, true)).toBe(true);
    expect(shouldRenderPlayer(WidgetStatus.SUCCESS, false)).toBe(false);
    for (const state of WIDGET_STATUS_VALUES) {
      if (state === WidgetStatus.SUCCESS) continue;
      expect(shouldRenderPlayer(state, true)).toBe(false);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* `Ne()` nothing-playing defaults                                             */
/* -------------------------------------------------------------------------- */

describe('nothing-playing defaults (original Ne())', () => {
  it('falls back to the built-in defaults without settings', () => {
    expect(resolveNothingPlayingDefaults()).toEqual({
      cover: SPOTIFY_NO_COVER_IMAGE,
      title: NOTHING_PLAYING_TITLE,
      artist: NOTHING_PLAYING_ARTIST,
      isLoading: false,
    });
    expect(NOTHING_PLAYING_DEFAULTS).toEqual({
      cover: SPOTIFY_NO_COVER_IMAGE,
      title: 'Nothing Playing',
      artist: 'Get the music started',
    });
    expect(NOTHING_PLAYING_COVER).toBe(SPOTIFY_NO_COVER_IMAGE);
  });

  it('applies settings overrides and falls back on falsy values', () => {
    expect(
      resolveNothingPlayingDefaults({
        settings: {
          nothing_playing_cover: '/assets/custom.svg',
          nothing_playing_title: 'Custom title',
          nothing_playing_artist: 'Custom artist',
        },
      }),
    ).toEqual({
      cover: '/assets/custom.svg',
      title: 'Custom title',
      artist: 'Custom artist',
      isLoading: false,
    });

    expect(
      resolveNothingPlayingDefaults({
        settings: {
          nothing_playing_cover: '',
          nothing_playing_title: null,
          nothing_playing_artist: undefined,
        },
      }),
    ).toEqual({
      cover: SPOTIFY_NO_COVER_IMAGE,
      title: NOTHING_PLAYING_TITLE,
      artist: NOTHING_PLAYING_ARTIST,
      isLoading: false,
    });
  });

  it('keeps the current values untouched while loading', () => {
    const current = {
      cover: '/assets/current.svg',
      title: 'Current',
      artist: 'Current artist',
    };
    expect(
      resolveNothingPlayingDefaults({
        settings: { nothing_playing_title: 'Should not apply' },
        settingsLoading: true,
        current,
      }),
    ).toEqual({ ...current, isLoading: true });
    expect(
      resolveNothingPlayingDefaults({
        settings: { nothing_playing_title: 'Should not apply' },
        subscriptionLoading: true,
      }),
    ).toEqual({ ...NOTHING_PLAYING_DEFAULTS, isLoading: true });
  });

  it('builds the original empty track shape', () => {
    expect(createNothingPlayingTrack()).toEqual({
      title: NOTHING_PLAYING_TITLE,
      artist: NOTHING_PLAYING_ARTIST,
      cover_url: SPOTIFY_NO_COVER_IMAGE,
      duration: 0,
      progress: 0,
      is_playing: false,
      canvas_url: undefined,
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Truth table resolver                                                        */
/* -------------------------------------------------------------------------- */

describe('resolveWidgetDisplay truth table', () => {
  it('LOADING shows no content and no player', () => {
    const display = resolveWidgetDisplay(
      WidgetStatus.LOADING,
      PlaybackState.NOTHING_PLAYING,
      { hasSettings: true },
    );
    expect(display.contentKind).toBe('loading');
    expect(display.renderContent).toBe(false);
    expect(display.showWelcomePopup).toBe(false);
    expect(display.showErrorMessage).toBe(false);
    expect(display.showPlayer).toBe(false);
    expect(display.error).toBeNull();
  });

  it('SUCCESS shows the welcome popup and the player once settings load', () => {
    const display = resolveWidgetDisplay(
      WidgetStatus.SUCCESS,
      PlaybackState.PLAYING,
      { hasSettings: true },
    );
    expect(display.contentKind).toBe('welcome');
    expect(display.renderContent).toBe(true);
    expect(display.showWelcomePopup).toBe(true);
    expect(display.showErrorMessage).toBe(false);
    expect(display.showPlayer).toBe(true);
    expect(display.showSubscribeHint).toBe(true);
    expect(display.track).toBeNull();
  });

  it('SUCCESS with an active subscription drops the subscribe hint', () => {
    const display = resolveWidgetDisplay(
      WidgetStatus.SUCCESS,
      PlaybackState.PLAYING,
      { hasSettings: true, subscriptionActive: true },
    );
    expect(display.showSubscribeHint).toBe(false);
  });

  it('SUCCESS after the welcome delay shows neither popup nor player-less shell', () => {
    const display = resolveWidgetDisplay(
      WidgetStatus.SUCCESS,
      PlaybackState.PLAYING,
      { hasSettings: true, welcomeDelayElapsed: true },
    );
    expect(display.contentKind).toBe('none');
    expect(display.renderContent).toBe(false);
    expect(display.showWelcomePopup).toBe(false);
    // The player itself is independent of the popup delay.
    expect(display.showPlayer).toBe(true);
  });

  it('error states show their splash entry and no player', () => {
    for (const state of WIDGET_STATUS_VALUES) {
      if (state === WidgetStatus.LOADING || state === WidgetStatus.SUCCESS) {
        continue;
      }
      const display = resolveWidgetDisplay(
        state,
        PlaybackState.NOTHING_PLAYING,
        { hasSettings: true },
      );
      expect(display.contentKind).toBe('error');
      expect(display.showErrorMessage).toBe(true);
      expect(display.showPlayer).toBe(false);
    }
  });

  it('DISABLED_PRO_SKIN does not collapse into DISABLED_PROFILE', () => {
    const proSkin = resolveWidgetDisplay(
      WidgetStatus.DISABLED_PRO_SKIN,
      PlaybackState.NOTHING_PLAYING,
    );
    const proProfile = resolveWidgetDisplay(
      WidgetStatus.DISABLED_PROFILE,
      PlaybackState.NOTHING_PLAYING,
    );
    expect(proSkin.error?.state).toBe('DISABLED_PRO_SKIN');
    expect(proProfile.error?.state).toBe('DISABLED_PROFILE');
    expect(proSkin.error?.message).not.toBe(proProfile.error?.message);
  });

  it('SESSION_EXPIRED / DISABLED_DISCORD_SKIN show an empty error shell', () => {
    for (const state of [
      WidgetStatus.SESSION_EXPIRED,
      WidgetStatus.DISABLED_DISCORD_SKIN,
    ]) {
      const display = resolveWidgetDisplay(
        state,
        PlaybackState.NOTHING_PLAYING,
      );
      expect(display.contentKind).toBe('error');
      expect(display.showErrorMessage).toBe(true);
      expect(display.error).toBeNull();
    }
  });

  it('returns the empty-playback track only for nothing_playing', () => {
    for (const playbackState of PLAYBACK_STATE_VALUES) {
      const display = resolveWidgetDisplay(
        WidgetStatus.SUCCESS,
        playbackState,
        { nothingPlaying: NOTHING_PLAYING_DEFAULTS },
      );
      if (playbackState === PlaybackState.NOTHING_PLAYING) {
        expect(display.track).toEqual(
          createNothingPlayingTrack(NOTHING_PLAYING_DEFAULTS),
        );
      } else {
        expect(display.track).toBeNull();
      }
    }
  });

  it('uses the resolved Ne() values for the empty track', () => {
    const display = resolveWidgetDisplay(
      WidgetStatus.SUCCESS,
      PlaybackState.NOTHING_PLAYING,
      {
        nothingPlaying: {
          cover: '/assets/custom.svg',
          title: 'Custom',
          artist: 'Custom artist',
        },
      },
    );
    expect(display.track).toEqual({
      title: 'Custom',
      artist: 'Custom artist',
      cover_url: '/assets/custom.svg',
      duration: 0,
      progress: 0,
      is_playing: false,
      canvas_url: undefined,
    });
  });

  it('resolves every one of the 15 states without throwing', () => {
    for (const state of WIDGET_STATUS_VALUES) {
      const display = resolveWidgetDisplay(state, PlaybackState.PLAYING);
      expect(display.widgetState).toBe(state);
      expect(display.playbackState).toBe(PlaybackState.PLAYING);
      expect(['loading', 'none', 'welcome', 'error']).toContain(
        display.contentKind,
      );
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Colour branches (original Hs() / Vt())                                      */
/* -------------------------------------------------------------------------- */

describe('display colours', () => {
  it('maps widget statuses to the original Hs() colours', () => {
    expect(getWidgetStatusColor(WidgetStatus.SUCCESS)).toBe('#22c55e');
    expect(getWidgetStatusColor(WidgetStatus.LOADING)).toBe('#3b82f6');
    for (const state of [
      WidgetStatus.SPOTIFY_FREE_ACCOUNT,
      WidgetStatus.NO_SPOTIFY_ACCOUNT,
      WidgetStatus.SPOTIFY_ERROR,
      WidgetStatus.SPOTIFY_ACCOUNT_ERROR,
      WidgetStatus.SERVER_ERROR,
    ]) {
      expect(getWidgetStatusColor(state)).toBe('#ef4444');
    }
    // Everything else falls through to amber.
    expect(getWidgetStatusColor(WidgetStatus.DISABLED_PROFILE)).toBe('#f59e0b');
    expect(getWidgetStatusColor(WidgetStatus.DISABLED_PRO_SKIN)).toBe(
      '#f59e0b',
    );
    expect(getWidgetStatusColor(WidgetStatus.SPOTIFY_TOKEN_EXPIRED)).toBe(
      '#f59e0b',
    );
  });

  it('maps playback states to the original Vt() colours', () => {
    expect(getPlaybackStateColor(PlaybackState.PLAYING)).toBe('#22c55e');
    expect(getPlaybackStateColor(PlaybackState.NOTHING_PLAYING)).toBe(
      '#6b7280',
    );
    expect(getPlaybackStateColor(PlaybackState.RATE_LIMITED)).toBe('#ef4444');
    expect(getPlaybackStateColor(PlaybackState.ADVERTISEMENT)).toBe('#f59e0b');
    expect(getPlaybackStateColor(PlaybackState.TOKEN_EXPIRED)).toBe('#94a3b8');
  });
});
