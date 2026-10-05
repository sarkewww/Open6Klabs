/**
 * Cover palette extraction — the `vibrant` half of the original colour context
 * `Er` (`PlayerWindows98-ChpRHqWu.js:168-175`) and `react-palette`'s
 * `usePalette` (`react-palette-CpYaOuWc.js:4157-4191`).
 *
 * `react-palette` 1.0.2 resolves the `node-vibrant` swatches to camelCased hex
 * strings (`getPalette.ts`): `Vibrant -> vibrant`, `DarkVibrant -> darkVibrant`,
 * … The original provider keeps a `bt` fallback palette and:
 *
 *   1. only merges a resolved palette when at least one swatch is usable
 *      (`Object.values(n).some(h => h && h !== "" && h !== "undefined")`);
 *   2. merges per key with `data[key] || previous[key]` (never overwriting a
 *      previous colour with an empty/undefined one).
 *
 * Both rules are preserved verbatim. The colour algorithm/thresholds live in
 * `node-vibrant` (react-palette's dependency) and are NOT re-implemented here —
 * only the merge contract the widget applies on top of it.
 */

import type { CoverPalette } from '../player/colors';

/** The six `node-vibrant` swatch names, camelCased by react-palette. */
export const COVER_PALETTE_KEYS = [
  'vibrant',
  'darkVibrant',
  'lightVibrant',
  'muted',
  'darkMuted',
  'lightMuted',
] as const;

export type CoverPaletteKey = (typeof COVER_PALETTE_KEYS)[number];

/** A (possibly partial) react-palette result. */
export type PaletteData = Partial<Record<CoverPaletteKey, string | undefined>>;

/**
 * Original guard `n && Object.values(n).some(h => h && h !== "" && h !== "undefined")`.
 * Returns true only when the palette carries at least one usable swatch.
 */
export function hasUsablePalette(
  data: PaletteData | null | undefined,
): boolean {
  if (!data) {
    return false;
  }
  return Object.values(data).some(
    (value) => Boolean(value) && value !== '' && value !== 'undefined',
  );
}

/**
 * Original per-key merge
 * `{ vibrant: n.vibrant || h.vibrant, darkVibrant: n.darkVibrant || h.darkVibrant, … }`.
 * `data` values win when truthy; otherwise the previous palette is kept.
 */
export function mergeCoverPalette(
  previous: CoverPalette,
  data: PaletteData,
): CoverPalette {
  return {
    vibrant: data.vibrant || previous.vibrant,
    darkVibrant: data.darkVibrant || previous.darkVibrant,
    lightVibrant: data.lightVibrant || previous.lightVibrant,
    muted: data.muted || previous.muted,
    darkMuted: data.darkMuted || previous.darkMuted,
    lightMuted: data.lightMuted || previous.lightMuted,
  };
}

/**
 * The `vibrant` swatch — the accent colour the visualizer bars and the active
 * progress fill use when `magic_colors` is on (original `X`/`Z` read
 * `P().data.vibrant`).
 */
export function pickVibrant(colors: CoverPalette): string {
  return colors.vibrant;
}
