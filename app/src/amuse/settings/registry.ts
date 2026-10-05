/**
 * Settings registry ported from the original Amuse widget.
 *
 * Source of truth: `.omo/_beautify/useAmuseSettings.js` (readable, 998 lines),
 * cross-checked byte-for-byte against the minified
 * `widget/assets/useAmuseSettings-CqN9zWcV.js`:
 *   - skin registry    -> `c`
 *   - cover registry   -> `I`
 *   - theme registry   -> `E`
 *   - font table       -> `y` / font groups -> `b`
 *   - hide delay       -> `s` / visible duration -> `_`
 *   - show animations  -> `R` / hide animations -> `D`
 *   - `isSkinLocked`   -> `K` (plus the DISCORD branch in
 *     `.omo/_beautify/amuse-dashboard.js:1713-1714`)
 *   - `WINDOWS_98_PLAYER` feature flag -> `j("WINDOWS_98_PLAYER")`
 *
 * This module is the pure DATA + GATING layer (no React, no zustand). All ids,
 * names, class strings, image paths, duration values, animation ids and
 * transition parameters are copied verbatim. Do not rename / re-case / reorder.
 */

import { Cover, Theme } from '../types/user';
import { SubscriptionStatus } from '../types/subscription';

/* -------------------------------------------------------------------------- */
/* Local enums (verbatim from useAmuseSettings)                               */
/* -------------------------------------------------------------------------- */

/**
 * Skin layout enum (`C` in the original). The original registry stores
 * `index: C.<MEMBER>`; the string values equal the skin ids.
 */
export const Skin = {
  COMPACT: 'compact',
  BOXY: 'boxy',
  GALLERY: 'gallery',
  MACOS: 'macos',
  SHELL: 'shell',
  DISCORD: 'discord',
  MINIMAL: 'minimal',
  WINDOWS98: 'windows98',
} as const;
export type SkinId = (typeof Skin)[keyof typeof Skin];

/**
 * Cover `index` enum (`x` in the original). NOTE: this is a DIFFERENT enum
 * from the shared `Cover` (user.interface): the source maps the canvas cover to
 * `x.VIDEO === "video"` here while the shared enum uses `"canvas"`. The field is
 * dead data (never read anywhere in the runtime), so it is preserved verbatim.
 */
export const CoverIndex = {
  SQUARE: 'square',
  VIDEO: 'video',
  VINYL: 'vinyl',
  NO_COVER: 'none',
} as const;
export type CoverIndex = (typeof CoverIndex)[keyof typeof CoverIndex];

/**
 * Skin access tier (`u` in the original). Numeric TS enum:
 * `FREE = 0`, `PRO = 1`, `DISCORD = 2`.
 */
export const SkinTier = {
  FREE: 0,
  PRO: 1,
  DISCORD: 2,
} as const;
export type SkinTier = (typeof SkinTier)[keyof typeof SkinTier];

/* -------------------------------------------------------------------------- */
/* Image paths (verbatim from the original module-level constants)            */
/* -------------------------------------------------------------------------- */

const IMG = {
  none: '/assets/none-CqgiAw71.svg',
  square: '/assets/square-CF5c1row.svg',
  canvas: '/assets/video-CkdXlV8z.svg',
  vinyl: '/assets/vinyl-L2aGaGzF.svg',
  gallery: '/assets/big-cover-DUHeEaO7.svg',
  boxy: '/assets/boxy-BucZ6z4D.svg',
  compact: '/assets/compact-CQiUdgmT.svg',
  discord: '/assets/discord-hPuUPOwv.svg',
  macos: '/assets/macOS-DHIESALH.svg',
  minimal: '/assets/minimal-lTckpbhQ.svg',
  shell: '/assets/shell-fSpeMdMs.svg',
  windows98: '/assets/windows98-DTy_973X.svg',
  dark: '/assets/dark-mode-DgyvnBHE.svg',
  light: '/assets/light-mode-yID_QyMB.svg',
} as const;

/** Fallback cover used when nothing is playing (`Tt` in the original, export `n`). */
export const SPOTIFY_NO_COVER_IMAGE = '/assets/spotify_no_cover-DlW0D82t.svg';

