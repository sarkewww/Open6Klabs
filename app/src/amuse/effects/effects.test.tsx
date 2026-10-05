/**
 * Task 28 — palette extraction + visual effect switch parity tests.
 *
 * Two layers:
 *   1. pure resolver assertions for the react-palette merge contract
 *      (`palette.ts`) and the four switch DOM-effect resolvers (`switches.ts`);
 *   2. rendered-`Player` DOM assertions: `Player` is rendered with different
 *      profile settings + an injected palette and the actual effect on/off is
 *      read from the DOM. `Player.tsx`, the skins and the covers are NOT
 *      modified — the switches are exercised through their real wiring.
 *
 * `react-palette`'s `usePalette` uses node-vibrant (Image + canvas), inert in
 * jsdom, so it is stubbed; the palette is injected through `Player`'s `palette`
 * prop instead.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-palette', () => ({
  usePalette: () => ({ data: {}, loading: false, error: undefined }),
}));

import { DEFAULT_COVER_PALETTE, type CoverPalette } from '../player/colors';
import Player from '../player/Player';
import { createPlayerStore, WidgetStatus } from '../player/store';
import type { AmuseProfileSettings } from '../profile/settings';
import { Theme } from '../types/user';
import {
  COVER_PALETTE_KEYS,
  hasUsablePalette,
  mergeCoverPalette,
  pickVibrant,
  resolveAccentColor,
  resolveCoverBlurFilter,
  resolveCoverBlurOpacity,
  resolveCoverGlowOpacity,
  resolveCoverGlowVisible,
  resolveMagicColorsPlaybarStyle,
  resolveMagicColorsSurfaceStyle,
  resolveVisualizerOpacity,
} from './index';

// framer-motion probes prefers-reduced-motion via matchMedia, which jsdom lacks.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

afterEach(cleanup);

/** Distinct palette so every assertion is unambiguous. */
const PALETTE: CoverPalette = {
  vibrant: '#112233',
  darkVibrant: '#223344',
  lightVibrant: '#334455',
  muted: '#445566',
  darkMuted: '#556677',
  lightMuted: '#667788',
};

function toRgb(hex: string): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

/** jsdom may normalise inline hex to `rgb(...)`; accept either form. */
function sameColor(actual: string, hex: string): boolean {
  return actual.toLowerCase() === hex.toLowerCase() || actual === toRgb(hex);
}

function renderPlayer(
  settings: Partial<AmuseProfileSettings>,
  palette: Partial<CoverPalette> = PALETTE,
) {
  const store = createPlayerStore();
  store.getState().setWidgetState(WidgetStatus.SUCCESS);
  render(<Player store={store} settings={settings} palette={palette} />);
  return store;
}

/** First visualizer bar's coloured core (the bar that carries `backgroundColor`). */
function visualizerBar(): HTMLElement {
  const viz = screen.getByTestId('amuse-visualizer');
  const bar = viz.querySelector(
    '.flex.flex-col.items-center.justify-center > div',
  );
  if (!(bar instanceof HTMLElement)) {
    throw new Error('visualizer bar not found');
  }
  return bar;
}

