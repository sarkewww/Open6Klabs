/**
 * Cover colour context — the `Er` wrapper (exported as `C`) from the original
 * `PlayerWindows98-ChpRHqWu.js:168-175`.
 *
 * The original is a React context provider that extracts a colour palette from
 * the current cover image with `react-palette`'s `usePalette` (`Zt`):
 *
 *   bt = { vibrant:"#FFFFFF", darkVibrant:"#535353", lightVibrant:"#FFFFFF",
 *          muted:"#535353", darkMuted:"#535353", lightMuted:"#B3B3B3" }
 *   wt = createContext({ colors: bt, loading:false, error:null })
 *   Er = ({children}) => {
 *     const [colors, setColors] = useState(bt);
 *     const coverUrl = useStore(s => s.currentTrack?.cover_url || "");
 *     const { data, loading, error } = usePalette(coverUrl);
 *     useEffect(() => {
 *       data && Object.values(data).some(v => v && v!=="" && v!=="undefined")
 *         && setColors(prev => ({ vibrant:data.vibrant||prev.vibrant, ... }));
 *     }, [data]);
 *     return <wt.Provider value={useMemo(() => ({colors,loading,error}),[...])}>
 *       {children}
 *     </wt.Provider>;
 *   };
 *
 * `P()` (`useCoverColors` here) reads the context. The `magic_colors` switch
 * chooses these palette colours over `settings.tint_color`; the default palette
 * (`bt`) is used until an image palette resolves, which keeps the wiring
 * deterministic in jsdom where no image ever loads.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { usePalette } from 'react-palette';
import {
  hasUsablePalette,
  mergeCoverPalette,
  pickVibrant,
} from '../effects/palette';
import { usePlayerStoreSelector } from './context';

/** Original `bt` — the fallback cover palette. */
export interface CoverPalette {
  vibrant: string;
  darkVibrant: string;
  lightVibrant: string;
  muted: string;
  darkMuted: string;
  lightMuted: string;
}

export const DEFAULT_COVER_PALETTE: CoverPalette = {
  vibrant: '#FFFFFF',
  darkVibrant: '#535353',
  lightVibrant: '#FFFFFF',
  muted: '#535353',
  darkMuted: '#535353',
  lightMuted: '#B3B3B3',
};

export interface CoverColorsValue {
  colors: CoverPalette;
  loading: boolean;
  error: Error | null;
}

/** Original `wt` — the colour context. */
export const CoverColorsContext = createContext<CoverColorsValue>({
  colors: DEFAULT_COVER_PALETTE,
  loading: false,
  error: null,
});

export interface CoverColorsProviderProps {
  children: ReactNode;
  /** Optional palette override (tests / injected roots). */
  palette?: Partial<CoverPalette>;
}

/**
 * Original `Er` — extracts the palette from the current cover image and
 * provides it to the player tree.
 */
export function CoverColorsProvider({
  children,
  palette,
}: CoverColorsProviderProps) {
  const [colors, setColors] = useState<CoverPalette>(DEFAULT_COVER_PALETTE);
  const coverUrl = usePlayerStoreSelector(
    (state) => state.currentTrack?.cover_url || '',
  );
  const { data, loading, error } = usePalette(coverUrl);

  useEffect(() => {
    if (!hasUsablePalette(data)) {
      return;
    }
    setColors((previous) => mergeCoverPalette(previous, data));
  }, [data]);

  const value = useMemo<CoverColorsValue>(
    () => ({
      colors: palette ? { ...colors, ...palette } : colors,
      loading,
      error: error ?? null,
    }),
    [colors, palette, loading, error],
  );

  return (
    <CoverColorsContext.Provider value={value}>
      {children}
    </CoverColorsContext.Provider>
  );
}

/** Original `P()` — reads the cover palette. */
export function useCoverColors(): CoverColorsValue {
  return useContext(CoverColorsContext);
}

/**
 * The `vibrant` swatch as a standalone hook — the accent colour the visualizer
 * and active progress fill use under `magic_colors` (original `X`/`Z` read
 * `P().data.vibrant`). Defaults to `#FFFFFF` without a provider.
 */
export function useCoverVibrant(): string {
  return pickVibrant(useCoverColors().colors);
}
