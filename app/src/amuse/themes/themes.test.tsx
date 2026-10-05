import { cleanup, render, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { THEMES } from '../settings/registry';
import { Theme } from '../types/user';
import ThemeContainer, { themeTokenStyle } from './ThemeContainer';
import {
  DARK_THEME_TOKENS,
  LIGHT_THEME_TOKENS,
  THEME_CONTAINER_CLASS,
  THEME_TOKENS,
  themeContainerClass,
  themeTokens,
} from './tokens';

/**
 * Task 25 - rebuild `default_dark` / `default_light`.
 *
 * The token maps are asserted VERBATIM against the original production CSS
 * (`widget/assets/index-CEICj85Z.css`): `:root` -> light, `.dark` -> dark. The
 * container component is then rendered and asserted through a snapshot plus
 * computed-style checks (theme class toggle + resolved custom properties), so
 * the light-theme background drifting from the original fails the suite.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..', '..', '..');
const indexCssPath = path.resolve(
  appRoot,
  '..',
  'widget',
  'assets',
  'index-CEICj85Z.css',
);

const indexCss = fs.readFileSync(indexCssPath, 'utf8');

/** Extract the `--name: value` declarations of one rule block. */
function extractDecls(
  source: string,
  selector: string,
): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!block) throw new Error(`block not found: ${selector}`);
  const out: Record<string, string> = {};
  for (const m of block[1].matchAll(/(--[a-zA-Z0-9_-]+)\s*:\s*([^;}]+)/g)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

const originalRoot = extractDecls(indexCss, ':root');
const originalDark = extractDecls(indexCss, '.dark');

afterEach(cleanup);

describe('themes / token maps', () => {
  it('reproduces the :root block as the default_light tokens, verbatim', () => {
    expect(LIGHT_THEME_TOKENS).toEqual(originalRoot);
    expect(Object.keys(LIGHT_THEME_TOKENS)).toHaveLength(33);
  });

  it('reproduces the .dark block as the default_dark tokens, verbatim', () => {
    expect(DARK_THEME_TOKENS).toEqual(originalDark);
    expect(Object.keys(DARK_THEME_TOKENS)).toHaveLength(39);
  });

  it('selects the right token set per theme id', () => {
    expect(THEME_TOKENS[Theme.LIGHT]).toBe(LIGHT_THEME_TOKENS);
    expect(THEME_TOKENS[Theme.DARK]).toBe(DARK_THEME_TOKENS);
    expect(themeTokens(Theme.LIGHT)).toBe(LIGHT_THEME_TOKENS);
    expect(themeTokens(Theme.DARK)).toBe(DARK_THEME_TOKENS);
  });

  it('keeps the exact light-theme colour values (no drift)', () => {
    expect(LIGHT_THEME_TOKENS['--background']).toBe('0 0% 100%');
    expect(LIGHT_THEME_TOKENS['--foreground']).toBe('210 12% 16%');
    expect(LIGHT_THEME_TOKENS['--card']).toBe('0 0% 98%');
    expect(LIGHT_THEME_TOKENS['--card-foreground']).toBe('210 12% 11%');
    expect(LIGHT_THEME_TOKENS['--border']).toBe('0 0% 95%');
    expect(LIGHT_THEME_TOKENS['--muted']).toBe('0 12% 90%');
    expect(LIGHT_THEME_TOKENS['--muted-foreground']).toBe('0 12% 30%');
    expect(LIGHT_THEME_TOKENS['--primary']).toBe('210 12% 16%');
    expect(LIGHT_THEME_TOKENS['--destructive']).toBe('6 95% 41%');
  });

  it('keeps the exact dark-theme colour values (no drift)', () => {
    expect(DARK_THEME_TOKENS['--background']).toBe('225 18% 9%');
    expect(DARK_THEME_TOKENS['--foreground']).toBe('231 7% 81%');
    expect(DARK_THEME_TOKENS['--card']).toBe('225 18% 7%');
    expect(DARK_THEME_TOKENS['--card-foreground']).toBe('231 7% 86%');
    expect(DARK_THEME_TOKENS['--border']).toBe('225 8% 14%');
    expect(DARK_THEME_TOKENS['--muted']).toBe('225 12% 15%');
    expect(DARK_THEME_TOKENS['--muted-foreground']).toBe('225 12% 65%');
    expect(DARK_THEME_TOKENS['--primary']).toBe('219 16% 65%');
    expect(DARK_THEME_TOKENS['--destructive']).toBe('8 90% 49%');
  });

  it('maps each theme id to its container class (dark / light)', () => {
    expect(THEME_CONTAINER_CLASS[Theme.DARK]).toBe('dark');
    expect(THEME_CONTAINER_CLASS[Theme.LIGHT]).toBe('light');
    expect(themeContainerClass(Theme.DARK)).toBe('dark');
    expect(themeContainerClass(Theme.LIGHT)).toBe('light');
  });

  it('keeps the original theme registry ids (2 themes)', () => {
    expect(THEMES.map((t) => t.id)).toEqual(['default_dark', 'default_light']);
  });
});

