/**
 * Theme tokens — the two widget themes (`default_dark` / `default_light`).
 *
 * Original sources:
 *   - theme registry `E` (`useAmuseSettings.js:498-517` / minified
 *     `widget/assets/useAmuseSettings-CqN9zWcV.js`): 2 entries,
 *     `default_dark` ("Dark Mode") + `default_light` ("Light Mode"), both FREE.
 *   - token values: `widget/assets/index-CEICj85Z.css`
 *       · `:root { ... }`  -> the `default_light` token set
 *       · `.dark { ... }`  -> the `default_dark` token set
 *
 * The values below are copied VERBATIM (byte-for-byte) from that stylesheet.
 * `themes.test.tsx` re-parses `widget/assets/index-CEICj85Z.css` and asserts
 * every entry here is identical, so no colour value can drift. Do not edit by
 * hand — regenerate from the source if the original ever changes.
 *
 * The `@theme` colour tokens (`--color-spotify-black`, `--color-osx-*`,
 * `--color-shell-*`, `--color-discord-*`) are theme-independent and live in
 * `app/src/styles/tailwind.css` (Task 4); this module owns only the
 * light/dark switchable custom properties.
 */

import { Theme } from '../types/user';

/** A theme's custom-property set (`--name` -> raw value). */
export type ThemeTokenMap = Readonly<Record<string, string>>;

/**
 * `:root` from `widget/assets/index-CEICj85Z.css` — the `default_light` tokens
 * (33 declarations, source order preserved).
 */
export const LIGHT_THEME_TOKENS: ThemeTokenMap = {
  '--background': '0 0% 100%',
  '--foreground': '210 12% 16%',
  '--muted': '0 12% 90%',
  '--muted-foreground': '0 12% 30%',
  '--popover': '0 0% 97%',
  '--popover-foreground': '210 12% 6%',
  '--card': '0 0% 98%',
  '--card-foreground': '210 12% 11%',
  '--border': '0 0% 95%',
  '--input': '0 0% 92%',
  '--primary': '210 12% 16%',
  '--primary-foreground': '210 12% 76%',
  '--secondary': '210 2% 75%',
  '--secondary-foreground': '210 2% 15%',
  '--accent': '0 0% 85%',
  '--accent-foreground': '0 0% 25%',
  '--destructive': '6 95% 41%',
  '--destructive-foreground': '0 0% 100%',
  '--ring': '210 12% 16%',
  '--radius': '.5rem',
  '--sidebar-background': '0 0% 98%',
  '--sidebar-foreground': '240 5.3% 26.1%',
  '--sidebar-primary': '240 5.9% 10%',
  '--sidebar-primary-foreground': '0 0% 98%',
  '--sidebar-accent': '240 4.8% 95.9%',
  '--sidebar-accent-foreground': '240 5.9% 10%',
  '--sidebar-border': '220 13% 91%',
  '--sidebar-ring': '217.2 91.2% 59.8%',
  '--chart-1': '12 76% 61%',
  '--chart-2': '173 58% 39%',
  '--chart-3': '197 37% 24%',
  '--chart-4': '43 74% 66%',
  '--chart-5': '27 87% 67%',
};

/**
 * `.dark` from `widget/assets/index-CEICj85Z.css` — the `default_dark` tokens
 * (39 declarations, source order preserved).
 */
export const DARK_THEME_TOKENS: ThemeTokenMap = {
  '--rsbs-backdrop-bg': '#0009',
  '--rsbs-bg': '#0f1015',
  '--rsbs-handle-bg': '#ffffff24',
  '--rsbs-max-w': 'auto',
  '--rsbs-ml': 'env(safe-area-inset-left)',
  '--rsbs-mr': 'env(safe-area-inset-right)',
  '--rsbs-overlay-rounded': '16px',
  '--background': '225 18% 9%',
  '--foreground': '231 7% 81%',
  '--muted': '225 12% 15%',
  '--muted-foreground': '225 12% 65%',
  '--popover': '225 18% 6%',
  '--popover-foreground': '231 7% 91%',
  '--card': '225 18% 7%',
  '--card-foreground': '231 7% 86%',
  '--border': '225 8% 14%',
  '--input': '225 8% 17%',
  '--primary': '219 16% 65%',
  '--primary-foreground': '219 16% 5%',
  '--secondary': '219 6% 25%',
  '--secondary-foreground': '219 6% 85%',
  '--accent': '225 18% 24%',
  '--accent-foreground': '225 18% 84%',
  '--destructive': '8 90% 49%',
  '--destructive-foreground': '0 0% 100%',
  '--ring': '219 16% 65%',
  '--sidebar-background': '240 5.9% 10%',
  '--sidebar-foreground': '240 4.8% 95.9%',
  '--sidebar-primary': '224.3 76.3% 48%',
  '--sidebar-primary-foreground': '0 0% 100%',
  '--sidebar-accent': '240 3.7% 15.9%',
  '--sidebar-accent-foreground': '240 4.8% 95.9%',
  '--sidebar-border': '240 3.7% 15.9%',
  '--sidebar-ring': '217.2 91.2% 59.8%',
  '--chart-1': '220 70% 50%',
  '--chart-2': '160 60% 45%',
  '--chart-3': '30 80% 55%',
  '--chart-4': '280 65% 60%',
  '--chart-5': '340 75% 55%',
};

/** The token set selected by each theme id. */
export const THEME_TOKENS: Readonly<Record<Theme, ThemeTokenMap>> = {
  [Theme.DARK]: DARK_THEME_TOKENS,
  [Theme.LIGHT]: LIGHT_THEME_TOKENS,
};

/**
 * The container class each theme toggles.
 *
 * The site's `next-themes` provider (`main-Dx8nN5Es.js:35447`) uses
 * `attribute:"class"` with `themes:["light","dark"]`, i.e. the root carries
 * `class="dark"` or `class="light"`. The widget reuses the same convention:
 * `default_dark` -> `dark`, `default_light` -> `light`. The `dark` class is the
 * one the original stylesheet styles (`.dark { ... }`); `light` is the default
 * `:root` set.
 */
export const THEME_CONTAINER_CLASS: Readonly<Record<Theme, string>> = {
  [Theme.DARK]: 'dark',
  [Theme.LIGHT]: 'light',
};

/** The container class for a theme id (falls back to `light`). */
export function themeContainerClass(theme: Theme): string {
  return THEME_CONTAINER_CLASS[theme] ?? THEME_CONTAINER_CLASS[Theme.LIGHT];
}

/** The token map for a theme id (falls back to the light set). */
export function themeTokens(theme: Theme): ThemeTokenMap {
  return THEME_TOKENS[theme] ?? LIGHT_THEME_TOKENS;
}
