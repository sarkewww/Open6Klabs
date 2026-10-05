/**
 * Task 26 — 14 font families wiring.
 *
 * Asserts, from the REAL assets on disk:
 *   1. the module reuses the 14 registry families verbatim (ids + fontClass),
 *   2. every `fontClass` maps to a real `--font-*` Tailwind token,
 *   3. the module's `font-family` stack equals the `tailwind.css` token value,
 *   4. jsdom computes that `font-family` for the class (class -> family cascade),
 *   5. every family's `@font-face` woff2 source resolves under `app/public/`
 *      (Poppins under `webfonts/poppins/**`, the other 13 under `assets/**`),
 *   6. the CJK / Korean families are present and the title/artist/songTime
 *      override classes match the registry.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FONTS } from '../settings/registry';
import {
  FONT_FAMILY_BY_ID,
  FONT_WIRING,
  fontTokenStem,
  getArtistClassName,
  getFontClass,
  getFontFamily,
  getSongTimeClassName,
  getTitleClassName,
} from './index';

const here = path.dirname(fileURLToPath(import.meta.url));
/** `app/` — up from `app/src/amuse/fonts`. */
const appRoot = path.resolve(here, '..', '..', '..');
const publicRoot = path.join(appRoot, 'public');
const fontsCss = fs.readFileSync(
  path.join(appRoot, 'src', 'styles', 'fonts.css'),
  'utf8',
);
const tailwindCss = fs.readFileSync(
  path.join(appRoot, 'src', 'styles', 'tailwind.css'),
  'utf8',
);

/** The 14 families in registry order. */
const EXPECTED_IDS = [
  'poppins',
  'fredoka',
  'spacemono',
  'silkscreen',
  'bagelFatOne',
  'gasoekOne',
  'zcoolKuaile',
  'zcoolQingkeHuangyou',
  'singleDay',
  'jua',
  'russoOne',
  'monomakh',
  'notoSerifDisplay',
  'openDyslexic',
] as const;

/** CJK / Korean families that must never be dropped. */
const CJK_IDS = [
  'zcoolKuaile',
  'zcoolQingkeHuangyou',
  'singleDay',
  'jua',
  'gasoekOne',
] as const;

/** `--font-<stem>` token values from the Tailwind source. */
function parseTailwindFontTokens(css: string): Map<string, string> {
  const tokens = new Map<string, string>();
  const re = /--font-([a-z0-9-]+):\s*([^;]+);/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(css))) {
    tokens.set(match[1], match[2].trim());
  }
  return tokens;
}

interface FontFace {
  family: string;
  woff2: readonly string[];
}

/** `@font-face` rules with their woff2 `src` urls (handles both quote styles). */
function parseFontFaces(css: string): FontFace[] {
  const faces: FontFace[] = [];
  const re = /@font-face\s*\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(css))) {
    const body = match[1];
    const family = body
      .match(/font-family:\s*([^;}]+)/)?.[1]
      ?.trim()
      .replace(/^["']|["']$/g, '');
    const src = body.match(/src:\s*([^;}]+)/)?.[1];
    if (!family || !src) continue;
    const woff2 = [...src.matchAll(/url\((?:"|')?([^"')]+)(?:"|')?\)/g)]
      .map((entry) => entry[1])
      .filter((url) => url.endsWith('.woff2'));
    faces.push({ family, woff2 });
  }
  return faces;
}