describe('effects / palette extraction', () => {
  it('lists the six react-palette swatch keys in original order', () => {
    expect([...COVER_PALETTE_KEYS]).toEqual([
      'vibrant',
      'darkVibrant',
      'lightVibrant',
      'muted',
      'darkMuted',
      'lightMuted',
    ]);
  });

  it('hasUsablePalette rejects empty / placeholder swatches', () => {
    expect(hasUsablePalette(undefined)).toBe(false);
    expect(hasUsablePalette(null)).toBe(false);
    expect(hasUsablePalette({})).toBe(false);
    expect(hasUsablePalette({ vibrant: '' })).toBe(false);
    expect(hasUsablePalette({ vibrant: 'undefined' })).toBe(false);
    expect(hasUsablePalette({ vibrant: '#ffffff' })).toBe(true);
  });

  it('mergeCoverPalette keeps previous swatches for empty/undefined data', () => {
    const merged = mergeCoverPalette(DEFAULT_COVER_PALETTE, {
      vibrant: '#123456',
      darkVibrant: '',
      lightVibrant: undefined,
    });
    expect(merged.vibrant).toBe('#123456');
    expect(merged.darkVibrant).toBe(DEFAULT_COVER_PALETTE.darkVibrant);
    expect(merged.lightVibrant).toBe(DEFAULT_COVER_PALETTE.lightVibrant);
    expect(merged.muted).toBe(DEFAULT_COVER_PALETTE.muted);
    expect(merged.darkMuted).toBe(DEFAULT_COVER_PALETTE.darkMuted);
    expect(merged.lightMuted).toBe(DEFAULT_COVER_PALETTE.lightMuted);
  });

  it('mergeCoverPalette copies every provided swatch verbatim', () => {
    expect(mergeCoverPalette(DEFAULT_COVER_PALETTE, PALETTE)).toEqual(PALETTE);
  });

  it('pickVibrant returns the vibrant swatch', () => {
    expect(pickVibrant(PALETTE)).toBe(PALETTE.vibrant);
  });
});

describe('effects / switch resolvers', () => {
  it('magic_colors surface style uses darkMuted + lightVibrant when on', () => {
    expect(resolveMagicColorsSurfaceStyle(true, PALETTE)).toEqual({
      backgroundColor: PALETTE.darkMuted,
      color: PALETTE.lightVibrant,
    });
    expect(resolveMagicColorsSurfaceStyle(false, PALETTE)).toEqual({});
  });

  it('magic_colors playbar style uses darkVibrant when on', () => {
    expect(resolveMagicColorsPlaybarStyle(true, PALETTE)).toEqual({
      backgroundColor: PALETTE.darkVibrant,
    });
    expect(resolveMagicColorsPlaybarStyle(false, PALETTE)).toBeUndefined();
  });

  it('accent colour switches between vibrant and tint_color', () => {
    expect(resolveAccentColor(true, PALETTE, '#abcdef')).toBe(PALETTE.vibrant);
    expect(resolveAccentColor(false, PALETTE, '#abcdef')).toBe('#abcdef');
  });

  it('cover_glow requires both the switch and a cover url', () => {
    expect(resolveCoverGlowVisible(true, 'cover.jpg')).toBe(true);
    expect(resolveCoverGlowVisible(true, '')).toBe(false);
    expect(resolveCoverGlowVisible(false, 'cover.jpg')).toBe(false);
    expect(resolveCoverGlowOpacity(true, 'cover.jpg')).toBe('1');
    expect(resolveCoverGlowOpacity(false, 'cover.jpg')).toBe('0');
  });

  it('cover_blur filter follows magic_colors + theme verbatim', () => {
    expect(resolveCoverBlurFilter(true, Theme.DARK)).toBe(
      'blur(15px) brightness(80%) saturate(120%)',
    );
    expect(resolveCoverBlurFilter(false, Theme.DARK)).toBe(
      'blur(15px) brightness(35%)',
    );
    expect(resolveCoverBlurFilter(false, Theme.LIGHT)).toBe(
      'blur(15px) brightness(80%) saturate(120%)',
    );
  });

  it('cover_blur and visualizer opacity toggle', () => {
    expect(resolveCoverBlurOpacity(true)).toBe('100%');
    expect(resolveCoverBlurOpacity(false)).toBe('0%');
    expect(resolveVisualizerOpacity(true)).toBe('0%');
    expect(resolveVisualizerOpacity(false)).toBe('100%');
  });
});