/* -------------------------------------------------------------------------- */
/* Skins (8)                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * One skin registry entry.
 *
 * `status` is the source's verbatim field (`status: u.FREE`); `tier` is the
 * alias requested by the rewrite plan (`amuse-widget-rewrite` todo 3). Both
 * always carry the same {@link SkinTier} value.
 */
export interface SkinEntry {
  id: SkinId;
  name: string;
  image: string;
  index: SkinId;
  status: SkinTier;
  tier: SkinTier;
  hasCover: boolean;
  isNew: boolean;
}

function skin(
  id: SkinId,
  name: string,
  image: string,
  status: SkinTier,
  hasCover: boolean,
  isNew: boolean,
): SkinEntry {
  return { id, name, image, index: id, status, tier: status, hasCover, isNew };
}

/** Raw skin registry — 8 entries in original order (before the flag filter). */
export const SKINS: readonly SkinEntry[] = [
  skin(Skin.COMPACT, 'Compact', IMG.compact, SkinTier.FREE, true, false),
  skin(Skin.BOXY, 'Boxy', IMG.boxy, SkinTier.FREE, true, false),
  skin(Skin.GALLERY, 'Gallery', IMG.gallery, SkinTier.FREE, true, false),
  skin(Skin.MINIMAL, 'Minimal', IMG.minimal, SkinTier.FREE, true, true),
  skin(Skin.MACOS, 'macOS', IMG.macos, SkinTier.FREE, true, false),
  skin(Skin.SHELL, 'Shell', IMG.shell, SkinTier.FREE, false, false),
  skin(Skin.WINDOWS98, 'Windows 98', IMG.windows98, SkinTier.PRO, true, true),
  skin(Skin.DISCORD, 'Discord', IMG.discord, SkinTier.DISCORD, true, false),
];

/* -------------------------------------------------------------------------- */
/* WINDOWS_98_PLAYER feature flag                                             */
/* -------------------------------------------------------------------------- */

/**
 * Feature-flag key gating the Windows 98 skin (`j("WINDOWS_98_PLAYER")` in the
 * original). When off, `windows98` is filtered out of the visible skins.
 */
export const WINDOWS_98_PLAYER = 'WINDOWS_98_PLAYER' as const;

/** `!(skin.id === "windows98" && !enabled)` from the original `.filter(...)`. */
export function isSkinAvailable(
  entry: SkinEntry,
  isWindows98PlayerEnabled: boolean,
): boolean {
  return !(entry.id === Skin.WINDOWS98 && !isWindows98PlayerEnabled);
}

/** Applies the `WINDOWS_98_PLAYER` filter (7 skins when off, 8 when on). */
export function getVisibleSkins(
  isWindows98PlayerEnabled: boolean,
): SkinEntry[] {
  return SKINS.filter((entry) =>
    isSkinAvailable(entry, isWindows98PlayerEnabled),
  );
}

/* -------------------------------------------------------------------------- */
/* Covers (4)                                                                 */
/* -------------------------------------------------------------------------- */

export interface CoverEntry {
  id: Cover;
  name: string;
  image: string;
  index: CoverIndex;
  status: SkinTier;
  hasCover: boolean;
  isNew: boolean;
}

/** Cover registry (`I` in the original) — 4 entries. */
export const COVERS: readonly CoverEntry[] = [
  {
    id: Cover.SQUARE,
    name: 'Square',
    image: IMG.square,
    index: CoverIndex.SQUARE,
    status: SkinTier.FREE,
    hasCover: true,
    isNew: false,
  },
  {
    id: Cover.CANVAS,
    name: 'Canvas',
    image: IMG.canvas,
    index: CoverIndex.VIDEO,
    status: SkinTier.FREE,
    hasCover: true,
    isNew: false,
  },
  {
    id: Cover.VINYL,
    name: 'Vinyl',
    image: IMG.vinyl,
    index: CoverIndex.VINYL,
    status: SkinTier.FREE,
    hasCover: true,
    isNew: false,
  },
  {
    id: Cover.NONE,
    name: 'None',
    image: IMG.none,
    index: CoverIndex.NO_COVER,
    status: SkinTier.FREE,
    hasCover: false,
    isNew: false,
  },
];

/* -------------------------------------------------------------------------- */
/* Themes (2)                                                                 */
/* -------------------------------------------------------------------------- */

