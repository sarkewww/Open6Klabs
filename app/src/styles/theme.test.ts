import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { compile } from 'tailwindcss';

/**
 * Task 4 - Tailwind v4 theme token port.
 *
 * Asserts that `app/src/styles/tailwind.css` declares every token extracted by
 * `tools/extract-theme-tokens.mjs` (app/theme-tokens.json) VERBATIM from the
 * original `widget/assets/index-CEICj85Z.css`, and that Tailwind actually wires
 * the overlay utility classes (`bg-shell-bg`, `bg-discord-dark`,
 * `bg-spotify-black`, ...) to those tokens.
 *
 * jsdom cannot resolve `var()` inside `background-color` from a stylesheet, so
 * the rendered-element check resolves the custom-property chain Tailwind emits
 * (class -> var(--color-*) -> value) - a CSS-var assertion, as permitted by the
 * task when the DOM cannot compute the final colour.
 */

interface ThemeReport {
  declaredTokens: Record<string, string>;
  declaredDependencies: Record<string, Record<string, string>>;
  overlayChunkTokens: string[];
}

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..', '..');
const cssPath = path.join(appRoot, 'src', 'styles', 'tailwind.css');
const tokensPath = path.join(appRoot, 'theme-tokens.json');
const indexCssPath = path.resolve(
  appRoot,
  '..',
  'widget',
  'assets',
  'index-CEICj85Z.css',
);

const css = fs.readFileSync(cssPath, 'utf8');
const report = JSON.parse(fs.readFileSync(tokensPath, 'utf8')) as ThemeReport;
const indexCss = fs.readFileSync(indexCssPath, 'utf8');

