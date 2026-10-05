/**
 * Themes module — the two widget themes (`default_dark` / `default_light`).
 *
 * Public surface:
 *   - `THEME_TOKENS` / `LIGHT_THEME_TOKENS` / `DARK_THEME_TOKENS` — verbatim
 *     `:root` / `.dark` custom properties from `widget/assets/index-CEICj85Z.css`.
 *   - `THEME_CONTAINER_CLASS` / `themeContainerClass` — the container class each
 *     theme toggles (`dark` / `light`).
 *   - `ThemeContainer` — applies a theme to a subtree (class + tokens).
 *   - `THEMES` — the original theme registry `E` (re-exported from the settings
 *     registry so theme consumers have a single import point).
 */

export {
  DARK_THEME_TOKENS,
  LIGHT_THEME_TOKENS,
  THEME_CONTAINER_CLASS,
  THEME_TOKENS,
  themeContainerClass,
  themeTokens,
} from './tokens';
export type { ThemeTokenMap } from './tokens';

export { default as ThemeContainer, themeTokenStyle } from './ThemeContainer';
export type { ThemeContainerProps } from './ThemeContainer';

export { THEMES } from '../settings/registry';
export type { ThemeEntry } from '../settings/registry';