export interface ThemeEntry {
  id: Theme;
  name: string;
  image: string;
  index: Theme;
  status: SkinTier;
  hasCover: boolean;
  isNew: boolean;
}

/** Theme registry (`E` in the original) — 2 entries. */
export const THEMES: readonly ThemeEntry[] = [
  {
    id: Theme.DARK,
    name: 'Dark Mode',
    image: IMG.dark,
    index: Theme.DARK,
    status: SkinTier.FREE,
    hasCover: true,
    isNew: false,
  },
  {
    id: Theme.LIGHT,
    name: 'Light Mode',
    image: IMG.light,
    index: Theme.LIGHT,
    status: SkinTier.FREE,
    hasCover: true,
    isNew: false,
  },
];

/* -------------------------------------------------------------------------- */
/* Fonts (14) + groups                                                        */
/* -------------------------------------------------------------------------- */

/** Font script tags used by the `scripts` arrays and font groups. */
export type FontScript =
  'latin' | 'korean' | 'chinese' | 'cyrillic' | 'accessibility';

export interface FontEntry {
  id: string;
  name: string;
  fontClass: string;
  titleClassName: string;
  artistClassName: string;
  songTimeClassName: string;
  scripts: readonly FontScript[];
}

/** Selectable font registry (`y` in the original) — 14 families, verbatim. */
export const FONTS: readonly FontEntry[] = [
  {
    id: 'poppins',
    name: 'Poppins',
    fontClass: 'font-poppins',
    titleClassName: 'text-lg font-bold',
    artistClassName: 'text-sm',
    songTimeClassName: 'text-sm font-bold',
    scripts: ['latin'],
  },
  {
    id: 'fredoka',
    name: 'Fredoka',
    fontClass: 'font-fredoka',
    titleClassName: 'text-lg tracking-wide font-bold',
    artistClassName: 'text-sm',
    songTimeClassName: 'text-sm font-semibold',
    scripts: ['latin'],
  },
  {
    id: 'spacemono',
    name: 'Space Mono',
    fontClass: 'font-spacemono',
    titleClassName: 'text-lg font-bold',
    artistClassName: 'text-sm',
    songTimeClassName: 'text-xs font-bold',
    scripts: ['latin'],
  },
  {
    id: 'silkscreen',
    name: 'Silkscreen',
    fontClass: 'font-silkscreen',
    titleClassName: 'text-lg font-bold',
    artistClassName: 'text-sm',
    songTimeClassName: 'text-xs font-bold',
    scripts: ['latin'],
  },
  {
    id: 'bagelFatOne',
    name: 'Bagel Fat One',
    fontClass: 'font-bagel-fat-one tracking-wider',
    titleClassName: 'text-lg !mt-0',
    artistClassName: 'text-xs',
    songTimeClassName: 'text-sm leading-snug',
    scripts: ['latin', 'korean'],
  },
  {
    id: 'gasoekOne',
    name: 'Gasoek One',
    fontClass: 'font-gasoek-one',
    titleClassName: 'text-lg tracking-wide',
    artistClassName: 'text-xs tracking-wide',
    songTimeClassName: 'text-xs tracking-wide',
    scripts: ['latin', 'korean'],
  },
  {
    id: 'zcoolKuaile',
    name: 'ZCOOL KuaiLe',
    fontClass: 'font-zcool-kuaile',
    titleClassName: 'text-lg font-bold',
    artistClassName: 'text-sm',
    songTimeClassName: 'text-sm font-bold',
    scripts: ['latin', 'chinese'],
  },
  {
    id: 'zcoolQingkeHuangyou',
    name: 'ZCOOL QingKe HuangYou',
    fontClass: 'font-zcool-qingke-huangyou',
    titleClassName: 'text-lg font-bold',
    artistClassName: 'text-sm',
    songTimeClassName: 'text-sm font-bold',
    scripts: ['chinese'],
  },
  {
    id: 'singleDay',
    name: 'Single Day',
    fontClass: 'font-single-day',
    titleClassName: 'text-xl',
    artistClassName: 'text-sm',
    songTimeClassName: 'text-md font-bold',
    scripts: ['korean'],
  },
  {
    id: 'jua',
    name: 'Jua',
    fontClass: 'font-jua',
    titleClassName: 'text-lg',
    artistClassName: 'text-sm',
    songTimeClassName: 'text-xs leading-[22px]',
    scripts: ['korean'],
  },
  {
    id: 'russoOne',
    name: 'Russo One',
    fontClass: 'font-russo-one',
    titleClassName: 'text-lg',
    artistClassName: 'text-sm',
    songTimeClassName: 'text-xs',
    scripts: ['latin', 'cyrillic'],
  },
  {
    id: 'monomakh',
    name: 'Monomakh',
    fontClass: 'font-monomakh',
    titleClassName: 'text-lg font-bold',
    artistClassName: 'text-xs',
    songTimeClassName: 'text-xs font-bold',
    scripts: ['cyrillic'],
  },
  {
    id: 'notoSerifDisplay',
    name: 'Noto Serif Display',
    fontClass: 'font-noto-serif-display',
    titleClassName: 'text-lg font-bold',
    artistClassName: 'text-xs',
    songTimeClassName: 'text-xs font-bold',
    scripts: ['latin', 'cyrillic'],
  },
  {
    id: 'openDyslexic',
    name: 'Open Dyslexic',
    fontClass: 'font-open-dyslexic',
    titleClassName: 'text-lg font-bold',
    artistClassName: 'text-xs',
    songTimeClassName: 'text-xs font-bold',
    scripts: ['accessibility'],
  },
];

