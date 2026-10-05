/**
 * Gallery (`Hr`) + Minimal (`Rr`) skin ports — RTL snapshots + structure/crop
 * assertions.
 *
 * The two skins are rendered in isolation with an injected player store
 * (`createPlayerStore`) and an injected profile-settings provider, mirroring the
 * real widget composition (settings + store + cover dispatch). No cover palette
 * provider is needed: `useCoverColors` falls back to the deterministic default
 * palette in jsdom.
 *
 * Assertions lock the faithful DOM the ports must keep:
 *   - Gallery: the `w-52` "big cover" column, the `h-[63px]` title/artist
 *     surface, the `p-3` control row, the `0.5rem` cover crop/radius and the
 *     `background-size: cover` crop, and the live branch.
 *   - Minimal: the `h-8 w-[400px]` single bar, the marquee, the `•` separator
 *     (with the cover_blur `text-white` rule), and the live branch.
 */

import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand';
import { ProfileSettingsProvider } from '../profile/context';
import { PlayerStoreProvider } from '../player/context';
import {
  createPlayerStore,
  type PlayerTrack,
  type PlayerStore,
} from '../player/store';
import { Skin } from '../settings/registry';
import { Cover, Theme } from '../types/user';
import type { AmuseProfileSettings } from '../profile/settings';
import { Gallery } from './Gallery';
import { Minimal } from './Minimal';

afterEach(cleanup);

const BASE_TRACK: Partial<PlayerTrack> = {
  title: 'Test Song',
  artist: 'Test Artist',
  duration: 180000,
  progress: 60000,
  cover_url: '/assets/cover.png',
  is_playing: true,
  canvas_url: '',
  id: 'track-1',
  isLiveStream: false,
};

const BASE_SETTINGS: Partial<AmuseProfileSettings> = {
  skin: Skin.GALLERY,
  cover: Cover.SQUARE,
  theme: Theme.DARK,
  magic_colors: true,
  cover_blur: false,
  font: 'default',
};

function renderSkin(
  node: ReactNode,
  settings: Partial<AmuseProfileSettings>,
  track: Partial<PlayerTrack>,
): { store: StoreApi<PlayerStore>; container: HTMLElement } {
  const store = createPlayerStore();
  store.getState().setCurrentTrack(track);
  const { container } = render(
    <PlayerStoreProvider store={store}>
      <ProfileSettingsProvider settings={settings}>
        {node}
      </ProfileSettingsProvider>
    </PlayerStoreProvider>,
  );
  return { store, container };
}

/* -------------------------------------------------------------------------- */
/* Gallery (`Hr`)                                                             */
/* -------------------------------------------------------------------------- */

