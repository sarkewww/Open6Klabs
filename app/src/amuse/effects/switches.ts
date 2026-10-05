/**
 * Visual effect switch resolvers — the pure DOM-effect contract for the four
 * per-profile switches (`magic_colors`, `cover_glow`, `cover_blur`,
 * `hide_visualizer`).
 *
 * Every value below is copied verbatim from the original components in
 * `PlayerWindows98-ChpRHqWu.js`:
 *
 *   - `magic_colors` → `q` surface  (`:372-374`)
 *                   → `Z` playbar   (`:369-371`)
 *                   → `X` visualizer(`:287-296`)
 *   - `cover_glow`  → `Q` glow layer(`:186-209`, `i = !!(cover_glow && cover_url)`)
 *   - `cover_blur`  → `_e` blur layer(`:381-383`)
 *   - `hide_visualizer` → `X` (`:287-296`)
 *
 * The resolvers are side-effect free so the semantics can be locked with unit
 * assertions AND checked against the rendered `Player` DOM in the same test
 * suite. They do NOT replace the skins' inline wiring (owned by other tasks);
 * they are the canonical, testable description of it.
 */

import type { CoverPalette } from '../player/colors';
import { Theme } from '../types/user';

/** The `magic_colors` surface style (original `q`). `{}` when off. */
export interface MagicColorsSurfaceStyle {
  backgroundColor?: string;
  color?: string;
}

/**
 * Original `q`: `style = magic_colors ? { backgroundColor: colors.darkMuted,
 * color: colors.lightVibrant } : {}`.
 */
export function resolveMagicColorsSurfaceStyle(
  magicColors: boolean,
  colors: CoverPalette,
): MagicColorsSurfaceStyle {
  return magicColors
    ? { backgroundColor: colors.darkMuted, color: colors.lightVibrant }
    : {};
}

/**
 * Original `Z` playbar: `style = magic_colors ? { backgroundColor:
 * colors.darkVibrant } : void 0`.
 */
export function resolveMagicColorsPlaybarStyle(
  magicColors: boolean,
  colors: CoverPalette,
): { backgroundColor: string } | undefined {
  return magicColors ? { backgroundColor: colors.darkVibrant } : undefined;
}

/**
 * Original `#active` progress fill / `X` visualizer colour:
 * `magic_colors ? colors.vibrant : settings.tint_color`.
 */
export function resolveAccentColor(
  magicColors: boolean,
  colors: CoverPalette,
  tintColor: string,
): string {
  return magicColors ? colors.vibrant : tintColor;
}

/**
 * Original glow gate `i = !!(settings.cover_glow && cover_url)` (`Q:189`).
 * The glow layer is only visible when the switch is on AND a cover exists.
 */
export function resolveCoverGlowVisible(
  coverGlow: boolean,
  coverUrl: string,
): boolean {
  return Boolean(coverGlow && coverUrl);
}

/** Original glow layer `animate={{ opacity: i ? 1 : 0 }}` (`Q:209`). */
export function resolveCoverGlowOpacity(
  coverGlow: boolean,
  coverUrl: string,
): '1' | '0' {
  return resolveCoverGlowVisible(coverGlow, coverUrl) ? '1' : '0';
}

/**
 * Original `_e` blur filter (`:383`):
 * `magic_colors ? "blur(15px) brightness(80%) saturate(120%)"
 *              : theme == DARK ? "blur(15px) brightness(35%)"
 *              : "blur(15px) brightness(80%) saturate(120%)"`.
 */
export function resolveCoverBlurFilter(
  magicColors: boolean,
  theme: Theme,
): string {
  if (magicColors) {
    return 'blur(15px) brightness(80%) saturate(120%)';
  }
  return theme === Theme.DARK
    ? 'blur(15px) brightness(35%)'
    : 'blur(15px) brightness(80%) saturate(120%)';
}

/**
 * Original `_e` blur layer `opacity: settings.cover_blur ? "100%" : "0%"`.
 * When the switch is off the layer stays mounted but is fully transparent, so
 * it contributes no visible blur.
 */
export function resolveCoverBlurOpacity(coverBlur: boolean): '100%' | '0%' {
  return coverBlur ? '100%' : '0%';
}

/**
 * Original `X` visualizer `style={{ opacity: settings.hide_visualizer ? "0%"
 * : "100%" }}`.
 */
export function resolveVisualizerOpacity(
  hideVisualizer: boolean,
): '0%' | '100%' {
  return hideVisualizer ? '0%' : '100%';
}