export interface FontGroup {
  id: string;
  name: string;
  script: FontScript;
  fonts: readonly FontEntry[];
}

/** Font groups (`b` in the original) — 5 groups in original order. */
export const FONT_GROUPS: readonly FontGroup[] = (
  [
    { id: 'general', name: 'General', script: 'latin' },
    { id: 'accessibility', name: 'Accessibility', script: 'accessibility' },
    { id: 'korean', name: 'Korean', script: 'korean' },
    { id: 'chinese', name: 'Chinese', script: 'chinese' },
    { id: 'cyrillic', name: 'Cyrillic', script: 'cyrillic' },
  ] as const
).map((group) => ({
  id: group.id,
  name: group.name,
  script: group.script,
  fonts: FONTS.filter((font) => font.scripts.includes(group.script)),
}));

/** Script labels (`ft` in the original); `latin` has no badge (`null`). */
export const SCRIPT_LABELS = {
  latin: null,
  korean: 'KR',
  chinese: 'CN',
  cyrillic: 'CYR',
  accessibility: 'A11Y',
} as const;

/** `getCurrentFont` (`d` in the original): unknown id falls back to `FONTS[0]`. */
export function getCurrentFont(id: string): FontEntry {
  return FONTS.find((font) => font.id === id) ?? FONTS[0];
}

/* -------------------------------------------------------------------------- */
/* Duration options                                                           */
/* -------------------------------------------------------------------------- */

export interface DurationOption {
  label: string;
  value: string;
}

/** `hideDelay` (`s` in the original) — 8 options, string values. */
export const HIDE_DELAY_OPTIONS: readonly DurationOption[] = [
  { label: 'No delay', value: '0' },
  { label: '5 seconds', value: '5' },
  { label: '10 seconds', value: '10' },
  { label: '20 seconds', value: '20' },
  { label: '30 seconds', value: '30' },
  { label: '40 seconds', value: '40' },
  { label: '50 seconds', value: '50' },
  { label: '60 seconds', value: '60' },
];

/** `visibleDuration` (`_` in the original) — 6 options, string values. */
export const VISIBLE_DURATION_OPTIONS: readonly DurationOption[] = [
  { label: '5 seconds', value: '5' },
  { label: '10 seconds', value: '10' },
  { label: '15 seconds', value: '15' },
  { label: '20 seconds', value: '20' },
  { label: '25 seconds', value: '25' },
  { label: '30 seconds', value: '30' },
];

/** Numeric view of {@link HIDE_DELAY_OPTIONS} values: `0,5,10,20,30,40,50,60`. */
export const HIDE_DELAY_VALUES = [0, 5, 10, 20, 30, 40, 50, 60] as const;

/** Numeric view of {@link VISIBLE_DURATION_OPTIONS} values: `5,10,15,20,25,30`. */
export const VISIBLE_DURATION_VALUES = [5, 10, 15, 20, 25, 30] as const;

