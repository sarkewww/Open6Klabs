/**
 * Compact (`Nr`) + Boxy (`Vr`) skin parity tests.
 *
 * Strategy (plan Todo 20): RTL snapshot + computed-style assertions over the
 * exact DOM hierarchy / class names / text the original components render.
 * The shared sub-components are the task-scoped port in
 * `./compact-boxy-shared`.
 */

import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { CoverColorsContext, type CoverPalette } from '../player/colors';
import { PlayerStoreProvider } from '../player/context';
import { createPlayerStore, type PlayerTrack } from '../player/store';
import { ProfileSettingsProvider } from '../profile/context';
import type { AmuseProfileSettings } from '../profile/settings';
import { Cover, Theme } from '../types/user';
import { Boxy } from './Boxy';
import { Compact } from './Compact';

afterEach(cleanup);

/** Distinct palette so computed-style assertions are unambiguous. */
const PALETTE: CoverPalette = {
  vibrant: '#ff0000',
  darkVibrant: '#00ff00',
  lightVibrant: '#ffff00',
  muted: '#111111',
  darkMuted: '#0000ff',
  lightMuted: '#222222',
};

function renderSkin(
  Component: ComponentType,
  settings: Partial<AmuseProfileSettings> = {},
  track: Partial<PlayerTrack> = {},
) {
  const store = createPlayerStore();
  if (Object.keys(track).length > 0) {
    store.getState().setCurrentTrack(track);
  }
  const result = render(
    <PlayerStoreProvider store={store}>
      <ProfileSettingsProvider settings={settings}>
        <CoverColorsContext.Provider
          value={{ colors: PALETTE, loading: false, error: null }}
        >
          <Component />
        </CoverColorsContext.Provider>
      </ProfileSettingsProvider>
    </PlayerStoreProvider>,
  );
  return { store, ...result };
}

/** root > scale-div > font-wrapper */
function layers(root: HTMLElement) {
  const scaleDiv = root.firstElementChild as HTMLElement;
  const fontWrapper = scaleDiv.firstElementChild as HTMLElement;
  return { scaleDiv, fontWrapper };
}

const LIVE_TEXT = 'Live';

describe('Compact skin (Nr)', () => {
  it('renders the PlayerView root with data-skin=compact', () => {
    renderSkin(Compact);
    const root = screen.getByTestId('amuse-skin');
    expect(root.getAttribute('data-skin')).toBe('compact');
    expect(root.className).toBe(
      'relative flex h-full w-full select-none items-center justify-center',
    );
    expect(root.style.padding).toBe('5%');
  });

  it('uses w-[405px] with a cover and w-[284px] when cover=none', () => {
    const { unmount } = renderSkin(Compact, { cover: Cover.SQUARE });
    expect(
      (
        screen.getByTestId('amuse-skin').firstElementChild
          ?.firstElementChild as HTMLElement
      ).className,
    ).toContain('w-[405px]');
    unmount();

    renderSkin(Compact, { cover: Cover.NONE });
    expect(
      (
        screen.getByTestId('amuse-skin').firstElementChild
          ?.firstElementChild as HTMLElement
      ).className,
    ).toContain('w-[284px]');
  });

  it('reproduces the Nr DOM hierarchy and class names', () => {
    renderSkin(Compact, {}, { title: 'Song X', artist: 'Artist Y' });
    const root = screen.getByTestId('amuse-skin');
    const { fontWrapper } = layers(root);
    expect(fontWrapper.className).toContain('w-[405px]');

    const column = fontWrapper.firstElementChild as HTMLElement;
    expect(column.className).toBe('flex flex-col gap-2');
    expect(column.children).toHaveLength(2);

    const row = column.children[0] as HTMLElement;
    expect(row.className).toBe('flex h-28 w-full gap-2');
    expect(row.children).toHaveLength(2);

    const info = row.children[1] as HTMLElement;
    expect(info.className).toBe('z-50 flex w-full min-w-0 flex-col gap-2');
    expect(info.children).toHaveLength(2);

    const titleSurface = info.children[0] as HTMLElement;
    expect(titleSurface.getAttribute('data-testid')).toBe('amuse-skin-surface');
    expect(titleSurface.className).toContain(
      'relative z-50 h-full transform-gpu overflow-clip rounded-lg transition-all duration-300',
    );
    expect(titleSurface.className).toContain(
      'flex flex-col justify-center px-3 py-1',
    );

    const title = titleSurface.querySelector('p');
    expect(title?.className).toContain('mt-0.5');
    expect(title?.textContent).toBe('Song X');
    expect(titleSurface.querySelectorAll('p')[1]?.textContent).toBe('Artist Y');
    expect(
      titleSurface.querySelector('[data-testid="amuse-cover-blur"]'),
    ).not.toBeNull();

    const timeSurface = info.children[1] as HTMLElement;
    expect(timeSurface.className).toContain(
      'flex h-[72px] items-center justify-evenly',
    );

    const playbar = column.children[1] as HTMLElement;
    expect(playbar.id).toBe('playbar');
    expect(playbar.firstElementChild?.id).toBe('active');
  });

  it('renders #active width as the store progress percentage', () => {
    renderSkin(Compact, {}, { progress: 2500, duration: 10000 });
    expect(document.getElementById('active')?.style.width).toBe('25%');
  });

  it('renders the non-live branch with progress/duration times', () => {
    renderSkin(
      Compact,
      {},
      {
        progress: 65000,
        duration: 185000,
        isLiveStream: false,
      },
    );
    expect(screen.getByText('01:05')).toBeTruthy();
    expect(screen.getByText('03:05')).toBeTruthy();
    expect(screen.queryByText(LIVE_TEXT)).toBeNull();
  });

  it('renders the live branch with a large visualizer (19 bars)', () => {
    renderSkin(Compact, {}, { isLiveStream: true });
    expect(screen.getByText(LIVE_TEXT)).toBeTruthy();
    const visualizer = screen.getByTestId('amuse-visualizer');
    const bars = visualizer.querySelectorAll(
      '.flex.flex-col.items-center.justify-center',
    );
    expect(bars).toHaveLength(19);
  });

  it('applies the magic-colours palette to the first surface', () => {
    renderSkin(Compact, { magic_colors: true });
    const surface = screen.getByTestId('amuse-skin-surface');
    expect(surface.getAttribute('data-magic-colors')).toBe('true');
    expect(getComputedStyle(surface).backgroundColor).toBe('rgb(0, 0, 255)');
    expect(getComputedStyle(surface).color).toBe('rgb(255, 255, 0)');
  });

  it('leaves the surface unstyled when magic_colors=false', () => {
    renderSkin(Compact, { magic_colors: false });
    const surface = screen.getByTestId('amuse-skin-surface');
    expect(surface.getAttribute('data-magic-colors')).toBe('false');
    expect(surface.style.backgroundColor).toBe('');
  });

  it('toggles the cover_blur layer opacity and filter', () => {
    renderSkin(Compact, { cover_blur: true, magic_colors: false });
    const blur = screen.getByTestId('amuse-cover-blur');
    expect(blur.getAttribute('data-cover-blur')).toBe('true');
    expect(blur.style.opacity).toBe('100%');
    expect(blur.style.filter).toBe('blur(15px) brightness(35%)');
  });

  it('toggles the visualizer opacity with hide_visualizer', () => {
    renderSkin(Compact, { hide_visualizer: true });
    const visualizer = screen.getByTestId('amuse-visualizer');
    expect(visualizer.getAttribute('data-hide-visualizer')).toBe('true');
    expect(visualizer.style.opacity).toBe('0%');
  });

  it('matches the Nr snapshot', () => {
    const { container } = renderSkin(
      Compact,
      { theme: Theme.DARK, cover: Cover.SQUARE },
      { title: 'Song X', artist: 'Artist Y' },
    );
    expect(container.firstElementChild).toMatchSnapshot();
  });
});

