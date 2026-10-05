import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * `react-palette`'s `usePalette` uses `node-vibrant` (Image + canvas), which is
 * a no-op in jsdom. Stub it so the colour context resolves deterministically to
 * the default palette — the Windows 98 skin does not depend on image
 * extraction.
 */
vi.mock('react-palette', () => ({
  usePalette: () => ({ data: {}, loading: false, error: undefined }),
}));

import { ProfileSettingsProvider } from '../profile/context';
import type { AmuseProfileSettings } from '../profile/settings';
import { PlayerStoreProvider } from '../player/context';
import {
  createPlayerStore,
  PlaybackState,
  WidgetStatus,
  type PlayerTrack,
} from '../player/store';
import {
  getVisibleSkins,
  isSkinLocked,
  Skin,
  SKINS,
  SkinTier,
  WINDOWS_98_PLAYER,
} from '../settings/registry';
import { SubscriptionStatus } from '../types/subscription';
import { Cover } from '../types/user';
import {
  ditherPixels,
  mapToPalette,
  msecToTime,
  WINDOWS_98_ICON,
  Windows98,
} from './Windows98';

afterEach(cleanup);

/** Deterministic track: empty cover url keeps `usePixelatedCover` inert in jsdom. */
const BASE_TRACK: Partial<PlayerTrack> = {
  title: 'Test Song',
  artist: 'Test Artist',
  cover_url: '',
  duration: 180_000,
  progress: 30_000,
  is_playing: false,
  isLiveStream: false,
};

function renderWindows98(
  settings: Partial<AmuseProfileSettings> = {},
  track: Partial<PlayerTrack> = {},
) {
  const store = createPlayerStore();
  store.getState().setWidgetState(WidgetStatus.SUCCESS);
  store.getState().setCurrentTrack({ ...BASE_TRACK, ...track });
  store.getState().setPlaybackState(PlaybackState.PLAYING);
  const result = render(
    <PlayerStoreProvider store={store}>
      <ProfileSettingsProvider settings={settings}>
        <Windows98 />
      </ProfileSettingsProvider>
    </PlayerStoreProvider>,
  );
  return { ...result, store };
}