/* -------------------------------------------------------------------------- */
/* Animations (12 show + 12 hide)                                             */
/* -------------------------------------------------------------------------- */

export type AnimationDirection = 'left' | 'right' | 'top' | 'bottom';

/** Resolves a size-relative offset; mirrors the original `r(scale)` helper. */
export type OffsetResolver = (scale?: number) => { x: number; y: number };

export type AnimationValues = Record<string, number | string>;

export interface TransitionStep {
  type?: 'spring' | 'tween';
  duration?: number;
  bounce?: number;
  ease?: string;
}

/** Flat (`{duration,type,ease}`) or nested (`{y:{...},scale:{...}}`) transition. */
export type TransitionSpec = Record<string, number | string | TransitionStep>;

export interface AnimationDef {
  id: string;
  name: string;
  direction?: AnimationDirection;
  initial: AnimationValues;
  animate: AnimationValues;
  exit: AnimationValues;
  transition: TransitionSpec;
}

/**
 * Builds the 12 show animations (`R` in the original). The original computes
 * `r(scale)` from the live container size; pass the equivalent resolver here.
 */
export function createShowAnimations(r: OffsetResolver): AnimationDef[] {
  return [
    {
      id: 'default_in',
      name: 'Original',
      initial: {
        opacity: -0.1,
        y: -r(0.2).y,
        scale: 0.5,
        filter: 'blur(0.5rem)',
      },
      animate: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' },
      exit: { opacity: -0.1 },
      transition: {
        y: { type: 'spring', duration: 1.3, bounce: 0.5, ease: 'easeInOut' },
        scale: { type: 'tween', duration: 1, ease: 'easeInOut' },
      },
    },
    {
      id: 'fade_in',
      name: 'Fade',
      initial: { opacity: -0.1 },
      animate: { opacity: 1.1 },
      exit: { opacity: -0.1 },
      transition: { duration: 0.5, type: 'tween', ease: 'easeInOut' },
    },
    {
      id: 'slide_in_left',
      name: 'Slide',
      direction: 'left',
      initial: { x: -r(0.4).x, opacity: -0.1 },
      animate: { x: 0, opacity: 1.1 },
      exit: { opacity: -0.1 },
      transition: { duration: 1.25, bounce: 0.5, type: 'spring' },
    },
    {
      id: 'slide_in_right',
      name: 'Slide',
      direction: 'right',
      initial: { x: r(0.4).x, opacity: -0.1 },
      animate: { x: 0, opacity: 1.1 },
      exit: { opacity: -0.1 },
      transition: { duration: 1.25, bounce: 0.5, type: 'spring' },
    },
    {
      id: 'slide_in_top',
      name: 'Slide',
      direction: 'top',
      initial: { y: -r(0.4).y, opacity: -0.1 },
      animate: { y: 0, opacity: 1.1 },
      exit: { opacity: -0.1 },
      transition: { duration: 1.25, bounce: 0.5, type: 'spring' },
    },
    {
      id: 'slide_in_bottom',
      name: 'Slide',
      direction: 'bottom',
      initial: { y: r(0.4).y, opacity: -0.1 },
      animate: { y: 0, opacity: 1.1 },
      exit: { opacity: -0.1 },
      transition: { duration: 1.25, bounce: 0.5, type: 'spring' },
    },
    {
      id: 'grow_in',
      name: 'Grow',
      initial: { scale: 0.5, opacity: -0.1 },
      animate: { scale: 1, opacity: 1.1 },
      exit: { opacity: -0.1 },
      transition: { duration: 1.5, type: 'spring', bounce: 0.4 },
    },
    {
      id: 'shrink_in',
      name: 'Shrink',
      initial: { scale: 1.5, opacity: -0.1 },
      animate: { scale: 1, opacity: 1.1 },
      exit: { opacity: -0.1 },
      transition: { duration: 1.5, type: 'spring', bounce: 0.5 },
    },
    {
      id: 'swing_rotate_in_left',
      name: 'Swing',
      direction: 'left',
      initial: { rotateZ: 10, y: r(0.4).y, opacity: -0.1 },
      animate: { rotateZ: 0, y: 0, opacity: 1.1 },
      exit: { opacity: -0.1 },
      transition: { duration: 1.5, type: 'spring', bounce: 0.5 },
    },
    {
      id: 'swing_rotate_in_right',
      name: 'Swing',
      direction: 'right',
      initial: { rotateZ: -10, y: r(0.4).y, opacity: -0.1 },
      animate: { rotateZ: 0, y: 0, opacity: 1.1 },
      exit: { opacity: -0.1 },
      transition: { duration: 1.5, type: 'spring', bounce: 0.5 },
    },
    {
      id: 'tilt_in_right',
      name: 'Tilt',
      direction: 'right',
      initial: { x: r(0.4).x, rotateZ: 10, opacity: -0.1 },
      animate: { x: 0, rotateZ: 0, opacity: 1.1 },
      exit: { opacity: -0.1 },
      transition: { duration: 1, type: 'spring', bounce: 0.5 },
    },
    {
      id: 'tilt_in_left',
      name: 'Tilt',
      direction: 'left',
      initial: { x: -r(0.4).x, rotateZ: -10, opacity: -0.1 },
      animate: { x: 0, rotateZ: 0, opacity: 1.1 },
      exit: { opacity: -0.1 },
      transition: { duration: 1, type: 'spring', bounce: 0.5 },
    },
  ];
}

