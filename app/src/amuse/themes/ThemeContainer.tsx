/**
 * `ThemeContainer` — applies a widget theme to a subtree.
 *
 * This is the "container class switching + token application" the original does
 * through the stylesheet: the site root carries `class="dark"` / `class="light"`
 * (`next-themes`, `main-Dx8nN5Es.js:35447`) and `widget/assets/index-CEICj85Z.css`
 * declares the `:root` (light) and `.dark` (dark) custom-property blocks. The
 * widget wraps its player tree in this container so:
 *
 *   1. the theme class (`dark` / `light`) is toggled on the container, and
 *   2. the theme's custom properties are applied so descendants that use
 *      shadcn utilities (`bg-card`, `text-foreground`, `text-muted-foreground`,
 *      `bg-muted`) resolve against the selected theme.
 *
 * The token values are byte-identical to the original stylesheet (see
 * `./tokens.ts`); they are applied inline so the theme is self-contained and
 * computable in jsdom, where an external sheet's `:root`/`.dark` cascade cannot
 * be resolved against a nested container.
 */

import { clsx } from 'clsx';
import type { CSSProperties, ReactNode } from 'react';
import type { Theme } from '../types/user';
import { themeContainerClass, themeTokens } from './tokens';

export interface ThemeContainerProps {
  /** The theme to apply (`default_dark` | `default_light`). */
  theme: Theme;
  children?: ReactNode;
  /** Extra classes merged onto the container (after the theme class). */
  className?: string;
  /** Extra inline styles merged over the theme tokens. */
  style?: CSSProperties;
  /** Set false to skip applying the token custom properties. Default true. */
  applyTokens?: boolean;
}

/** The theme's custom properties as an inline style object. */
export function themeTokenStyle(theme: Theme): CSSProperties {
  return { ...themeTokens(theme) } as CSSProperties;
}

export default function ThemeContainer({
  theme,
  children,
  className,
  style,
  applyTokens = true,
}: ThemeContainerProps) {
  const containerClass = themeContainerClass(theme);
  return (
    <div
      className={clsx(containerClass, className)}
      data-testid="amuse-theme"
      data-theme={theme}
      data-theme-class={containerClass}
      style={applyTokens ? { ...themeTokenStyle(theme), ...style } : style}
    >
      {children}
    </div>
  );
}
