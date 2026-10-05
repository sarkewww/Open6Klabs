import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerStoreProvider } from '../player/context';
import { createPlayerStore } from '../player/store';
import { ProfileSettingsProvider } from '../profile/context';
import { Cover } from '../types/user';
import {
  VINYL_SPIN_DIRECTION,
  VINYL_SPIN_FRAME_RATE,
  VINYL_SPIN_PERIOD_SECONDS,
  VINYL_SPIN_SETTLE_EPSILON_DEG,
  VINYL_SPIN_SMOOTHING,
  VINYL_SPIN_START_DELAY_MS,
  VINYL_SPIN_TARGET_DEG_PER_FRAME,
  VinylCover,
} from './VinylCover';

const COVER_URL = 'https://example.test/album.png';

/**
 * The vinyl rotation loop is imperative (`style.transform = rotateZ(...)` via
 * `requestAnimationFrame`). Vitest's fake timers fake `requestAnimationFrame`
 * too, so `advanceTimersByTime` steps the loop deterministically
 * (`requestAnimationFrame` fires on a 16 ms cadence).
 */
function advanceFrames(count: number): void {
  act(() => {
    vi.advanceTimersByTime(16 * count);
  });
}

function rotateDegrees(element: HTMLElement): number {
  const match = /rotateZ\((-?[\d.]+)deg\)/.exec(element.style.transform);
  return match ? Number(match[1]) : Number.NaN;
}

function renderVinyl(
  options: { isPlaying?: boolean; coverUrl?: string; coverGlow?: boolean } = {},
) {
  const {
    isPlaying = false,
    coverUrl = COVER_URL,
    coverGlow = false,
  } = options;
  const store = createPlayerStore();
  store
    .getState()
    .setCurrentTrack({ cover_url: coverUrl, is_playing: isPlaying });

  const view = render(
    <PlayerStoreProvider store={store}>
      <ProfileSettingsProvider
        settings={{ cover: Cover.VINYL, cover_glow: coverGlow }}
      >
        <VinylCover />
      </ProfileSettingsProvider>
    </PlayerStoreProvider>,
  );

  return { store, view };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('VinylCover (Todo 19 — spinning vinyl)', () => {
  it('renders the paused disc structure (snapshot)', () => {
    const { view } = renderVinyl({ isPlaying: false });
    expect(view.asFragment()).toMatchSnapshot();
  });

  it('renders the playing disc structure (snapshot)', () => {
    const { view } = renderVinyl({ isPlaying: true, coverGlow: true });
    expect(view.asFragment()).toMatchSnapshot();
  });

  it('renders a circular disc with a masked centre cover and a centre dot', () => {
    renderVinyl({ isPlaying: false });

    const cover = screen.getByTestId('amuse-cover');
    expect(cover.getAttribute('data-cover')).toBe('vinyl');

    const disc = screen.getByTestId('amuse-vinyl-disc');
    expect(disc.className).toBe('relative h-full w-full transform-gpu');
    expect(disc.style.transformOrigin).toBe('center center');

    const center = screen.getByTestId('amuse-vinyl-center');
    // Original `ms` clip: a rounded square (`borderRadius: 3.5rem` in `boxy`)
    // masked to the vinyl centre-hole gradient — NOT a `rounded-full` disc.
    expect(center.className).toBe(
      'relative flex aspect-square items-center justify-center overflow-hidden',
    );
    expect(center.style.borderRadius).toBe('3.5rem');
    // jsdom's cssstyle drops `-webkit-mask-image`; assert the serialized style.
    expect(center.getAttribute('style')).toContain('radial-gradient');
    expect(center.getAttribute('style')).toContain('transparent 5.5%');
    expect(center.getAttribute('style')).toContain('black 5.5%');

    const art = screen.getByTestId('amuse-vinyl-center-art');
    expect(art.getAttribute('style')).toContain(COVER_URL);

    const hole = screen.getByTestId('amuse-vinyl-center-hole');
    expect(hole.className).toContain('h-[20%]');
    expect(hole.className).toContain('w-[20%]');
    expect(hole.className).toContain('rounded-full');
  });

  it('exposes the exact original rotation parameters on the disc', () => {
    renderVinyl({ isPlaying: false });
    const disc = screen.getByTestId('amuse-vinyl-disc');

    expect(disc.getAttribute('data-spin-direction')).toBe('clockwise');
    expect(disc.getAttribute('data-spin-target-deg-per-frame')).toBe('0.7');
    expect(disc.getAttribute('data-spin-smoothing')).toBe('0.05');
    expect(disc.getAttribute('data-spin-start-delay-ms')).toBe('500');
    expect(disc.getAttribute('data-spin-settle-epsilon-deg')).toBe('0.05');
    expect(disc.getAttribute('data-spin-frame-rate')).toBe('60');
    expect(Number(disc.getAttribute('data-spin-period-seconds'))).toBeCloseTo(
      8.571428571,
      6,
    );

    expect(VINYL_SPIN_DIRECTION).toBe('clockwise');
    expect(VINYL_SPIN_TARGET_DEG_PER_FRAME).toBe(0.7);
    expect(VINYL_SPIN_SMOOTHING).toBe(0.05);
    expect(VINYL_SPIN_START_DELAY_MS).toBe(500);
    expect(VINYL_SPIN_SETTLE_EPSILON_DEG).toBe(0.05);
    expect(VINYL_SPIN_FRAME_RATE).toBe(60);
    expect(VINYL_SPIN_PERIOD_SECONDS).toBeCloseTo(360 / (0.7 * 60), 10);
  });

  it('links data-spinning to is_playing (playing => true, paused => false)', () => {
    const playing = renderVinyl({ isPlaying: true });
    expect(
      screen.getByTestId('amuse-vinyl-disc').getAttribute('data-spinning'),
    ).toBe('true');
    playing.view.unmount();

    const paused = renderVinyl({ isPlaying: false });
    expect(
      screen.getByTestId('amuse-vinyl-disc').getAttribute('data-spinning'),
    ).toBe('false');
    paused.view.unmount();
  });

  it('keeps the disc still while paused', () => {
    renderVinyl({ isPlaying: false });
    const disc = screen.getByTestId('amuse-vinyl-disc');

    advanceFrames(5);
    expect(rotateDegrees(disc)).toBe(0);

    advanceFrames(60);
    expect(rotateDegrees(disc)).toBe(0);
  });

  it('advances the disc clockwise while playing after the 500ms start delay', () => {
    renderVinyl({ isPlaying: true });
    const disc = screen.getByTestId('amuse-vinyl-disc');

    // No rotation until the original 500 ms start delay elapses.
    expect(disc.style.transform).toBe('');
    act(() => {
      vi.advanceTimersByTime(VINYL_SPIN_START_DELAY_MS);
    });
    expect(disc.style.transform).toBe('');

    advanceFrames(1);
    const first = rotateDegrees(disc);
    expect(first).toBeGreaterThan(0);

    advanceFrames(9);
    const second = rotateDegrees(disc);
    expect(second).toBeGreaterThan(first);
  });

  it('decelerates to a stop when playback pauses', () => {
    const { store } = renderVinyl({ isPlaying: true });

    act(() => {
      vi.advanceTimersByTime(VINYL_SPIN_START_DELAY_MS);
    });
    advanceFrames(30);

    const disc = screen.getByTestId('amuse-vinyl-disc');
    expect(rotateDegrees(disc)).toBeGreaterThan(0);

    act(() => {
      store.getState().setCurrentTrack({ is_playing: false });
    });
    advanceFrames(400);

    expect(rotateDegrees(disc)).toBe(0);
  });
});
