/**
 * Profile settings schema — ported from the original Amuse widget bundle.
 *
 * Source of truth (beautified):
 *   - `app/_reference/PlayerWindows98-ChpRHqWu.js:102`
 *       · `ds` = the default profile settings literal (19 fields)
 *       · `hs` = the demo profile settings literal (`is_demo: true`)
 *   - minified cross-check: `widget/assets/PlayerWindows98-ChpRHqWu.js` @4866
 *   - field usage cross-check: `widget/assets/amuse-CVh_Dros.js` (the panel's
 *       profile editor — dynamic import from main, NOT one of the 19 preload
 *       chunks) confirms every field name and the boolean/nullish defaults.
 *
 * These are PROFILE settings (fetched per profile from
 * `/api/widgets/amuse/profiles/<id>`), NOT the `useAmuseSettings` app-level
 * registry. The original resolves them in `k()` (export `h`):
 *
 *   const l = a.data?.settings || ds;       // fetched settings, else default
 *   return { settings: r ? hs : l, ...a };  // demo atom -> demo settings
 *
 * Field names, order and default values are preserved verbatim. Do not rename
 * or re-case.
 */

import { Skin } from '../settings/registry';
import { Cover, Theme } from '../types/user';

/** Profile settings (`ds` / `hs` in the original). */
export interface AmuseProfileSettings {
  skin: string;
  theme: Theme;
  cover: Cover;
  hide_on_pause: boolean;
  song_change_only: boolean;
  visible_duration: number;
  hide_visualizer: boolean;
  magic_colors: boolean;
  tint_color: string;
  nothing_playing_cover: string;
  nothing_playing_title: string;
  nothing_playing_artist: string;
  cover_blur: boolean;
  cover_glow: boolean;
  hide_delay: number;
  is_demo: boolean;
  font: string;
  show_animation: string;
  hide_animation: string;
}

/**
 * Original `ds` — the profile default. `skin`/`cover`/`theme`/`font`/
 * `show_animation`/`hide_animation` are the raw runtime strings (the original
 * uses the `E.SQUARE` / `A.DARK` enum members which serialise to `"square"` /
 * `"default_dark"`).
 */
export const DEFAULT_PROFILE_SETTINGS: AmuseProfileSettings = {
  skin: Skin.COMPACT,
  theme: Theme.DARK,
  cover: Cover.SQUARE,
  hide_on_pause: false,
  song_change_only: false,
  visible_duration: 5,
  hide_visualizer: false,
  magic_colors: true,
  tint_color: '#ffffff',
  nothing_playing_cover: '',
  nothing_playing_title: 'Nothing Playing',
  nothing_playing_artist: 'Get the music started',
  cover_blur: false,
  cover_glow: false,
  hide_delay: 5,
  is_demo: false,
  font: 'default',
  show_animation: 'default_in',
  hide_animation: 'default_out',
};

/**
 * Original `hs` — the demo profile settings. Differs from `ds` in exactly four
 * fields: `cover: CANVAS`, `cover_glow: true`, `is_demo: true`, `font: "poppins"`.
 */
export const DEMO_PROFILE_SETTINGS: AmuseProfileSettings = {
  ...DEFAULT_PROFILE_SETTINGS,
  cover: Cover.CANVAS,
  cover_glow: true,
  is_demo: true,
  font: 'poppins',
};

/** The 19 profile setting keys, in the original literal order. */
export const PROFILE_SETTING_KEYS = [
  'skin',
  'theme',
  'cover',
  'hide_on_pause',
  'song_change_only',
  'visible_duration',
  'hide_visualizer',
  'magic_colors',
  'tint_color',
  'nothing_playing_cover',
  'nothing_playing_title',
  'nothing_playing_artist',
  'cover_blur',
  'cover_glow',
  'hide_delay',
  'is_demo',
  'font',
  'show_animation',
  'hide_animation',
] as const satisfies readonly (keyof AmuseProfileSettings)[];

/**
 * Resolve a profile settings object from a partial override. Mirrors the
 * original's `a.data?.settings || ds` fallback: any missing field falls back to
 * the built-in default, and a `is_demo` object resolves to the demo defaults
 * first (original `settings: r ? hs : l`).
 */
export function resolveProfileSettings(
  override?: Partial<AmuseProfileSettings> | null,
): AmuseProfileSettings {
  const base = override?.is_demo
    ? DEMO_PROFILE_SETTINGS
    : DEFAULT_PROFILE_SETTINGS;
  return override ? { ...base, ...override } : base;
}
