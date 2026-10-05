import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * `react-palette`'s `usePalette` uses `node-vibrant` (Image + canvas), which is
 * a no-op in jsdom. Stub it so the colour context resolves deterministically to
 * the default palette.
 */
vi.mock('react-palette', () => ({
  usePalette: () => ({ data: {}, loading: false, error: undefined }),
}));

/**
 * Isolate the skins from the cover implementations (owned by Todos 17-19): the
 * macOS snapshot must not drift when the cover stubs are rebuilt, and the Shell
 * no-cover assertion must prove the skin itself never mounts a cover.
 */
vi.mock('../covers', () => ({
  CoverView: () => <div data-testid="amuse-cover" />,
}));

import type { ReactElement } from 'react';
import { CoverColorsProvider } from '../player/colors';
import { PlayerStoreProvider } from '../player/context';
import { createPlayerStore, WidgetStatus } from '../player/store';
import { ProfileSettingsProvider } from '../profile/context';
import type { AmuseProfileSettings } from '../profile/settings';
import { Cover, Theme } from '../types/user';
import { MacOS } from './MacOS';
import { Shell } from './Shell';

// framer-motion / Radix probe prefers-reduced-motion via matchMedia, absent in jsdom.
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

function renderSkin(
  node: ReactElement,
  settings: Partial<AmuseProfileSettings>,
) {
  const store = createPlayerStore();
  store.getState().setWidgetState(WidgetStatus.SUCCESS);
  return render(
    <PlayerStoreProvider store={store}>
      <ProfileSettingsProvider settings={settings}>
        <CoverColorsProvider>{node}</CoverColorsProvider>
      </ProfileSettingsProvider>
    </PlayerStoreProvider>,
  );
}

describe('macOS skin (original zr)', () => {
  it('renders the window controls, song info and playbar', () => {
    const { container } = renderSkin(<MacOS />, {
      skin: 'macos',
      theme: Theme.DARK,
      cover: Cover.SQUARE,
    });

    expect(screen.getByTestId('amuse-skin').getAttribute('data-skin')).toBe(
      'macos',
    );
    expect(container.querySelector('.bg-osx-close')).not.toBeNull();
    expect(container.querySelector('.bg-osx-minimize')).not.toBeNull();
    expect(container.querySelector('.bg-osx-fullscreen')).not.toBeNull();
    expect(container.querySelector('#songinfo')).not.toBeNull();
    expect(container.querySelector('#songtime')).not.toBeNull();
    expect(container.querySelector('#playbar')).not.toBeNull();
    expect(screen.getByTestId('amuse-cover')).not.toBeNull();
  });

  it('uses the osx window chrome tokens for dark and light themes', () => {
    const dark = renderSkin(<MacOS />, {
      skin: 'macos',
      theme: Theme.DARK,
      cover: Cover.NONE,
    });
    expect(dark.container.querySelector('.bg-osx-content-bg')).not.toBeNull();
    expect(dark.container.querySelector('.bg-osx-top-bg')).not.toBeNull();

    cleanup();

    const light = renderSkin(<MacOS />, {
      skin: 'macos',
      theme: Theme.LIGHT,
      cover: Cover.NONE,
    });
    expect(
      light.container.querySelector('.bg-osx-content-bg-light'),
    ).not.toBeNull();
    expect(
      light.container.querySelector('.bg-osx-top-bg-light'),
    ).not.toBeNull();
  });

  it('matches the macOS snapshot', () => {
    const { container } = renderSkin(<MacOS />, {
      skin: 'macos',
      theme: Theme.DARK,
      cover: Cover.SQUARE,
      magic_colors: true,
      cover_glow: false,
    });
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('Shell skin (original Tr)', () => {
  it('renders NO cover node even when settings.cover is square', () => {
    const { container } = renderSkin(<Shell />, {
      skin: 'shell',
      theme: Theme.DARK,
      cover: Cover.SQUARE,
    });

    expect(screen.getByTestId('amuse-skin').getAttribute('data-skin')).toBe(
      'shell',
    );
    expect(container.querySelector('[data-testid="amuse-cover"]')).toBeNull();
    expect(container.querySelector('.aspect-square')).toBeNull();
  });

  it('uses the shell background and menu-bar tokens', () => {
    const dark = renderSkin(<Shell />, {
      skin: 'shell',
      theme: Theme.DARK,
      cover: Cover.NONE,
    });
    expect(dark.container.querySelector('.bg-shell-bg')).not.toBeNull();
    expect(dark.container.querySelector('.bg-shell-menu-bar')).not.toBeNull();

    cleanup();

    const light = renderSkin(<Shell />, {
      skin: 'shell',
      theme: Theme.LIGHT,
      cover: Cover.NONE,
    });
    expect(light.container.querySelector('.bg-shell-bg-light')).not.toBeNull();
    expect(
      light.container.querySelector('.bg-shell-menu-bar-light'),
    ).not.toBeNull();
  });

  it('renders the terminal prompt, title and artist lines', () => {
    renderSkin(<Shell />, { skin: 'shell', theme: Theme.DARK });

    expect(screen.getByText('root@amuse')).not.toBeNull();
    expect(screen.getByText('--nowplaying')).not.toBeNull();
    expect(screen.getByText('Title: -')).not.toBeNull();
    expect(screen.getByText('Artist: -')).not.toBeNull();
  });

  it('matches the Shell snapshot', () => {
    const { container } = renderSkin(<Shell />, {
      skin: 'shell',
      theme: Theme.DARK,
      cover: Cover.SQUARE,
      magic_colors: true,
    });
    expect(container.firstChild).toMatchSnapshot();
  });
});
