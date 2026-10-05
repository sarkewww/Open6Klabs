/**
 * Shared user enums ported from the original Amuse widget.
 *
 * Source: `.omo/_beautify/user.interface.js` (exports `C`, `M`, `P`, `T`),
 * cross-checked against `widget/assets/user.interface-DOh0J4ZW.js` (export `M`).
 *
 * Style: `as const` objects + derived union types. The runtime string values
 * MUST stay byte-identical to the originals — no member may be added, removed,
 * renamed, re-cased, or re-hyphenated.
 */

/** Authentication provider of a user account (`P` in the original). */
export const Provider = {
  GOOGLE: 'google',
  FACEBOOK: 'facebook',
  TWITCH: 'twitch',
  EMAIL: 'email',
  DISCORD: 'discord',
  TWITTER: 'twitter',
  SPOTIFY: 'spotify',
  YTMDESKTOP: 'ytmdesktop',
} as const;
export type Provider = (typeof Provider)[keyof typeof Provider];

/** Cover style of the now-playing widget (`C` in the original). */
export const Cover = {
  SQUARE: 'square',
  CANVAS: 'canvas',
  VINYL: 'vinyl',
  NONE: 'none',
} as const;
export type Cover = (typeof Cover)[keyof typeof Cover];

/** Music source the widget listens to (`M` in the original). */
export const MusicSource = {
  SPOTIFY: 'spotify',
  PEAR_DESKTOP: 'pear-desktop',
  YTM_DESKTOP: 'ytm-desktop',
  APPLE: 'apple-music',
  TIDAL: 'tidal',
  SPICETIFY: 'spicetify',
} as const;
export type MusicSource = (typeof MusicSource)[keyof typeof MusicSource];

/** UI theme of the widget (`T` in the original). */
export const Theme = {
  DARK: 'default_dark',
  LIGHT: 'default_light',
} as const;
export type Theme = (typeof Theme)[keyof typeof Theme];