describe('skin-windows98 / structure', () => {
  it('matches the Windows 98 window snapshot', () => {
    const { container } = renderWindows98();
    expect(container.querySelector('.window')).toMatchSnapshot();
  });

  it('exposes the amuse-skin dispatch hook', () => {
    renderWindows98();
    const root = screen.getByTestId('amuse-skin');
    expect(root.getAttribute('data-skin')).toBe('windows98');
  });

  it('renders the window border, title bar and its 3 controls', () => {
    const { container } = renderWindows98();
    expect(container.querySelector('.window')).not.toBeNull();
    expect(container.querySelector('.title-bar')).not.toBeNull();
    expect(container.querySelector('.window-body')).not.toBeNull();

    const controls = container.querySelectorAll('.title-bar-controls button');
    expect(controls).toHaveLength(3);
    expect(
      Array.from(controls).map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Minimize', 'Maximize', 'Close']);

    const icon = container.querySelector(
      '.title-bar img',
    ) as HTMLImageElement | null;
    expect(icon?.getAttribute('src')).toBe(WINDOWS_98_ICON);
    expect(container.querySelector('.title-bar-text')?.textContent).toBe(
      'Amuse',
    );
  });
});

describe('skin-windows98 / Pixelated MS Sans font', () => {
  it('injects the 98.css sheet scoped with the Pixelated MS Sans font-family', () => {
    const { container } = renderWindows98();
    const style = container.querySelector('style');
    expect(style).not.toBeNull();
    const css = style?.textContent ?? '';
    expect(css).toContain('@scope {');
    expect(css).toContain('font-family:"Pixelated MS Sans Serif",Arial');
    expect(css).toContain(
      '.window{background:silver;box-shadow:inset -1px -1px #0a0a0a',
    );
  });

  it('falls back to the Arial font stack only after the Pixelated MS Sans family', () => {
    const { container } = renderWindows98();
    const css = container.querySelector('style')?.textContent ?? '';
    // The chrome rule must name "Pixelated MS Sans Serif" before Arial.
    expect(css.indexOf('"Pixelated MS Sans Serif"')).toBeLessThan(
      css.indexOf('Arial', css.indexOf('"Pixelated MS Sans Serif"')),
    );
  });
});

describe('skin-windows98 / cover + playbar branches', () => {
  it('renders the cover sunken-panel only when settings.cover != none', () => {
    const withCover = renderWindows98({ cover: Cover.SQUARE });
    expect(
      withCover.container.querySelector('.window-body > .sunken-panel'),
    ).not.toBeNull();
    expect(
      (withCover.container.querySelector('.window') as HTMLElement).style.width,
    ).toBe('300px');

    cleanup();

    const noCover = renderWindows98({ cover: Cover.NONE });
    expect(
      noCover.container.querySelector('.window-body > .sunken-panel'),
    ).toBeNull();
    expect(
      (noCover.container.querySelector('.window') as HTMLElement).style.width,
    ).toBe('220px');
  });

  it('renders the Live indicator (and no clock) for a live stream', () => {
    const { container } = renderWindows98(
      {},
      { isLiveStream: true, is_playing: true },
    );
    expect(container.querySelector('#songtime')?.textContent).toContain('Live');
    expect(container.querySelector('#songtime')?.textContent).not.toContain(
      '03:00',
    );
  });

  it('renders elapsed/duration clocks for a normal track', () => {
    const { container } = renderWindows98();
    const text = container.querySelector('#songtime')?.textContent ?? '';
    expect(text).toContain('00:30');
    expect(text).toContain('03:00');
  });
});

describe('skin-windows98 / PRO gating + WINDOWS_98_PLAYER flag', () => {
  const entry = SKINS.find((skin) => skin.id === Skin.WINDOWS98);

  it('is registered as a PRO-tier skin (unchanged)', () => {
    expect(entry).toBeDefined();
    expect(entry?.tier).toBe(SkinTier.PRO);
    expect(entry?.status).toBe(SkinTier.PRO);
  });

  it('is locked unless the subscription is active (isSkinLocked)', () => {
    expect(isSkinLocked(entry!)).toBe(true);
    expect(
      isSkinLocked(entry!, {
        subscriptionStatus: SubscriptionStatus.INACTIVE,
      }),
    ).toBe(true);
    expect(
      isSkinLocked(entry!, { subscriptionStatus: SubscriptionStatus.ACTIVE }),
    ).toBe(false);
  });

  it('is visible only when the WINDOWS_98_PLAYER flag is enabled', () => {
    expect(WINDOWS_98_PLAYER).toBe('WINDOWS_98_PLAYER');
    expect(getVisibleSkins(true)).toHaveLength(8);
    expect(getVisibleSkins(false)).toHaveLength(7);
    expect(getVisibleSkins(true).map((skin) => skin.id)).toContain(
      Skin.WINDOWS98,
    );
    expect(getVisibleSkins(false).map((skin) => skin.id)).not.toContain(
      Skin.WINDOWS98,
    );
  });
});

describe('skin-windows98 / O() + vr() helpers', () => {
  it('msecToTime formats mm:ss with an unpadded h: prefix', () => {
    expect(msecToTime(0)).toBe('00:00');
    expect(msecToTime(30_000)).toBe('00:30');
    expect(msecToTime(180_000)).toBe('03:00');
    expect(msecToTime(3_600_000)).toBe('1:00:00');
  });

  it('mapToPalette returns an opaque packed palette colour', () => {
    const mapped = mapToPalette(255, 0, 0);
    expect(mapped >>> 24).toBe(255);
    expect(Number.isInteger(mapped)).toBe(true);
  });

  it('ditherPixels rewrites every pixel to a palette colour', () => {
    const pixels = new Uint32Array([
      (255 << 24) | (10 << 16) | (10 << 8) | 10,
      (255 << 24) | (240 << 16) | (240 << 8) | 240,
      (255 << 24) | (200 << 16) | (30 << 8) | 30,
      (255 << 24) | (20 << 16) | (20 << 8) | 220,
    ]);
    ditherPixels(2, 2, pixels);
    for (const pixel of pixels) {
      expect(pixel >>> 24).toBe(255);
    }
  });
});