/** Lowercase, unquote and normalise a comma-separated family stack for compare. */
function normalizeFamily(value: string): string {
  return value
    .replace(/["']/g, '')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .join(',');
}

const TAILWIND_TOKENS = parseTailwindFontTokens(tailwindCss);
const FONT_FACES = parseFontFaces(fontsCss);

function woff2For(fontId: string): readonly string[] {
  const familyName = getFontFamily(fontId).split(',')[0];
  const wanted = normalizeFamily(familyName);
  return FONT_FACES.filter(
    (face) => normalizeFamily(face.family) === wanted,
  ).flatMap((face) => face.woff2);
}

describe('amuse fonts wiring (14 families)', () => {
  it('exposes exactly the 14 registry families in order', () => {
    expect(FONT_WIRING).toHaveLength(14);
    expect(FONT_WIRING.map((font) => font.id)).toEqual([...EXPECTED_IDS]);
    expect(FONT_WIRING.map((font) => font.fontClass)).toEqual(
      FONTS.map((font) => font.fontClass),
    );
  });

  it('maps every fontClass to a real --font-* Tailwind token', () => {
    expect(TAILWIND_TOKENS.size).toBe(14);
    for (const font of FONT_WIRING) {
      const stem = fontTokenStem(font.fontClass);
      expect(stem, `${font.id} fontClass`).toBeTruthy();
      expect(TAILWIND_TOKENS.has(stem as string), `${font.id} -> ${stem}`).toBe(
        true,
      );
      expect(font.fontToken).toBe(`--font-${stem}`);
    }
    // Every declared token is consumed by exactly one family.
    const consumed = new Set(
      FONT_WIRING.map((font) => font.fontToken.replace('--font-', '')),
    );
    for (const stem of TAILWIND_TOKENS.keys()) {
      expect(consumed.has(stem), `unused token --font-${stem}`).toBe(true);
    }
  });

  it('resolves each family to the tailwind.css font-family stack', () => {
    for (const font of FONT_WIRING) {
      const stem = fontTokenStem(font.fontClass) as string;
      const expected = TAILWIND_TOKENS.get(stem) as string;
      expect(normalizeFamily(getFontFamily(font.id)), font.id).toBe(
        normalizeFamily(expected),
      );
      expect(normalizeFamily(FONT_FAMILY_BY_ID[font.id]), font.id).toBe(
        normalizeFamily(expected),
      );
    }
  });

  it('lets jsdom compute the font-family for every class', () => {
    const style = document.createElement('style');
    style.textContent = FONT_WIRING.map((font) => {
      const stem = fontTokenStem(font.fontClass) as string;
      return `.font-${stem}{font-family:${TAILWIND_TOKENS.get(stem)}}`;
    }).join('\n');
    document.head.appendChild(style);

    try {
      for (const font of FONT_WIRING) {
        const stem = fontTokenStem(font.fontClass) as string;
        const el = document.createElement('div');
        el.className = font.fontClass;
        el.textContent = font.name;
        document.body.appendChild(el);
        expect(
          normalizeFamily(getComputedStyle(el).fontFamily),
          `${font.id} computed font-family`,
        ).toBe(normalizeFamily(TAILWIND_TOKENS.get(stem) as string));
        el.remove();
      }
    } finally {
      style.remove();
    }
  });

  it('resolves every family woff2 source under app/public/', () => {
    for (const font of FONT_WIRING) {
      const woff2 = woff2For(font.id);
      expect(woff2.length, `${font.id} woff2 sources`).toBeGreaterThan(0);
      for (const src of woff2) {
        const expectedPrefix =
          font.id === 'poppins' ? '/webfonts/poppins/' : '/assets/';
        expect(src.startsWith(expectedPrefix), `${font.id} ${src}`).toBe(true);
        const absolute = path.join(publicRoot, src.replace(/^\//, ''));
        expect(fs.existsSync(absolute), `missing ${absolute}`).toBe(true);
      }
    }
  });

  it('keeps the CJK / Korean families', () => {
    for (const id of CJK_IDS) {
      expect(
        FONT_WIRING.some((font) => font.id === id),
        id,
      ).toBe(true);
    }
    expect(
      FONT_WIRING.find((font) => font.id === 'zcoolKuaile')?.scripts,
    ).toContain('chinese');
    expect(
      FONT_WIRING.find((font) => font.id === 'zcoolQingkeHuangyou')?.scripts,
    ).toContain('chinese');
    expect(FONT_WIRING.find((font) => font.id === 'jua')?.scripts).toContain(
      'korean',
    );
    expect(
      FONT_WIRING.find((font) => font.id === 'singleDay')?.scripts,
    ).toContain('korean');
    expect(
      FONT_WIRING.find((font) => font.id === 'gasoekOne')?.scripts,
    ).toContain('korean');
  });

  it('applies the registry title/artist/songTime override classes', () => {
    FONTS.forEach((font) => {
      expect(getFontClass(font.id)).toBe(font.fontClass);
      expect(getTitleClassName(font.id)).toBe(font.titleClassName);
      expect(getArtistClassName(font.id)).toBe(font.artistClassName);
      expect(getSongTimeClassName(font.id)).toBe(font.songTimeClassName);
    });
  });

  it('falls back to the first family for unknown ids', () => {
    expect(getFontClass('does-not-exist')).toBe(FONTS[0].fontClass);
    expect(getFontFamily('does-not-exist')).toBe(
      FONT_FAMILY_BY_ID[FONTS[0].id],
    );
  });
});