/**
 * Builds the 12 hide animations (`D` in the original). Same size-relative
 * offsets as {@link createShowAnimations}.
 */
export function createHideAnimations(r: OffsetResolver): AnimationDef[] {
  return [
    {
      id: 'default_out',
      name: 'Original',
      initial: { opacity: 1 },
      animate: {
        opacity: -0.1,
        y: r(0.3).y,
        scale: 0.8,
        filter: 'blur(0.5rem)',
      },
      exit: { opacity: -0.1 },
      transition: {
        y: { type: 'spring', duration: 1.5, bounce: 0.5, ease: 'easeInOut' },
        scale: { type: 'tween', duration: 1, ease: 'easeInOut' },
      },
    },
    {
      id: 'fade_out',
      name: 'Fade',
      initial: { opacity: 1.1 },
      animate: { opacity: -0.1 },
      exit: { opacity: -0.1 },
      transition: { duration: 0.5, type: 'tween', ease: 'easeInOut' },
    },
    {
      id: 'slide_out_left',
      name: 'Slide',
      direction: 'left',
      initial: { opacity: 1, x: 0 },
      animate: { x: -r(0.4).x, opacity: -0.1 },
      exit: { opacity: -0.1 },
      transition: { duration: 1.25, bounce: 0.5, type: 'spring' },
    },
    {
      id: 'slide_out_right',
      name: 'Slide',
      direction: 'right',
      initial: { opacity: 1, x: 0 },
      animate: { x: r(0.4).x, opacity: -0.1 },
      exit: { opacity: -0.1 },
      transition: { duration: 1.25, bounce: 0.5, type: 'spring' },
    },
    {
      id: 'slide_out_top',
      name: 'Slide',
      direction: 'top',
      initial: { opacity: 1, y: 0 },
      animate: { y: -r(0.4).y, opacity: -0.1 },
      exit: { opacity: -0.1 },
      transition: { duration: 1.25, bounce: 0.5, type: 'spring' },
    },
    {
      id: 'slide_out_bottom',
      name: 'Slide',
      direction: 'bottom',
      initial: { opacity: 1, y: 0 },
      animate: { y: r(0.4).y, opacity: -0.1 },
      exit: { opacity: -0.1 },
      transition: { duration: 1.25, bounce: 0.5, type: 'spring' },
    },
    {
      id: 'grow_out',
      name: 'Grow',
      initial: { opacity: 1, scale: 1 },
      animate: { scale: 1.5, opacity: -0.1 },
      exit: { opacity: -0.1 },
      transition: { duration: 1.5, type: 'spring', bounce: 0.5 },
    },
    {
      id: 'shrink_out',
      name: 'Shrink',
      initial: { opacity: 1, scale: 1 },
      animate: { scale: 0.5, opacity: -0.1 },
      exit: { opacity: -0.1 },
      transition: { duration: 1.5, type: 'spring', bounce: 0.4 },
    },
    {
      id: 'swing_rotate_out_left',
      name: 'Swing',
      direction: 'left',
      initial: { opacity: 1, rotateZ: 0, y: 0 },
      animate: { rotateZ: -10, y: r(0.4).y, opacity: -0.1 },
      exit: { opacity: -0.1 },
      transition: { duration: 1.5, type: 'spring', bounce: 0.5 },
    },
    {
      id: 'swing_rotate_out_right',
      name: 'Swing',
      direction: 'right',
      initial: { opacity: 1, rotateZ: 0, y: 0 },
      animate: { rotateZ: 10, y: r(0.4).y, opacity: -0.1 },
      exit: { opacity: -0.1 },
      transition: { duration: 1.5, type: 'spring', bounce: 0.5 },
    },
    {
      id: 'tilt_out_right',
      name: 'Tilt',
      direction: 'right',
      initial: { opacity: 1, x: 0, rotateZ: 0 },
      animate: { x: r(0.4).x, rotateZ: 10, opacity: -0.1 },
      exit: { opacity: -0.1 },
      transition: { duration: 1, type: 'spring', bounce: 0.5 },
    },
    {
      id: 'tilt_out_left',
      name: 'Tilt',
      direction: 'left',
      initial: { opacity: 1, x: 0, rotateZ: 0 },
      animate: { x: -r(0.4).x, rotateZ: -10, opacity: -0.1 },
      exit: { opacity: -0.1 },
      transition: { duration: 1, type: 'spring', bounce: 0.5 },
    },
  ];
}