/** Extract `--name: value;` declarations of a single rule/at-rule block. */
function extractDecls(
  source: string,
  selector: string,
): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = source.match(
    new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`),
  );
  if (!block) throw new Error(`block not found: ${selector}`);
  const out: Record<string, string> = {};
  for (const m of block[1].matchAll(/(--[a-zA-Z0-9_-]+)\s*:\s*([^;}]+)/g)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

/** Read the value of a token straight from the original production CSS. */
function originalValue(name: string): string {
  const m = indexCss.match(new RegExp(`${name}\\s*:\\s*([^;}]+)`));
  if (!m) throw new Error(`token not found in original css: ${name}`);
  return m[1].trim();
}

/** Remove `@layer` wrappers so jsdom's CSSOM can see the rules. */
function stripLayers(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    if (source.startsWith('@layer', i)) {
      let j = i + 6;
      while (j < source.length && source[j] !== ';' && source[j] !== '{') j++;
      if (source[j] === ';') {
        i = j + 1;
        continue;
      }
      let depth = 0;
      let k = j;
      for (; k < source.length; k++) {
        if (source[k] === '{') depth++;
        else if (source[k] === '}') {
          depth--;
          if (depth === 0) break;
        }
      }
      out += stripLayers(source.slice(j + 1, k));
      i = k + 1;
      continue;
    }
    out += source[i];
    i += 1;
  }
  return out;
}

/** Resolve a token value, following `var(--x)` chains using the dark layer. */
function resolveToken(name: string, values: Record<string, string>): string {
  let value = values[name];
  if (value === undefined) throw new Error(`unknown token: ${name}`);
  for (let guard = 0; guard < 10 && value.includes('var('); guard++) {
    value = value.replace(
      /var\(\s*(--[a-zA-Z0-9_-]+)\s*\)/g,
      (_, dep: string) => {
        const next = values[dep];
        if (next === undefined)
          throw new Error(`unresolved dependency: ${dep}`);
        return next;
      },
    );
  }
  return value;
}

const darkValues: Record<string, string> = { ...report.declaredTokens };
for (const [name, layers] of Object.entries(report.declaredDependencies)) {
  if (layers['.dark'] !== undefined) darkValues[name] = layers['.dark'];
}

describe('tailwind v4 theme tokens (task 4)', () => {
  it('declares every extracted token with the verbatim original value', () => {
    const theme = extractDecls(css, '@theme');
    const names = Object.keys(report.declaredTokens);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(theme[name], `@theme ${name}`).toBe(report.declaredTokens[name]);
    }
  });

  it('declares every token value identically to the original production css', () => {
    for (const [name, value] of Object.entries(report.declaredTokens)) {
      expect(
        value,
        `${name} differs from widget/assets/index-CEICj85Z.css`,
      ).toBe(originalValue(name));
    }
  });

  it('declares the light/dark dependency variables verbatim', () => {
    for (const layer of [':root', '.dark']) {
      const block = extractDecls(css, layer);
      for (const [name, layers] of Object.entries(
        report.declaredDependencies,
      )) {
        const expected = layers[layer];
        if (expected !== undefined)
          expect(block[name], `${layer} ${name}`).toBe(expected);
      }
    }
  });

  it('covers every custom token the overlay closure references', () => {
    const declared = new Set(Object.keys(report.declaredTokens));
    expect(report.overlayChunkTokens.length).toBeGreaterThan(0);
    for (const token of report.overlayChunkTokens) {
      expect(declared.has(token), `${token} missing from @theme`).toBe(true);
    }
  });

  it('lets Tailwind generate the overlay utility classes from the tokens', async () => {
    const require = createRequire(import.meta.url);
    const tailwindIndex = require.resolve('tailwindcss/index.css');
    const compiler = await compile(css, {
      base: appRoot,
      loadStylesheet: async (id: string, base: string) => {
        const resolved =
          id === 'tailwindcss'
            ? tailwindIndex
            : path.resolve(base ?? appRoot, id);
        return {
          path: resolved,
          base: path.dirname(resolved),
          content: fs.readFileSync(resolved, 'utf8'),
        };
      },
    });
    const candidates = [
      'bg-shell-bg',
      'bg-discord-dark',
      'bg-spotify-black',
      'font-poppins',
      'text-muted-foreground',
    ];
    const generated = compiler.build(candidates).replace(/\s+/g, '');
    expect(generated).toContain(
      '.bg-shell-bg{background-color:var(--color-shell-bg);}',
    );
    expect(generated).toContain(
      '.bg-discord-dark{background-color:var(--color-discord-dark);}',
    );
    expect(generated).toContain(
      '.bg-spotify-black{background-color:var(--color-spotify-black);}',
    );
    expect(generated).toContain(
      '.font-poppins{font-family:var(--font-poppins);}',
    );
    expect(generated).toContain(
      '.text-muted-foreground{color:var(--color-muted-foreground);}',
    );
  });

  it('resolves rendered elements to the expected background colour', () => {
    document.documentElement.className = 'dark';
    const themeDecls = Object.entries(report.declaredTokens)
      .map(([n, v]) => `${n}:${v}`)
      .join(';');
    const darkDecls = Object.entries(report.declaredDependencies)
      .filter(([, layers]) => layers['.dark'] !== undefined)
      .map(([n, layers]) => `${n}:${layers['.dark']}`)
      .join(';');
    const style = document.createElement('style');
    style.textContent = stripLayers(
      `@layer theme{:root,:host{${themeDecls}}}.dark{${darkDecls}}`,
    );
    document.head.appendChild(style);

    const el = document.createElement('div');
    el.className = 'bg-shell-bg bg-discord-dark bg-spotify-black';
    document.body.appendChild(el);

    // jsdom resolves custom properties from the cascade even though it does not
    // substitute var() inside background-color.
    const computed = getComputedStyle(el);
    expect(computed.getPropertyValue('--color-shell-bg').trim()).toBe(
      resolveToken('--color-shell-bg', darkValues),
    );
    expect(computed.getPropertyValue('--color-discord-dark').trim()).toBe(
      resolveToken('--color-discord-dark', darkValues),
    );
    expect(computed.getPropertyValue('--color-spotify-black').trim()).toBe(
      resolveToken('--color-spotify-black', darkValues),
    );

    // the resolved colours themselves match the original values
    expect(resolveToken('--color-shell-bg', darkValues)).toBe('#292c36');
    expect(resolveToken('--color-discord-dark', darkValues)).toBe('#1e1f22');
    expect(resolveToken('--color-spotify-black', darkValues)).toBe('#181818');
    el.remove();
  });
});