describe('Gallery skin (Hr)', () => {
  it('renders the faithful Hr DOM (snapshot)', () => {
    const { container } = renderSkin(
      <Gallery />,
      { ...BASE_SETTINGS, skin: Skin.GALLERY },
      BASE_TRACK,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders the w-52 big-cover column, h-[63px] surface and p-3 control row', () => {
    const { container } = renderSkin(
      <Gallery />,
      { ...BASE_SETTINGS, skin: Skin.GALLERY },
      BASE_TRACK,
    );

    const root = screen.getByTestId('amuse-skin');
    expect(root.getAttribute('data-skin')).toBe('gallery');
    expect(root.style.padding).toBe('5%');

    // the "big cover" column + custom font class.
    const column = container.querySelector('.w-52');
    expect(column).not.toBeNull();
    expect(column?.className).toContain('flex');
    expect(column?.className).toContain('h-fit');
    expect(column?.className).toContain('w-52');
    expect(column?.className).toContain('flex-col');
    expect(column?.className).toContain('gap-2');
    expect(column?.className).toContain('font-poppins');

    // the title/artist surface is exactly h-[63px].
    const infoSurface = screen.getByTestId('amuse-skin-surface');
    expect(infoSurface.className).toContain('h-[63px]');
    expect(infoSurface.className).toContain('flex-col');
    expect(infoSurface.className).toContain('justify-center');
    expect(infoSurface.className).toContain('px-3');
    expect(infoSurface.className).toContain('py-1');
    expect(infoSurface.getAttribute('data-magic-colors')).toBe('true');

    // the control row is the second surface (p-3).
    const surfaces = container.querySelectorAll('[data-magic-colors]');
    expect(surfaces.length).toBe(2);
    expect(surfaces[1]?.className).toContain('p-3');
    expect(surfaces[1]?.className).toContain('items-center');
    expect(surfaces[1]?.className).toContain('gap-2');

    // title / artist / times text.
    expect(screen.getByText('Test Song')).toBeTruthy();
    expect(screen.getByText('Test Artist')).toBeTruthy();
    expect(screen.getByText('01:00')).toBeTruthy();
    expect(screen.getByText('03:00')).toBeTruthy();

    // playbar + 33.33% active width (60000/180000).
    const playbar = container.querySelector('#playbar');
    expect(playbar).not.toBeNull();
    const active = container.querySelector('#active');
    expect(active?.getAttribute('style')).toContain('33.33333333333333%');
  });

  it('keeps the Gallery cover crop rule (square, 0.5rem radius, size:cover)', () => {
    renderSkin(
      <Gallery />,
      { ...BASE_SETTINGS, skin: Skin.GALLERY },
      BASE_TRACK,
    );

    const cover = screen.getByTestId('amuse-cover');
    expect(cover.getAttribute('data-cover')).toBe('square');
    expect(cover.className).toContain('aspect-square');

    const art = screen.getByTestId('amuse-cover-art');
    expect(art.style.borderRadius).toBe('0.5rem');

    const image = screen.getByTestId('amuse-cover-art-image');
    expect(image.style.backgroundSize).toBe('cover');
    // jsdom normalises the single `center` keyword to `center center`.
    expect(image.style.backgroundPosition).toBe('center center');
  });

  it('renders the live branch instead of the times', () => {
    const { container } = renderSkin(
      <Gallery />,
      { ...BASE_SETTINGS, skin: Skin.GALLERY },
      { ...BASE_TRACK, isLiveStream: true },
    );

    expect(screen.getByText('Live')).toBeTruthy();
    expect(screen.queryByText('01:00')).toBeNull();
    expect(screen.queryByText('03:00')).toBeNull();
    // the live branch still renders the playbar.
    expect(container.querySelector('#playbar')).not.toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Minimal (`Rr`)                                                             */
/* -------------------------------------------------------------------------- */

describe('Minimal skin (Rr)', () => {
  it('renders the faithful Rr DOM (snapshot)', () => {
    const { container } = renderSkin(
      <Minimal />,
      { ...BASE_SETTINGS, skin: Skin.MINIMAL },
      BASE_TRACK,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders the h-8 w-[400px] bar with marquee, separator and playbar', () => {
    const { container } = renderSkin(
      <Minimal />,
      { ...BASE_SETTINGS, skin: Skin.MINIMAL },
      BASE_TRACK,
    );

    const root = screen.getByTestId('amuse-skin');
    expect(root.getAttribute('data-skin')).toBe('minimal');

    const bar = screen.getByTestId('amuse-skin-surface');
    expect(bar.className).toContain('relative');
    expect(bar.className).toContain('h-8');
    expect(bar.className).toContain('w-[400px]');
    expect(bar.className).toContain('items-center');
    expect(bar.className).toContain('justify-between');
    expect(bar.className).toContain('overflow-hidden');

    // cover present (minimized layout still shows the cover).
    expect(screen.getByTestId('amuse-cover').getAttribute('data-cover')).toBe(
      'square',
    );

    // marquee wrapper (bs) with the ml-3 class.
    const marquee = container.querySelector('.ml-3');
    expect(marquee).not.toBeNull();
    expect(marquee?.className).toContain('overflow-hidden');
    expect(marquee?.className).toContain('whitespace-nowrap');

    // title + separator + artist. The title text lives in an inner <span>, so
    // assert against its wrapping <p> (the `ee` element).
    const titleParagraph = screen.getByText('Test Song').closest('p');
    expect(titleParagraph?.className).toContain('m-0');
    expect(titleParagraph?.className).toContain('text-sm');
    expect(screen.getByText('\u2022')).toBeTruthy();
    const artistParagraph = screen.getByText('Test Artist').closest('p');
    expect(artistParagraph?.className).toContain('m-0');

    // playbar (Z) with mx-3 w-24.
    const playbar = container.querySelector('#playbar');
    expect(playbar).not.toBeNull();
    expect(playbar?.className).toContain('mx-3');
    expect(playbar?.className).toContain('w-24');

    // blurred cover layer (_e) inside the bar.
    const blur = screen.getByTestId('amuse-cover-blur');
    expect(blur.getAttribute('data-cover-blur')).toBe('false');
    expect(blur.className).toContain('h-[200%]');
    expect(blur.className).toContain('w-[200%]');
  });

  it('applies the cover_blur text-white rule to the separator', () => {
    renderSkin(
      <Minimal />,
      { ...BASE_SETTINGS, skin: Skin.MINIMAL, cover_blur: true },
      BASE_TRACK,
    );

    expect(screen.getByText('\u2022').className).toContain('text-white');
  });

  it('renders the live branch instead of the playbar', () => {
    const { container } = renderSkin(
      <Minimal />,
      { ...BASE_SETTINGS, skin: Skin.MINIMAL },
      { ...BASE_TRACK, isLiveStream: true },
    );

    expect(screen.getByText('Live')).toBeTruthy();
    expect(container.querySelector('#playbar')).toBeNull();
  });
});