/** Zero-size resolver matching the original `useState({width:0,height:0})`. */
const ZERO_OFFSETS: OffsetResolver = () => ({ x: 0, y: 0 });

/** Show animations pre-built at the initial zero container size (`R`). */
export const SHOW_ANIMATIONS: readonly AnimationDef[] =
  createShowAnimations(ZERO_OFFSETS);

/** Hide animations pre-built at the initial zero container size (`D`). */
export const HIDE_ANIMATIONS: readonly AnimationDef[] =
  createHideAnimations(ZERO_OFFSETS);

/** 12 show-animation ids in original order. */
export const SHOW_ANIMATION_IDS: readonly string[] = SHOW_ANIMATIONS.map(
  (animation) => animation.id,
);

/** 12 hide-animation ids in original order. */
export const HIDE_ANIMATION_IDS: readonly string[] = HIDE_ANIMATIONS.map(
  (animation) => animation.id,
);

/** `getAnimationById` (`V` in the original): searches show then hide. */
export function getAnimationById(
  id: string,
  r: OffsetResolver = ZERO_OFFSETS,
): AnimationDef | undefined {
  return [...createShowAnimations(r), ...createHideAnimations(r)].find(
    (animation) => animation.id === id,
  );
}

/* -------------------------------------------------------------------------- */
/* Gating                                                                     */
/* -------------------------------------------------------------------------- */

/** Membership context used by {@link isSkinLocked}. */
export interface GatingContext {
  /** Subscription status; `active` unlocks PRO and DISCORD skins. */
  subscriptionStatus?: SubscriptionStatus;
  /** Whether the user has a linked Discord connection (`connections.discord`). */
  hasDiscordConnection?: boolean;
  /** `user.is_discord_member`. */
  isDiscordMember?: boolean;
}

/** `subscription.status === SubscriptionStatus.ACTIVE` (`g?.status === X.ACTIVE`). */
export function isSubscriptionActive(
  status: SubscriptionStatus | undefined,
): boolean {
  return status === SubscriptionStatus.ACTIVE;
}

/**
 * Skin lock rule.
 *
 * - FREE: never locked.
 * - PRO (`status === 1`): locked unless the subscription is active
 *   (`K = (a) => a.status === u.PRO && !T`).
 * - DISCORD (`status === 2`): locked unless the user is a Discord member
 *   (connection AND `is_discord_member`) or the subscription is active
 *   (`amuse-dashboard.js:1714`).
 */
export function isSkinLocked(
  entry: SkinEntry,
  context: GatingContext = {},
): boolean {
  const isActive = isSubscriptionActive(context.subscriptionStatus);

  if (entry.status === SkinTier.FREE) return false;
  if (entry.status === SkinTier.PRO) return !isActive;
  if (entry.status === SkinTier.DISCORD) {
    const isDiscordMember =
      context.hasDiscordConnection === true && context.isDiscordMember === true;
    return !isDiscordMember && !isActive;
  }
  return false;
}
