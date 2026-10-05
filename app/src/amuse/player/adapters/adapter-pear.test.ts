/**
 * Tests for the Pear Desktop source adapter (plan Todo 9).
 *
 * Fixtures mirror the exact `GET http://localhost:9863/query` payload shape
 * read by the original (`app/_reference/AmuseWidget.js:3176-3254`). All four
 * branches are asserted: normal / live-stream / advertisement / empty-or-error.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlaybackState, WidgetStatus } from '../store';
import {
  createPearDesktopAdapter,
  createPearDesktopNothingPlayingResult,
  isPearDesktopAdvertisement,
  mapPearDesktopResponse,
  PEAR_DESKTOP_AD_COVER,
  PEAR_DESKTOP_AD_DURATIONS,
  PEAR_DESKTOP_POLL_INTERVAL_MS,
  PEAR_DESKTOP_QUERY_URL,
  type PearDesktopQuery,
} from './pear-desktop';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const normalFixture: PearDesktopQuery = {
  track: {
    id: 'track-1',
    title: 'Song Title',
    author: 'Some Artist',
    duration: 200,
    isAdvertisement: false,
    cover: 'https://example.com/cover.jpg',
  },
  player: {
    hasSong: true,
    seekbarCurrentPosition: 42,
    isPaused: false,
  },
};

const liveFixture: PearDesktopQuery = {
  track: {
    id: 'live-1',
    title: 'Live Radio',
    author: 'The DJ',
    duration: 0,
    isAdvertisement: false,
    cover: 'https://example.com/live.jpg',
  },
  player: {
    hasSong: true,
    seekbarCurrentPosition: 5,
    isPaused: false,
  },
};

const adByAuthorFixture: PearDesktopQuery = {
  track: {
    id: 'ad-1',
    title: 'Anything',
    author: 'Video will play after ad',
    duration: 200,
    cover: 'https://example.com/x.jpg',
  },
  player: { hasSong: true, seekbarCurrentPosition: 3, isPaused: false },
};

const adByFlagFixture: PearDesktopQuery = {
  track: {
    id: 'ad-2',
    title: 'Anything',
    author: 'Some Artist',
    duration: 200,
    isAdvertisement: true,
    cover: 'https://example.com/x.jpg',
  },
  player: { hasSong: true, seekbarCurrentPosition: 3, isPaused: false },
};

const emptyFixture: PearDesktopQuery = {
  track: {
    id: '',
    title: '',
    author: '',
    duration: 0,
    isAdvertisement: false,
    cover: '',
  },
  player: { hasSong: false, seekbarCurrentPosition: 0, isPaused: false },
};

/* -------------------------------------------------------------------------- */
/* Constants — exact URL / interval / ad cover                                 */
/* -------------------------------------------------------------------------- */

describe('pear-desktop constants', () => {
  it('uses the exact original query URL and 1s poll interval', () => {
    expect(PEAR_DESKTOP_QUERY_URL).toBe('http://localhost:9863/query');
    expect(PEAR_DESKTOP_POLL_INTERVAL_MS).toBe(1000);
    expect(PEAR_DESKTOP_AD_COVER).toBe('/assets/spotify_ad_cover-B6syg7Z1.svg');
  });

  it('uses the original ad duration set {10,15,20,30}', () => {
    expect([...PEAR_DESKTOP_AD_DURATIONS]).toEqual([10, 15, 20, 30]);
  });
});

/* -------------------------------------------------------------------------- */
/* Branch 1 — normal                                                           */
/* -------------------------------------------------------------------------- */

