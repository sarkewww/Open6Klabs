import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SPOTIFY_NO_COVER_IMAGE } from '../settings/registry';
import { MusicSource } from '../types/user';
import {
  DEFAULT_PLAYER_TRACK,
  PlaybackState,
  WidgetStatus,
  getProgressState,
  usePlayerStore,
} from './store';

/** Reset the module singleton (including the module-level progress clock). */
function resetStore(): void {
  const store = usePlayerStore.getState();
  store.resetCurrentTrack();
  store.setActiveMusicService(null);
  store.setPlaybackState(PlaybackState.NOTHING_PLAYING);
  store.setWidgetState(WidgetStatus.LOADING);
  store.setRawSpotifyItem(null);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
  resetStore();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('player store defaults', () => {
  it('starts with the original placeholder track and default state', () => {
    const state = usePlayerStore.getState();
    expect(state.currentTrack).toEqual({
      title: '-',
      artist: '-',
      duration: 1,
      progress: 0,
      cover_url: SPOTIFY_NO_COVER_IMAGE,
      is_playing: false,
      canvas_url: '',
      id: '',
      isLiveStream: false,
    });
    expect(state.playbackState).toBe('nothing_playing');
    expect(state.widgetState).toBe('LOADING');
    expect(state.progress).toBe(0);
    expect(state.progressUpdateVersion).toBe(0);
    expect(state.rawSpotifyItem).toBeNull();
    expect(state.activeMusicService).toBeNull();
  });

  it('exposes the original 5 PlaybackState and 15 WidgetStatus members', () => {
    expect(Object.values(PlaybackState)).toEqual([
      'nothing_playing',
      'playing',
      'rate_limited',
      'advertisement',
      'token_expired',
    ]);
    expect(Object.values(WidgetStatus)).toHaveLength(15);
    expect(Object.values(WidgetStatus)).toContain('DISABLED_PRO_SKIN');
  });
});

describe('setCurrentTrack', () => {
  it('merges a partial and advances progressUpdateVersion', () => {
    usePlayerStore.getState().setCurrentTrack({
      id: 'track-1',
      title: 'Hello',
      artist: 'World',
      duration: 100000,
      is_playing: true,
    });
    const state = usePlayerStore.getState();
    expect(state.currentTrack).toMatchObject({
      id: 'track-1',
      title: 'Hello',
      artist: 'World',
      duration: 100000,
      is_playing: true,
      progress: 0,
      cover_url: SPOTIFY_NO_COVER_IMAGE,
    });
    expect(state.progress).toBe(0);
    expect(state.progressUpdateVersion).toBe(1);
  });

  it('applies an incoming progress and computes the percentage', () => {
    usePlayerStore
      .getState()
      .setCurrentTrack({ id: 'track-1', duration: 100000, is_playing: true });
    usePlayerStore.getState().setCurrentTrack({ progress: 25000 });
    const state = usePlayerStore.getState();
    expect(state.currentTrack.progress).toBe(25000);
    expect(state.progress).toBe(25);
    expect(state.progressUpdateVersion).toBe(2);
  });

  it('clamps progress to the track duration', () => {
    usePlayerStore
      .getState()
      .setCurrentTrack({ id: 'track-1', duration: 100000, is_playing: true });
    usePlayerStore.getState().setCurrentTrack({ progress: 999999 });
    const state = usePlayerStore.getState();
    expect(state.currentTrack.progress).toBe(100000);
    expect(state.progress).toBe(100);
  });

  it('returns the same state when nothing changes', () => {
    usePlayerStore
      .getState()
      .setCurrentTrack({ id: 'track-1', duration: 100000, is_playing: true });
    const before = usePlayerStore.getState();
    usePlayerStore.getState().setCurrentTrack({ id: 'track-1' });
    expect(usePlayerStore.getState()).toBe(before);
  });

  it('tracks the progress clock when playback starts', () => {
    usePlayerStore
      .getState()
      .setCurrentTrack({ id: 'track-1', duration: 100000, is_playing: true });
    expect(getProgressState()).toEqual({
      progress: 0,
      startedAt: Date.now(),
    });
  });
});

describe('setDisplayedProgress', () => {
  it('clamps and recomputes the percentage', () => {
    usePlayerStore
      .getState()
      .setCurrentTrack({ id: 'track-1', duration: 100000, is_playing: true });
    usePlayerStore.getState().setDisplayedProgress(40000);
    let state = usePlayerStore.getState();
    expect(state.currentTrack.progress).toBe(40000);
    expect(state.progress).toBe(40);

    const before = state;
    usePlayerStore.getState().setDisplayedProgress(40000);
    state = usePlayerStore.getState();
    expect(state).toBe(before);
  });

  it('clamps values above the duration', () => {
    usePlayerStore
      .getState()
      .setCurrentTrack({ id: 'track-1', duration: 100000, is_playing: true });
    usePlayerStore.getState().setDisplayedProgress(999999);
    const state = usePlayerStore.getState();
    expect(state.currentTrack.progress).toBe(100000);
    expect(state.progress).toBe(100);
  });
});

describe('simple setters', () => {
  it('setPlaybackState updates and no-ops on the same value', () => {
    usePlayerStore.getState().setPlaybackState(PlaybackState.PLAYING);
    expect(usePlayerStore.getState().playbackState).toBe('playing');
    const before = usePlayerStore.getState();
    usePlayerStore.getState().setPlaybackState(PlaybackState.PLAYING);
    expect(usePlayerStore.getState()).toBe(before);
  });

  it('setWidgetState updates and no-ops on the same value', () => {
    usePlayerStore.getState().setWidgetState(WidgetStatus.SUCCESS);
    expect(usePlayerStore.getState().widgetState).toBe('SUCCESS');
    const before = usePlayerStore.getState();
    usePlayerStore.getState().setWidgetState(WidgetStatus.SUCCESS);
    expect(usePlayerStore.getState()).toBe(before);
  });

  it('setRawSpotifyItem stores and clears the raw item', () => {
    const item = { id: 'raw-1', name: 'Raw Track' };
    usePlayerStore.getState().setRawSpotifyItem(item);
    expect(usePlayerStore.getState().rawSpotifyItem).toBe(item);
    usePlayerStore.getState().setRawSpotifyItem(null);
    expect(usePlayerStore.getState().rawSpotifyItem).toBeNull();
  });

  it('setActiveMusicService stores and clears the service', () => {
    usePlayerStore.getState().setActiveMusicService(MusicSource.SPOTIFY);
    expect(usePlayerStore.getState().activeMusicService).toBe('spotify');
    usePlayerStore.getState().setActiveMusicService(null);
    expect(usePlayerStore.getState().activeMusicService).toBeNull();
  });
});

describe('resetCurrentTrack', () => {
  it('restores defaults but preserves activeMusicService', () => {
    const store = usePlayerStore.getState();
    store.setCurrentTrack({
      id: 'track-1',
      title: 'X',
      artist: 'Y',
      duration: 100000,
      is_playing: true,
      progress: 50000,
    });
    store.setPlaybackState(PlaybackState.PLAYING);
    store.setWidgetState(WidgetStatus.SUCCESS);
    store.setRawSpotifyItem({ id: 'raw-1' });
    store.setActiveMusicService(MusicSource.SPOTIFY);

    store.resetCurrentTrack();

    const state = usePlayerStore.getState();
    expect(state.currentTrack).toEqual(DEFAULT_PLAYER_TRACK);
    expect(state.progress).toBe(0);
    expect(state.progressUpdateVersion).toBe(0);
    expect(state.rawSpotifyItem).toBeNull();
    expect(state.activeMusicService).toBe(MusicSource.SPOTIFY);
    expect(state.playbackState).toBe(PlaybackState.NOTHING_PLAYING);
    expect(getProgressState()).toEqual({ progress: 0, startedAt: 0 });
  });
});