describe('themes / container class switching + computed style', () => {
  it('applies the dark class and dark tokens for default_dark', () => {
    const { container } = render(
      <ThemeContainer theme={Theme.DARK}>
        <span>dark</span>
      </ThemeContainer>,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.classList.contains('dark')).toBe(true);
    expect(el.classList.contains('light')).toBe(false);
    expect(el.getAttribute('data-theme')).toBe('default_dark');
    expect(el.getAttribute('data-theme-class')).toBe('dark');

    const computed = getComputedStyle(el);
    expect(computed.getPropertyValue('--background').trim()).toBe('225 18% 9%');
    expect(computed.getPropertyValue('--card').trim()).toBe('225 18% 7%');
    expect(computed.getPropertyValue('--border').trim()).toBe('225 8% 14%');
  });

  it('applies the light class and light tokens for default_light', () => {
    const { container } = render(
      <ThemeContainer theme={Theme.LIGHT}>
        <span>light</span>
      </ThemeContainer>,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.classList.contains('light')).toBe(true);
    expect(el.classList.contains('dark')).toBe(false);
    expect(el.getAttribute('data-theme')).toBe('default_light');
    expect(el.getAttribute('data-theme-class')).toBe('light');

    const computed = getComputedStyle(el);
    expect(computed.getPropertyValue('--background').trim()).toBe('0 0% 100%');
    expect(computed.getPropertyValue('--card').trim()).toBe('0 0% 98%');
    expect(computed.getPropertyValue('--border').trim()).toBe('0 0% 95%');
  });

  it('switches the resolved tokens when the theme changes', () => {
    render(
      <ThemeContainer theme={Theme.LIGHT}>
        <span>light</span>
      </ThemeContainer>,
    );
    const light = screen.getByTestId('amuse-theme');
    expect(
      getComputedStyle(light).getPropertyValue('--background').trim(),
    ).toBe('0 0% 100%');

    cleanup();

    render(
      <ThemeContainer theme={Theme.DARK}>
        <span>dark</span>
      </ThemeContainer>,
    );
    const dark = screen.getByTestId('amuse-theme');
    expect(getComputedStyle(dark).getPropertyValue('--background').trim()).toBe(
      '225 18% 9%',
    );
    expect(dark.classList.contains('dark')).toBe(true);
  });

  it('exposes the token map as an inline style object', () => {
    expect(themeTokenStyle(Theme.DARK)).toEqual({ ...DARK_THEME_TOKENS });
    expect(themeTokenStyle(Theme.LIGHT)).toEqual({ ...LIGHT_THEME_TOKENS });
  });

  it('merges extra classes after the theme class and can skip tokens', () => {
    const { container } = render(
      <ThemeContainer theme={Theme.DARK} className="h-full w-full">
        <span>dark</span>
      </ThemeContainer>,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toBe('dark h-full w-full');

    cleanup();

    const { container: plain } = render(
      <ThemeContainer theme={Theme.LIGHT} applyTokens={false}>
        <span>light</span>
      </ThemeContainer>,
    );
    const plainEl = plain.firstElementChild as HTMLElement;
    expect(plainEl.style.getPropertyValue('--background')).toBe('');
    expect(plainEl.classList.contains('light')).toBe(true);
  });

  it('matches the reference dark-theme container (snapshot)', () => {
    const { container } = render(
      <ThemeContainer theme={Theme.DARK} className="h-full w-full">
        <span>dark</span>
      </ThemeContainer>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the reference light-theme container (snapshot)', () => {
    const { container } = render(
      <ThemeContainer theme={Theme.LIGHT} className="h-full w-full">
        <span>light</span>
      </ThemeContainer>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
