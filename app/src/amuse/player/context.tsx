/**
 * React context for the player store.
 *
 * The original widget shares the store as a module-level zustand singleton
 * (`import { u as J } from "./PlayerWindows98-*.js"` then `J(selector)`), so
 * there is no Provider in the original bundle. This module mirrors that
 * singleton sharing while adding the standard zustand React-context pattern so
 * the widget tree can inject an isolated store (tests / multiple roots) and
 * read it through hooks:
 *
 *   const track = usePlayerStoreSelector((s) => s.currentTrack);
 *
 * With no `store` prop / no ancestor Provider, the hooks fall back to the exact
 * module singleton from `store.ts` — preserving the original semantics.
 */

import { createContext, useContext, type ReactNode } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { usePlayerStore, type PlayerStore } from './store';

/** The context value is the zustand store API, or `null` for the singleton. */
export const PlayerStoreContext = createContext<StoreApi<PlayerStore> | null>(
  null,
);

export interface PlayerStoreProviderProps {
  children: ReactNode;
  /** Optional isolated store; defaults to the module singleton. */
  store?: StoreApi<PlayerStore>;
}

/** Provides a player store (defaults to the singleton) to the widget tree. */
export function PlayerStoreProvider({
  children,
  store,
}: PlayerStoreProviderProps) {
  return (
    <PlayerStoreContext.Provider
      value={store ?? (usePlayerStore as unknown as StoreApi<PlayerStore>)}
    >
      {children}
    </PlayerStoreContext.Provider>
  );
}

/** Returns the nearest player store API, falling back to the singleton. */
export function usePlayerStoreApi(): StoreApi<PlayerStore> {
  const store = useContext(PlayerStoreContext);
  return store ?? (usePlayerStore as unknown as StoreApi<PlayerStore>);
}

/** Subscribes to a slice of the nearest player store. */
export function usePlayerStoreSelector<T>(
  selector: (state: PlayerStore) => T,
): T {
  return useStore(usePlayerStoreApi(), selector);
}