describe('effects / rendered Player DOM', () => {
  it('magic_colors tints the surface + playbar with the injected palette', () => {
    renderPlayer({ magic_colors: true });

    const surface = screen.getByTestId('amuse-skin-surface');
    expect(surface.getAttribute('data-magic-colors')).toBe('true');
    expect(sameColor(surface.style.backgroundColor, PALETTE.darkMuted)).toBe(
      true,
    );
    expect(sameColor(surface.style.color, PALETTE.lightVibrant)).toBe(true);

    const playbar = document.getElementById('playbar');
    expect(playbar).not.toBeNull();
    expect(
      sameColor(
        (playbar as HTMLElement).style.backgroundColor,
        PALETTE.darkVibrant,
      ),
    ).toBe(true);

    const active = document.getElementById('active');
    expect(active).not.toBeNull();
    expect(
      sameColor((active as HTMLElement).style.backgroundColor, PALETTE.vibrant),
    ).toBe(true);
  });

  it('magic_colors off clears the tint and uses tint_color for the active fill', () => {
    renderPlayer({ magic_colors: false, tint_color: '#abcdef' });

    const surface = screen.getByTestId('amuse-skin-surface');
    expect(surface.getAttribute('data-magic-colors')).toBe('false');
    expect(surface.style.backgroundColor).toBe('');
    expect(surface.style.color).toBe('');

    const playbar = document.getElementById('playbar');
    expect((playbar as HTMLElement).style.backgroundColor).toBe('');

    const active = document.getElementById('active');
    expect(
      sameColor((active as HTMLElement).style.backgroundColor, '#abcdef'),
    ).toBe(true);
  });

  it('magic_colors colours the visualizer bars', () => {
    renderPlayer({ magic_colors: true });
    expect(
      sameColor(visualizerBar().style.backgroundColor, PALETTE.vibrant),
    ).toBe(true);

    cleanup();

    renderPlayer({ magic_colors: false, tint_color: '#abcdef' });
    expect(sameColor(visualizerBar().style.backgroundColor, '#abcdef')).toBe(
      true,
    );
  });

  it('cover_glow toggles the glow layer opacity', () => {
    renderPlayer({ cover_glow: true });
    const on = screen.getByTestId('amuse-cover-glow');
    expect(on.getAttribute('data-cover-glow')).toBe('true');
    expect(on.style.opacity).toBe('1');

    cleanup();

    renderPlayer({ cover_glow: false });
    const off = screen.getByTestId('amuse-cover-glow');
    expect(off.getAttribute('data-cover-glow')).toBe('false');
    expect(off.style.opacity).toBe('0');
  });

  it('cover_blur off leaves no visible blur (blur layer opacity 0%)', () => {
    renderPlayer({ cover_blur: true });
    const on = screen.getByTestId('amuse-cover-blur');
    expect(on.getAttribute('data-cover-blur')).toBe('true');
    expect(on.style.opacity).toBe('100%');
    expect(on.style.filter).toContain('blur(15px)');

    cleanup();

    renderPlayer({ cover_blur: false });
    const off = screen.getByTestId('amuse-cover-blur');
    expect(off.getAttribute('data-cover-blur')).toBe('false');
    expect(off.style.opacity).toBe('0%');
  });

  it('cover_blur filter follows magic_colors + theme', () => {
    renderPlayer({ cover_blur: true, magic_colors: true });
    expect(screen.getByTestId('amuse-cover-blur').style.filter).toContain(
      'brightness(80%)',
    );

    cleanup();

    renderPlayer({ cover_blur: true, magic_colors: false, theme: Theme.DARK });
    expect(screen.getByTestId('amuse-cover-blur').style.filter).toContain(
      'brightness(35%)',
    );
  });

  it('hide_visualizer toggles the visualizer opacity', () => {
    renderPlayer({ hide_visualizer: true });
    const on = screen.getByTestId('amuse-visualizer');
    expect(on.getAttribute('data-hide-visualizer')).toBe('true');
    expect(on.style.opacity).toBe('0%');

    cleanup();

    renderPlayer({ hide_visualizer: false });
    const off = screen.getByTestId('amuse-visualizer');
    expect(off.getAttribute('data-hide-visualizer')).toBe('false');
    expect(off.style.opacity).toBe('100%');
  });
});