describe('pear-desktop normal branch', () => {
  it('maps fields and multiplies duration/progress by 1000', () => {
    const result = mapPearDesktopResponse(normalFixture);
    expect(result.playbackState).toBe(PlaybackState.PLAYING);
    expect(result.widgetState).toBe(WidgetStatus.SUCCESS);
    expect(result.track).toEqual({
      title: 'Song Title',
      artist: 'Some Artist',
      duration: 200_000,
      progress: 42_000,
      cover_url: 'https://example.com/cover.jpg',
      is_playing: true,
      canvas_url: '',
      id: 'track-1',
      isLiveStream: false,
    });
  });

  it('maps isPaused=true to is_playing=false', () => {
    const result = mapPearDesktopResponse({
      ...normalFixture,
      player: { ...normalFixture.player, isPaused: true },
    });
    expect(result.track.is_playing).toBe(false);
  });

  it('does not treat a normal duration as an ad', () => {
    expect(isPearDesktopAdvertisement(normalFixture.track)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Branch 2 — live stream                                                      */
/* -------------------------------------------------------------------------- */

describe('pear-desktop live-stream branch', () => {
  it('duration===0 -> isLiveStream:true, progress:100, duration:100', () => {
    const result = mapPearDesktopResponse(liveFixture);
    expect(result.playbackState).toBe(PlaybackState.PLAYING);
    expect(result.widgetState).toBe(WidgetStatus.SUCCESS);
    expect(result.track.isLiveStream).toBe(true);
    expect(result.track.progress).toBe(100);
    expect(result.track.duration).toBe(100);
    expect(result.track.title).toBe('Live Radio');
    expect(result.track.artist).toBe('The DJ');
    expect(result.track.cover_url).toBe('https://example.com/live.jpg');
    expect(result.track.id).toBe('live-1');
  });
});

/* -------------------------------------------------------------------------- */
/* Branch 3 — advertisement                                                    */
/* -------------------------------------------------------------------------- */

describe('pear-desktop advertisement branch', () => {
  it('detects author === "Video will play after ad"', () => {
    expect(isPearDesktopAdvertisement(adByAuthorFixture.track)).toBe(true);
    const result = mapPearDesktopResponse(adByAuthorFixture);
    expect(result.playbackState).toBe(PlaybackState.ADVERTISEMENT);
    expect(result.track.title).toBe('Ad Break');
    expect(result.track.artist).toBe('Music will resume shortly');
    expect(result.track.cover_url).toBe(PEAR_DESKTOP_AD_COVER);
    expect(result.track.progress).toBe(0);
    expect(result.track.duration).toBe(0);
    expect(result.track.id).toBe('ad-1');
  });

  it('detects isAdvertisement flag', () => {
    expect(isPearDesktopAdvertisement(adByFlagFixture.track)).toBe(true);
    const result = mapPearDesktopResponse(adByFlagFixture);
    expect(result.playbackState).toBe(PlaybackState.ADVERTISEMENT);
    expect(result.track.title).toBe('Ad Break');
  });

  it.each([10, 15, 20, 30])('detects raw duration %i as an ad', (duration) => {
    const fixture: PearDesktopQuery = {
      ...normalFixture,
      track: { ...normalFixture.track, duration },
    };
    expect(isPearDesktopAdvertisement(fixture.track)).toBe(true);
    const result = mapPearDesktopResponse(fixture);
    expect(result.playbackState).toBe(PlaybackState.ADVERTISEMENT);
    expect(result.track.title).toBe('Ad Break');
    expect(result.track.artist).toBe('Music will resume shortly');
  });

  it('does NOT treat a 100s track as an ad', () => {
    const fixture: PearDesktopQuery = {
      ...normalFixture,
      track: { ...normalFixture.track, duration: 100 },
    };
    expect(isPearDesktopAdvertisement(fixture.track)).toBe(false);
    expect(mapPearDesktopResponse(fixture).playbackState).toBe(
      PlaybackState.PLAYING,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Branch 4 — empty playback / error                                           */
/* -------------------------------------------------------------------------- */

describe('pear-desktop empty-playback branch', () => {
  it('hasSong:false && title:"" -> NOTHING_PLAYING', () => {
    const result = mapPearDesktopResponse(emptyFixture);
    expect(result.playbackState).toBe(PlaybackState.NOTHING_PLAYING);
    expect(result.widgetState).toBe(WidgetStatus.SUCCESS);
    expect(result.track.title).toBe('Nothing Playing');
    expect(result.track.artist).toBe('Get the music started');
    expect(result.track.duration).toBe(0);
    expect(result.track.progress).toBe(0);
    expect(result.track.is_playing).toBe(false);
  });

  it('treats null/undefined payload as NOTHING_PLAYING', () => {
    expect(mapPearDesktopResponse(null).playbackState).toBe(
      PlaybackState.NOTHING_PLAYING,
    );
    expect(mapPearDesktopResponse(undefined).playbackState).toBe(
      PlaybackState.NOTHING_PLAYING,
    );
  });

  it('exposes a standalone nothing-playing result factory', () => {
    const result = createPearDesktopNothingPlayingResult();
    expect(result.playbackState).toBe(PlaybackState.NOTHING_PLAYING);
    expect(result.track.id).toBe('');
    expect(result.track.isLiveStream).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Polling adapter — injectable fetcher, 1000 ms, start/stop                   */
/* -------------------------------------------------------------------------- */

describe('pear-desktop polling adapter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('pollOnce maps the fetched payload', async () => {
    const fetcher = vi.fn().mockResolvedValue(normalFixture);
    const adapter = createPearDesktopAdapter({ fetcher });
    const result = await adapter.pollOnce();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.track.duration).toBe(200_000);
    expect(result.playbackState).toBe(PlaybackState.PLAYING);
  });

  it('pollOnce catches a thrown fetch -> NOTHING_PLAYING + onError', async () => {
    const error = new Error('connection refused');
    const fetcher = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();
    const onUpdate = vi.fn();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const adapter = createPearDesktopAdapter({ fetcher, onError, onUpdate });

    const result = await adapter.pollOnce();

    expect(result.playbackState).toBe(PlaybackState.NOTHING_PLAYING);
    expect(onError).toHaveBeenCalledWith(error);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it('start() polls immediately then every 1000ms; stop() halts', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue(normalFixture);
    const onUpdate = vi.fn();
    const adapter = createPearDesktopAdapter({ fetcher, onUpdate });

    adapter.start();
    expect(adapter.isRunning).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(2000);
    expect(fetcher).toHaveBeenCalledTimes(4);

    adapter.stop();
    expect(adapter.isRunning).toBe(false);
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(onUpdate).toHaveBeenCalled();
  });

  it('start() is idempotent (no duplicate timers)', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue(normalFixture);
    const adapter = createPearDesktopAdapter({ fetcher });

    adapter.start();
    adapter.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    adapter.stop();
  });

  it('default interval constant is the original 1s', () => {
    expect(PEAR_DESKTOP_POLL_INTERVAL_MS).toBe(1000);
  });
});
