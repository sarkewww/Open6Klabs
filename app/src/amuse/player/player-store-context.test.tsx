import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MusicSource } from '../types/user';
import {
  PlayerStoreProvider,
  usePlayerStoreApi,
  usePlayerStoreSelector,
} from './context';
import {
  PlaybackState,
  WidgetStatus,
  createPlayerStore,
  usePlayerStore,
} from './store';

function TrackProbe() {
  const title = usePlayerStoreSelector((s) => s.currentTrack.title);
  const playbackState = usePlayerStoreSelector((s) => s.playbackState);
  const service = usePlayerStoreSelector((s) => s.activeMusicService);
  return (
    <div data-testid="probe">
      {title}|{playbackState}|{String(service)}
    </div>
  );
}

function ApiProbe() {
  const api = usePlayerStoreApi();
  return <div data-testid="api-probe">{api.getState().widgetState}</div>;
}

beforeEach(() => {
  const store = usePlayerStore.getState();
  store.resetCurrentTrack();
  store.setActiveMusicService(null);
  store.setPlaybackState(PlaybackState.NOTHING_PLAYING);
  store.setWidgetState(WidgetStatus.LOADING);
});

afterEach(() => {
  cleanup();
});

describe('PlayerStoreProvider', () => {
  it('exposes an injected store to selector hooks', () => {
    const store = createPlayerStore();
    store.getState().setCurrentTrack({ title: 'Injected', is_playing: true });
    store.getState().setActiveMusicService(MusicSource.SPOTIFY);

    render(
      <PlayerStoreProvider store={store}>
        <TrackProbe />
      </PlayerStoreProvider>,
    );

    expect(screen.getByTestId('probe').textContent).toBe(
      'Injected|nothing_playing|spotify',
    );
  });

  it('re-renders subscribers when the injected store changes', () => {
    const store = createPlayerStore();
    render(
      <PlayerStoreProvider store={store}>
        <TrackProbe />
      </PlayerStoreProvider>,
    );

    act(() => {
      store.getState().setCurrentTrack({ title: 'Updated', is_playing: true });
    });

    expect(screen.getByTestId('probe').textContent).toBe(
      'Updated|nothing_playing|null',
    );
  });

  it('falls back to the module singleton without a store prop', () => {
    usePlayerStore
      .getState()
      .setCurrentTrack({ title: 'Singleton', is_playing: true });

    render(
      <PlayerStoreProvider>
        <TrackProbe />
        <ApiProbe />
      </PlayerStoreProvider>,
    );

    expect(screen.getByTestId('probe').textContent).toBe(
      'Singleton|nothing_playing|null',
    );
    expect(screen.getByTestId('api-probe').textContent).toBe('LOADING');
  });

  it('falls back to the singleton with no Provider at all', () => {
    usePlayerStore.getState().setActiveMusicService(MusicSource.TIDAL);
    render(<TrackProbe />);
    expect(screen.getByTestId('probe').textContent).toBe(
      '-|nothing_playing|tidal',
    );
  });
});
