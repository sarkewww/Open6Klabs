import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Task 5 guard: the app must reproduce the original widget overlay head
 * (widget/overlay.html) stylesheet chain exactly, plus the ported player/widget
 * CSS and the 14 selectable font faces.
 *
 * Original overlay head order:
 *   1 critical-fonts.css  2 fa6.css  3 index-CEICj85Z.css (Tailwind)
 *   4 main-Dj8S0xjW.css   5 AmuseWidget-D785d3vh.css  6 PlayerWindows98-Dx94IdDH.css
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '..', '..'); // app/
const STYLES = join(APP, 'src', 'styles');

const read = (p: string): string => readFileSync(p, 'utf8');

function stylesheetHrefs(html: string): string[] {
  return (html.match(/<link\b[^>]*>/g) ?? [])
    .filter((tag) => /rel="stylesheet"/.test(tag))
    .map((tag) => (tag.match(/href="([^"]+)"/) ?? [])[1]);
}

describe('index.html stylesheet cascade order (original overlay head)', () => {
  const html = read(join(APP, 'index.html'));
  const hrefs = stylesheetHrefs(html);

  it('has exactly the 6 original stylesheets, in order', () => {
    expect(hrefs).toHaveLength(6);
    expect(hrefs[0]).toBe('/css/critical-fonts.css');
    expect(hrefs[1]).toBe('/css/fa6.css');
    // slot 3 = the generated Tailwind v4 sheet (source: app/src/styles/tailwind.css)
    expect(hrefs[2]).toMatch(/^\/src\/styles\/tailwind\.css(\?direct)?$/);
    expect(hrefs[3]).toBe('/assets/main-Dj8S0xjW.css');
    expect(hrefs[4]).toBe('/css/widget.css');
    expect(hrefs[5]).toBe('/css/player.css');
  });

  it('resolves every stylesheet to a real, non-empty file (no 404)', () => {
    const publicDir = join(APP, 'public');
    const resolution: Record<string, string> = {
      '/css/critical-fonts.css': join(publicDir, 'css', 'critical-fonts.css'),
      '/css/fa6.css': join(publicDir, 'css', 'fa6.css'),
      '/assets/main-Dj8S0xjW.css': join(
        publicDir,
        'assets',
        'main-Dj8S0xjW.css',
      ),
      '/css/widget.css': join(publicDir, 'css', 'widget.css'),
      '/css/player.css': join(publicDir, 'css', 'player.css'),
    };
    for (const [href, file] of Object.entries(resolution)) {
      expect(
        existsSync(file),
        `${href} -> ${file} (run: node tools/sync-assets.mjs)`,
      ).toBe(true);
      expect(statSync(file).size, `${href} must be non-empty`).toBeGreaterThan(
        0,
      );
    }
    // slot 3 is processed by Vite/Tailwind at build time; assert the source exists.
    expect(existsSync(join(STYLES, 'tailwind.css'))).toBe(true);
  });

  it('the 4th link (main-Dj8S0xjW.css) contains real @font-face rules', () => {
    const main = read(join(APP, 'public', 'assets', 'main-Dj8S0xjW.css'));
    expect(main.length).toBeGreaterThan(1_000_000);
    expect(main).toContain('@font-face');
  });
});

describe('ported player.css / widget.css', () => {
  it('player.css is the verbatim PlayerWindows98 port (.video-container + Pixelated MS Sans)', () => {
    const css = read(join(STYLES, 'player.css'));
    const source = read(
      join(APP, '..', 'widget', 'assets', 'PlayerWindows98-Dx94IdDH.css'),
    );
    expect(css).toBe(source);
    expect(css).toContain('.video-container');
    expect(css).toContain('Pixelated MS Sans Serif');
    expect(css).toContain('height:calc(100% + 120px)');
  });

  it('widget.css is the verbatim AmuseWidget port (transparent html,body)', () => {
    const css = read(join(STYLES, 'widget.css'));
    const source = read(
      join(APP, '..', 'widget', 'assets', 'AmuseWidget-D785d3vh.css'),
    );
    expect(css).toBe(source);
    expect(css).toContain('background-color:transparent!important');
  });

  it('public /css copies match the canonical app/src/styles ports', () => {
    for (const name of ['widget.css', 'player.css']) {
      const canonical = read(join(STYLES, name));
      const published = read(join(APP, 'public', 'css', name));
      expect(published, `${name} public copy must match app/src/styles`).toBe(
        canonical,
      );
    }
  });
});

describe('fonts.css (14 selectable families)', () => {
  const css = read(join(STYLES, 'fonts.css'));
  const families = new Set(
    [...css.matchAll(/@font-face\s*\{[^}]*?font-family\s*:\s*([^;}]+)/g)].map(
      (m) => m[1].trim().replace(/^["']|["']$/g, ''),
    ),
  );

  it('declares exactly 14 distinct font families', () => {
    expect(families.size).toBe(14);
  });

  it('covers the settings font registry (ids -> CSS family names)', () => {
    const expected = [
      'Poppins',
      'Fredoka Variable',
      'Space Mono',
      'Silkscreen',
      'Bagel Fat One',
      'Gasoek One',
      'ZCOOL KuaiLe',
      'ZCOOL QingKe HuangYou',
      'Single Day',
      'Jua',
      'Russo One',
      'Monomakh',
      'Noto Serif Display Variable',
      'OpenDyslexic',
    ];
    for (const family of expected)
      expect(families.has(family), family).toBe(true);
  });

  it('points at the self-hosted files (/assets/<family>-*.woff2 and /webfonts/poppins/**)', () => {
    const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) =>
      m[1].trim().replace(/^["']|["']$/g, ''),
    );
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url, url).toMatch(
        /^\/(assets\/[^/]+\.(woff2|woff)|webfonts\/poppins\/[^/]+\.woff2)$/,
      );
    }
    // Poppins lives under /webfonts/poppins/**
    expect(urls.some((u) => u.startsWith('/webfonts/poppins/'))).toBe(true);
    // the other 13 families live under /assets/<family>-*
    expect(urls.some((u) => /^\/assets\/bagel-fat-one-/.test(u))).toBe(true);
  });
});
