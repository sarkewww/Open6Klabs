/**
 * Tests for the canvas (video) cover — `app/src/amuse/covers/CanvasCover.tsx`.
 *
 * Asserts the plan Todo 18 acceptance surface:
 *   - the video iframe `src` (YouTube embed) + its `.video-container` wrapper;
 *   - the lazy-mount gate (only while playing);
 *   - the no-`canvas_url` fallback branch (no iframe / no `.video-container`).
 *
 * The acceptance filter `pnpm --dir app test -- cover-canvas` matches by FILE
 * PATH, so this file is named `cover-canvas.test.tsx`.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PlayerStoreProvider } from '../player/context';
import { createPlayerStore } from '../player/store';
import { ProfileSettingsProvider } from '../profile/context';
import type { AmuseProfileSettings } from '../profile/settings';
import { Cover } from '../types/user';
import {
  CanvasCover,
  YOUTUBE_EMBED_ORIGIN,
  YOUTUBE_IFRAME_ALLOW,
  buildYouTubeEmbedUrl,
  parseYouTubeId,
} from './CanvasCover';

afterEach(cleanup);

const YOUTUBE_ID = 'dQw4w9WgXcQ';
const YOUTUBE_WATCH_URL = `https://www.youtube.com/watch?v=${YOUTUBE_ID}`;

function renderCanvas(
  options: {
    cover?: Cover;
    canvasUrl?: string;
    coverUrl?: string;
    isPlaying?: boolean;
  } = {},
) {
  const {
    cover = Cover.CANVAS,
    canvasUrl = YOUTUBE_WATCH_URL,
    coverUrl = 'https://example.com/cover.jpg',
    isPlaying = true,
  } = options;

  const store = createPlayerStore();
  store.getState().setCurrentTrack({
    canvas_url: canvasUrl,
    cover_url: coverUrl,
    is_playing: isPlaying,
  });

  const settings: Partial<AmuseProfileSettings> = { cover };

  return render(
    <ProfileSettingsProvider settings={settings}>
      <PlayerStoreProvider store={store}>
        <CanvasCover />
      </PlayerStoreProvider>
    </ProfileSettingsProvider>,
  );
}

/* -------------------------------------------------------------------------- */
/* YouTube parsing — verbatim reference regex                                 */
/* -------------------------------------------------------------------------- */

describe('parseYouTubeId', () => {
  it.each([
    ['watch?v=', YOUTUBE_WATCH_URL],
    ['watch with extra params', `${YOUTUBE_WATCH_URL}&t=42s`],
    ['short youtu.be', `https://youtu.be/${YOUTUBE_ID}`],
    ['embed', `https://www.youtube.com/embed/${YOUTUBE_ID}`],
    ['legacy /v/', `https://www.youtube.com/v/${YOUTUBE_ID}`],
  ])('extracts the 11-char id from %s', (_label, url) => {
    expect(parseYouTubeId(url)).toBe(YOUTUBE_ID);
  });

  it.each([
    ['empty string', ''],
    ['non-YouTube URL', 'https://example.com/canvas/video.mp4'],
    ['YouTube channel URL', 'https://www.youtube.com/@somechannel'],
  ])('returns null for %s', (_label, url) => {
    expect(parseYouTubeId(url)).toBeNull();
  });

  it('returns null for null/undefined', () => {
    expect(parseYouTubeId(null)).toBeNull();
    expect(parseYouTubeId(undefined)).toBeNull();
  });
});

describe('buildYouTubeEmbedUrl', () => {
  it('builds the reference embed URL', () => {
    expect(buildYouTubeEmbedUrl(YOUTUBE_ID)).toBe(
      `${YOUTUBE_EMBED_ORIGIN}${YOUTUBE_ID}`,
    );
    expect(buildYouTubeEmbedUrl(YOUTUBE_ID)).toBe(
      `https://www.youtube.com/embed/${YOUTUBE_ID}`,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Component — iframe + .video-container geometry                             */
/* -------------------------------------------------------------------------- */

describe('CanvasCover', () => {
  it('renders a YouTube iframe inside a .video-container when playing', () => {
    renderCanvas();

    const container = screen.getByTestId('amuse-canvas-video-container');
    expect(container.classList.contains('video-container')).toBe(true);

    const iframe = screen.getByTestId(
      'amuse-canvas-iframe',
    ) as HTMLIFrameElement;
    expect(iframe.tagName).toBe('IFRAME');
    expect(iframe.getAttribute('src')).toBe(
      `https://www.youtube.com/embed/${YOUTUBE_ID}`,
    );
    expect(container.contains(iframe)).toBe(true);
  });

  it('preserves the reference embed attributes (allow list, lazy-load)', () => {
    renderCanvas();

    const iframe = screen.getByTestId(
      'amuse-canvas-iframe',
    ) as HTMLIFrameElement;
    expect(iframe.getAttribute('allow')).toBe(YOUTUBE_IFRAME_ALLOW);
    expect(iframe.hasAttribute('allowfullscreen')).toBe(true);
    expect(iframe.getAttribute('loading')).toBe('lazy');
  });

  it('does NOT set inline iframe dimensions (the .video-container CSS owns them)', () => {
    renderCanvas();

    const iframe = screen.getByTestId(
      'amuse-canvas-iframe',
    ) as HTMLIFrameElement;
    expect(iframe.style.width).toBe('');
    expect(iframe.style.height).toBe('');
    expect(iframe.style.top).toBe('');
  });

  /* ------------------------------------------------------------------------ */
  /* Fallback branch                                                          */
  /* ------------------------------------------------------------------------ */

  it('renders the album-art fallback (no iframe / no .video-container) when canvas_url is empty', () => {
    const { container } = renderCanvas({ canvasUrl: '' });

    expect(screen.queryByTestId('amuse-canvas-iframe')).toBeNull();
    expect(screen.queryByTestId('amuse-canvas-video-container')).toBeNull();
    expect(container.querySelector('.video-container')).toBeNull();
    expect(screen.getByTestId('amuse-canvas-fallback')).toBeTruthy();
  });

  it('falls back when canvas_url is not a YouTube URL', () => {
    renderCanvas({ canvasUrl: 'https://example.com/canvas/video.mp4' });

    expect(screen.queryByTestId('amuse-canvas-iframe')).toBeNull();
    expect(screen.getByTestId('amuse-canvas-fallback')).toBeTruthy();
  });

  it('lazily mounts the iframe only while the track is playing', () => {
    renderCanvas({ isPlaying: false });

    expect(screen.queryByTestId('amuse-canvas-iframe')).toBeNull();
    expect(screen.getByTestId('amuse-canvas-fallback')).toBeTruthy();
  });

  it('exposes the root cover hooks (data-cover="canvas")', () => {
    renderCanvas();
    expect(screen.getByTestId('amuse-cover').getAttribute('data-cover')).toBe(
      'canvas',
    );
  });
});
