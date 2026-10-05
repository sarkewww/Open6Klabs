import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * `react-palette`'s `usePalette` uses `node-vibrant` (Image + canvas), which is
 * a no-op in jsdom. Stub it so the colour context resolves deterministically to
 * the default palette — the wrapper/effects under test do not depend on image
 * extraction.
 */
vi.mock('react-palette', () => ({
  usePalette: () => ({ data: {}, loading: false, error: undefined }),
}));

import { COVER_COMPONENTS, CoverView } from '../covers';
import { ProfileSettingsProvider } from '../profile/context';
import type { AmuseProfileSettings } from '../profile/settings';
import { Skin, type SkinId } from '../settings/registry';
import { SKIN_COMPONENTS, SkinView } from '../skins';
import { Cover } from '../types/user';
import Player from './Player';
import { createPlayerStore, WidgetStatus } from './store';

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

const COVER_CASES: { cover: Cover; kind: string }[] = [
  { cover: Cover.SQUARE, kind: 'square' },
  { cover: Cover.CANVAS, kind: 'canvas' },
  { cover: Cover.VINYL, kind: 'vinyl' },
];

const SKIN_CASES: { skin: SkinId; id: string }[] = [
  { skin: Skin.COMPACT, id: 'compact' },
  { skin: Skin.BOXY, id: 'boxy' },
  { skin: Skin.GALLERY, id: 'gallery' },
  { skin: Skin.MINIMAL, id: 'minimal' },
  { skin: Skin.MACOS, id: 'macos' },
  { skin: Skin.SHELL, id: 'shell' },
  { skin: Skin.DISCORD, id: 'discord' },
  { skin: Skin.WINDOWS98, id: 'windows98' },
];

function renderWithSettings(
  settings: Partial<AmuseProfileSettings>,
  node: ReactNode,
) {
  render(
    <ProfileSettingsProvider settings={settings}>
      {node}
    </ProfileSettingsProvider>,
  );
}

function renderPlayer(settings: Partial<AmuseProfileSettings>) {
  const store = createPlayerStore();
  store.getState().setWidgetState(WidgetStatus.SUCCESS);
  render(<Player store={store} settings={settings} />);
  return store;
}

describe('player-wrapper / cover dispatch', () => {
  it('exposes exactly the 4 cover components (square/canvas/vinyl/none)', () => {
    expect(Object.keys(COVER_COMPONENTS).sort()).toEqual([
      'canvas',
      'none',
      'square',
      'vinyl',
    ]);
  });

  it.each(COVER_CASES)(
    'dispatches settings.cover=$cover to the $kind cover',
    ({ cover, kind }) => {
      renderWithSettings({ cover }, <CoverView />);
      expect(screen.getByTestId('amuse-cover').getAttribute('data-cover')).toBe(
        kind,
      );
    },
  );

  it('renders no cover node when settings.cover=none', () => {
    renderWithSettings({ cover: Cover.NONE }, <CoverView />);
    expect(screen.queryByTestId('amuse-cover')).toBeNull();
  });
});

describe('player-wrapper / skin dispatch', () => {
  it('exposes exactly the 8 skin components', () => {
    expect(Object.keys(SKIN_COMPONENTS).sort()).toEqual([
      'boxy',
      'compact',
      'discord',
      'gallery',
      'macos',
      'minimal',
      'shell',
      'windows98',
    ]);
  });

  it.each(SKIN_CASES)(
    'dispatches settings.skin=$skin to the $id skin',
    ({ skin, id }) => {
      renderWithSettings({ skin }, <SkinView />);
      expect(screen.getByTestId('amuse-skin').getAttribute('data-skin')).toBe(
        id,
      );
    },
  );

  it('falls back to the compact skin for an unknown skin id', () => {
    renderWithSettings({ skin: 'does-not-exist' }, <SkinView />);
    expect(screen.getByTestId('amuse-skin').getAttribute('data-skin')).toBe(
      'compact',
    );
  });
});

describe('player-wrapper / effect switches', () => {
  it('magic_colors toggles the magic-colours surface style', () => {
    renderPlayer({ magic_colors: true });
    const on = screen.getByTestId('amuse-skin-surface');
    expect(on.getAttribute('data-magic-colors')).toBe('true');
    expect(on.style.backgroundColor).not.toBe('');

    cleanup();

    renderPlayer({ magic_colors: false });
    const off = screen.getByTestId('amuse-skin-surface');
    expect(off.getAttribute('data-magic-colors')).toBe('false');
    expect(off.style.backgroundColor).toBe('');
  });

  it('cover_glow toggles the cover glow layer', () => {
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

  it('cover_blur toggles the blurred background layer', () => {
    renderPlayer({ cover_blur: true });
    const on = screen.getByTestId('amuse-cover-blur');
    expect(on.getAttribute('data-cover-blur')).toBe('true');
    expect(on.style.opacity).toBe('100%');

    cleanup();

    renderPlayer({ cover_blur: false });
    const off = screen.getByTestId('amuse-cover-blur');
    expect(off.getAttribute('data-cover-blur')).toBe('false');
    expect(off.style.opacity).toBe('0%');
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

  it('does not render the player until widgetState is SUCCESS', () => {
    const store = createPlayerStore();
    store.getState().setWidgetState(WidgetStatus.LOADING);
    render(<Player store={store} />);
    expect(screen.queryByTestId('amuse-skin')).toBeNull();
  });
});
