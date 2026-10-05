import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ProfileSettingsProvider } from '../profile/context';
import { PlayerStoreProvider } from '../player/context';
import { createPlayerStore } from '../player/store';
import { Cover } from '../types/user';
import { COVER_COMPONENTS, CoverView } from './index';
import { NoneCover } from './NoneCover';
import {
  SQUARE_COVER_MASK,
  SQUARE_COVER_RADIUS,
  SquareCover,
} from './SquareCover';

afterEach(cleanup);

const COVER_URL = 'https://example.test/album-art.png';

/**
 * Renders `SquareCover` with an isolated store (cover url) and profile settings,
 * mirroring the original `k()` settings + `b(s => s.currentTrack.cover_url)`
 * store reads.
 */
function renderSquare(
  settings: { cover_glow?: boolean } = {},
  coverUrl: string = COVER_URL,
) {
  const store = createPlayerStore();
  store.getState().setCurrentTrack({ cover_url: coverUrl });
  return render(
    <PlayerStoreProvider store={store}>
      <ProfileSettingsProvider settings={{ cover: Cover.SQUARE, ...settings }}>
        <SquareCover />
      </ProfileSettingsProvider>
    </PlayerStoreProvider>,
  );
}

describe('cover / square', () => {
  it('renders the original `Q` -> `ms` DOM hierarchy with exact classes', () => {
    renderSquare({ cover_glow: true });

    // Q outer: div.relative.aspect-square.h-full
    const root = screen.getByTestId('amuse-cover');
    expect(root.getAttribute('data-cover')).toBe('square');
    expect(root.className).toBe('relative aspect-square h-full');

    // Q inner: div.relative.h-full.w-full.transform-gpu [transformOrigin center]
    const transform = root.firstElementChild as HTMLElement;
    expect(transform.className).toBe('relative h-full w-full transform-gpu');
    expect(transform.style.transformOrigin).toBe('center center');

    // Q z-50 -> ms album art -> ms art wrapper (overflow-hidden + radius + mask).
    const art = screen.getByTestId('amuse-cover-art');
    expect(art.className).toBe(
      'relative flex aspect-square items-center justify-center overflow-hidden',
    );
    expect(art.style.borderRadius).toBe(SQUARE_COVER_RADIUS);
    expect(art.style.borderRadius).toBe('0.5rem');
    // jsdom normalizes `circle at center` -> `circle`; assert the value is applied.
    expect(SQUARE_COVER_MASK).toContain('radial-gradient');
    expect(art.style.maskImage).toContain('radial-gradient');
    expect(art.style.maskImage).toContain('-0.5%');

    // ms cover image layer (crop: background-size cover, centered).
    const artImage = screen.getByTestId('amuse-cover-art-image');
    expect(artImage.className).toBe('absolute inset-0');
    expect(artImage.style.backgroundImage).toContain(COVER_URL);
    expect(artImage.style.backgroundSize).toBe('cover');
    // jsdom normalizes the single-value `center` -> `center center`.
    expect(artImage.style.backgroundPosition).toContain('center');
  });

  it('renders the blurred glow layer with the exact classes + cover crop', () => {
    renderSquare({ cover_glow: true });

    const glow = screen.getByTestId('amuse-cover-glow');
    expect(glow.className).toBe(
      'absolute inset-0 overflow-hidden blur-md brightness-150',
    );
    expect(glow.getAttribute('data-cover-glow')).toBe('true');
    expect(glow.style.opacity).toBe('1');
    expect(glow.style.borderRadius).toBe('0.5rem');

    const glowImage = screen.getByTestId('amuse-cover-glow-image');
    expect(glowImage.className).toBe('absolute inset-0');
    expect(glowImage.style.backgroundImage).toContain(COVER_URL);
    // jsdom normalizes the single-value `center` -> `center center`.
    expect(glowImage.style.backgroundPosition).toContain('center');
    expect(glowImage.style.backgroundRepeat).toBe('no-repeat');
    expect(glowImage.style.backgroundSize).toBe('cover');
  });

  it('toggles the glow opacity on settings.cover_glow', () => {
    renderSquare({ cover_glow: true });
    expect(screen.getByTestId('amuse-cover-glow').style.opacity).toBe('1');
    expect(
      screen.getByTestId('amuse-cover-glow').getAttribute('data-cover-glow'),
    ).toBe('true');

    cleanup();

    renderSquare({ cover_glow: false });
    expect(screen.getByTestId('amuse-cover-glow').style.opacity).toBe('0');
    expect(
      screen.getByTestId('amuse-cover-glow').getAttribute('data-cover-glow'),
    ).toBe('false');
  });

  it('renders no album-art image layer when cover_url is empty (glow still present)', () => {
    renderSquare({ cover_glow: true }, '');

    expect(screen.queryByTestId('amuse-cover-art-image')).toBeNull();
    // `Q` always renders the glow image wrapper, even with an empty url.
    const glowImage = screen.getByTestId('amuse-cover-glow-image');
    expect(glowImage.style.backgroundImage).toBe('');
    // cover_glow && cover_url -> false, so the glow is transparent.
    expect(screen.getByTestId('amuse-cover-glow').style.opacity).toBe('0');
  });

  it('uses the original default 0.5rem radius', () => {
    expect(SQUARE_COVER_RADIUS).toBe('0.5rem');
    renderSquare();
    expect(screen.getByTestId('amuse-cover-art').style.borderRadius).toBe(
      '0.5rem',
    );
    expect(screen.getByTestId('amuse-cover-glow').style.borderRadius).toBe(
      '0.5rem',
    );
  });

  it('matches the reference square structure (snapshot)', () => {
    const { container } = renderSquare({ cover_glow: true });
    expect(container.firstChild).toMatchSnapshot();
  });

  it('dispatches Cover.SQUARE to SquareCover', () => {
    expect(COVER_COMPONENTS[Cover.SQUARE]).toBe(SquareCover);
  });
});

describe('cover / none', () => {
  it('renders NO node at all', () => {
    const { container } = render(<NoneCover />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('amuse-cover')).toBeNull();
  });

  it('dispatches Cover.NONE to NoneCover', () => {
    expect(COVER_COMPONENTS[Cover.NONE]).toBe(NoneCover);
  });

  it('renders no cover node through the dispatch when settings.cover=none', () => {
    const store = createPlayerStore();
    const { container } = render(
      <PlayerStoreProvider store={store}>
        <ProfileSettingsProvider settings={{ cover: Cover.NONE }}>
          <CoverView />
        </ProfileSettingsProvider>
      </PlayerStoreProvider>,
    );

    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('amuse-cover')).toBeNull();
  });
});
