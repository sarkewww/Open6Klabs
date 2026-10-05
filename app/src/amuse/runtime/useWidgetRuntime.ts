/**
 * React binding for the widget runtime bootstrap.
 *
 * `WidgetRoot` calls this hook with the route's `widget_token` / `profile_id`;
 * the hook owns the player store, drives {@link createWidgetBootstrap}, mirrors
 * the resolved runtime state into React state, and returns everything the
 * `Player` wrapper needs (the store + the resolved profile settings).
 *
 * The store is created once per hook instance (so multiple widget roots / tests
 * are isolated) and the bootstrap is torn down on unmount — adapters stop, the
 * pusher disconnects and the session client cleans its listeners up.
 */

import { useEffect, useMemo, useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { createPlayerStore, type PlayerStore } from '../player/store';
import { DEFAULT_PROFILE_SETTINGS } from '../profile/settings';
import {
  createWidgetBootstrap,
  type WidgetBootstrapOptions,
  type WidgetBootstrapState,
} from './bootstrap';

export interface UseWidgetRuntimeOptions extends Omit<
  WidgetBootstrapOptions,
  'store' | 'onStateChange'
> {
  /** Optional isolated store; defaults to a fresh per-hook store. */
  store?: StoreApi<PlayerStore>;
}

const INITIAL_STATE: WidgetBootstrapState = {
  general: null,
  subscription: null,
  profile: null,
  settings: DEFAULT_PROFILE_SETTINGS,
  musicService: null,
  sessionExpired: false,
  ready: false,
};

export interface UseWidgetRuntimeResult extends WidgetBootstrapState {
  store: StoreApi<PlayerStore>;
  widgetState: PlayerStore['widgetState'];
  playbackState: PlayerStore['playbackState'];
  currentTrack: PlayerStore['currentTrack'];
}

export function useWidgetRuntime(
  options: UseWidgetRuntimeOptions,
): UseWidgetRuntimeResult {
  const { widgetToken, profileId } = options;
  const store = useMemo(
    () => options.store ?? createPlayerStore(),
    [options.store],
  );
  const [runtime, setRuntime] = useState<WidgetBootstrapState>(INITIAL_STATE);

  useEffect(() => {
    const bootstrap = createWidgetBootstrap({
      ...options,
      store,
      onStateChange: setRuntime,
    });
    void bootstrap.start();
    return () => {
      bootstrap.stop();
    };
    // The runtime is re-created only when the route target or store changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetToken, profileId, store]);

  const widgetState = useStore(store, (state) => state.widgetState);
  const playbackState = useStore(store, (state) => state.playbackState);
  const currentTrack = useStore(store, (state) => state.currentTrack);

  return {
    store,
    widgetState,
    playbackState,
    currentTrack,
    ...runtime,
  };
}
