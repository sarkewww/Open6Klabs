/**
 * Visual effects module — cover palette extraction + the four effect switches.
 *
 * Barrel for the pure palette-merge helpers (`palette.ts`) and the DOM-effect
 * resolvers (`switches.ts`) rebuilt for plan Todo 28.
 */

export {
  COVER_PALETTE_KEYS,
  hasUsablePalette,
  mergeCoverPalette,
  pickVibrant,
  type CoverPaletteKey,
  type PaletteData,
} from './palette';

export {
  resolveAccentColor,
  resolveCoverBlurFilter,
  resolveCoverBlurOpacity,
  resolveCoverGlowOpacity,
  resolveCoverGlowVisible,
  resolveMagicColorsPlaybarStyle,
  resolveMagicColorsSurfaceStyle,
  resolveVisualizerOpacity,
  type MagicColorsSurfaceStyle,
} from './switches';