describe('Boxy skin (Vr)', () => {
  it('renders the PlayerView root with data-skin=boxy', () => {
    renderSkin(Boxy);
    const root = screen.getByTestId('amuse-skin');
    expect(root.getAttribute('data-skin')).toBe('boxy');
    expect(root.className).toBe(
      'relative flex h-full w-full select-none items-center justify-center',
    );
  });

  it('reproduces the Vr DOM hierarchy and class names', () => {
    renderSkin(Boxy, {}, { title: 'Song X', artist: 'Artist Y' });
    const root = screen.getByTestId('amuse-skin');
    const { fontWrapper } = layers(root);
    expect(fontWrapper.className).toContain(
      'bottom-3 flex h-20 select-none items-end gap-2 text-white',
    );
    expect(fontWrapper.children).toHaveLength(3);

    const infoSurface = fontWrapper.children[1] as HTMLElement;
    expect(infoSurface.className).toContain(
      'flex w-56 flex-col justify-center',
    );
    const padded = infoSurface.firstElementChild as HTMLElement;
    expect(padded.className).toBe('px-7');
    expect(padded.children).toHaveLength(3);
    expect(padded.querySelector('p')?.textContent).toBe('Song X');
    expect(padded.querySelectorAll('p')[1]?.textContent).toBe('Artist Y');
    expect(
      padded.querySelector('[data-testid="amuse-cover-blur"]'),
    ).not.toBeNull();

    const timeSurface = fontWrapper.children[2] as HTMLElement;
    expect(timeSurface.getAttribute('data-testid')).toBe('amuse-skin-surface');
    expect(timeSurface.className).toContain(
      'flex w-[204px] items-center px-7 transition-[width]',
    );
    const inner = timeSurface.firstElementChild as HTMLElement;
    expect(inner.className).toBe('flex h-fit w-full flex-col gap-2');
    expect(inner.children).toHaveLength(2);
    expect((inner.children[0] as HTMLElement).className).toBe(
      'flex h-full w-full justify-center',
    );
    expect((inner.children[1] as HTMLElement).id).toBe('playbar');
  });

  it('renders the non-live branch with the exact time classes', () => {
    renderSkin(
      Boxy,
      {},
      {
        progress: 65000,
        duration: 185000,
        isLiveStream: false,
      },
    );
    const progress = screen.getByText('01:05');
    const duration = screen.getByText('03:05');
    expect(progress.className).toContain(
      'mr-4 flex h-[20px] max-w-8 justify-start',
    );
    expect(duration.className).toContain(
      'ml-4 flex h-[20px] max-w-8 justify-end',
    );
  });

  it('renders the live branch with a small visualizer (5 bars)', () => {
    renderSkin(Boxy, {}, { isLiveStream: true });
    expect(screen.getByText(LIVE_TEXT)).toBeTruthy();
    const bars = screen
      .getByTestId('amuse-visualizer')
      .querySelectorAll('.flex.flex-col.items-center.justify-center');
    expect(bars).toHaveLength(5);
  });

  it('matches the Vr snapshot', () => {
    const { container } = renderSkin(
      Boxy,
      { theme: Theme.DARK, cover: Cover.SQUARE },
      { title: 'Song X', artist: 'Artist Y' },
    );
    expect(container.firstElementChild).toMatchSnapshot();
  });
});
