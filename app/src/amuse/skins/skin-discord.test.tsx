import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PlayerStoreProvider } from '../player/context';
import {
  createPlayerStore,
  WidgetStatus,
  type PlayerTrack,
} from '../player/store';
import { ProfileSettingsProvider } from '../profile/context';
import type { AmuseProfileSettings } from '../profile/settings';
import { Cover, Theme } from '../types/user';
import { Discord } from './Discord';

afterEach(cleanup);

function renderDiscord(
  settings: Partial<AmuseProfileSettings> = {},
  track?: Partial<PlayerTrack>,
) {
  const store = createPlayerStore();
  if (track) {
    store.getState().setCurrentTrack(track);
  }
  store.getState().setWidgetState(WidgetStatus.SUCCESS);
  return render(
    <PlayerStoreProvider store={store}>
      <ProfileSettingsProvider settings={settings}>
        <Discord />
      </ProfileSettingsProvider>
    </PlayerStoreProvider>,
  );
}

/** The skin root is the `rounded-2xl` container (original `Mr` root div). */
function skinRoot(container: HTMLElement): HTMLElement {
  const root = container.querySelector('.rounded-2xl');
  if (!root) {
    throw new Error('Discord skin root not found');
  }
  return root as HTMLElement;
}

describe('Discord skin / snapshot', () => {
  it('matches the dark Discord skin snapshot', () => {
    const { container } = renderDiscord(
      { theme: Theme.DARK, cover: Cover.SQUARE },
      {
        title: 'Song Title',
        artist: 'Artist Name',
        cover_url: '/assets/square-CF5c1row.svg',
        duration: 200000,
        progress: 50000,
        is_playing: true,
        isLiveStream: false,
      },
    );
    expect(container).toMatchSnapshot();
  });
});

describe('Discord skin / icon presence', () => {
  it('renders the Discord wordmark mark (inline `ws` SVG)', () => {
    const { container } = renderDiscord();
    const mark = container.querySelector('#Isolation_Mode');
    expect(mark).not.toBeNull();
    expect(mark?.getAttribute('data-name')).toBe('Isolation Mode');
    expect(mark?.getAttribute('viewBox')).toBe('0 0 337.82 53.38');
    // The wordmark is 7 letter paths + the dot ellipse.
    expect(mark?.querySelectorAll('path').length).toBe(7);
    expect(mark?.querySelectorAll('ellipse').length).toBe(1);
  });

  it('tints the mark per theme (#949ba4 dark / #5c5e66 light)', () => {
    const dark = renderDiscord({ theme: Theme.DARK });
    expect(
      dark.container.querySelector('#Isolation_Mode')?.getAttribute('fill'),
    ).toBe('#949ba4');
    cleanup();
    const light = renderDiscord({ theme: Theme.LIGHT });
    expect(
      light.container.querySelector('#Isolation_Mode')?.getAttribute('fill'),
    ).toBe('#5c5e66');
  });
});

describe('Discord skin / gating display branch', () => {
  it('exposes the discord skin through the dispatch hook', () => {
    const { container } = renderDiscord();
    const root = container.querySelector('[data-testid="amuse-skin"]');
    expect(root?.getAttribute('data-skin')).toBe('discord');
  });

  it('dark theme displays bg-discord-dark (not the light branch)', () => {
    const { container } = renderDiscord({
      theme: Theme.DARK,
      cover: Cover.SQUARE,
    });
    const root = skinRoot(container);
    expect(root.className).toContain('bg-discord-dark');
    expect(root.className).not.toContain('bg-light-discord-dark');
    expect(root.className).toContain('text-white');
  });

  it('light theme displays bg-light-discord-dark', () => {
    const { container } = renderDiscord({
      theme: Theme.LIGHT,
      cover: Cover.SQUARE,
    });
    const root = skinRoot(container);
    expect(root.className).toContain('bg-light-discord-dark');
    expect(root.className).toContain('text-light-discord-text-main');
    expect(root.className).not.toContain('bg-discord-dark');
  });

  it('cover=square displays w-[420px] and renders the cover node', () => {
    const { container } = renderDiscord({
      theme: Theme.DARK,
      cover: Cover.SQUARE,
    });
    const root = skinRoot(container);
    expect(root.className).toContain('w-[420px]');
    expect(
      container.querySelector('[data-testid="amuse-cover"]'),
    ).not.toBeNull();
  });

  it('cover=none collapses to w-[320px] and renders no cover node', () => {
    const { container } = renderDiscord({
      theme: Theme.DARK,
      cover: Cover.NONE,
    });
    const root = skinRoot(container);
    expect(root.className).toContain('w-[320px]');
    expect(root.className).not.toContain('w-[420px]');
    expect(container.querySelector('[data-testid="amuse-cover"]')).toBeNull();
  });

  it('renders 00:00 while the playback state is nothing_playing', () => {
    const { container } = renderDiscord(
      { theme: Theme.DARK, cover: Cover.SQUARE },
      { duration: 200000, progress: 50000 },
    );
    expect(skinRoot(container).textContent).toContain('00:00');
  });
});

describe('Discord skin / live branch', () => {
  it('shows the Live label + indicator for a live stream', () => {
    const { container } = renderDiscord(
      { theme: Theme.DARK, cover: Cover.SQUARE },
      { isLiveStream: true, is_playing: true },
    );
    expect(skinRoot(container).textContent).toContain('Live');
  });
});
