/**
 * Shared subscription enums ported from the original Amuse widget.
 *
 * Source: `.omo/_beautify/subscription.interface.js` (exports `S`, `a`),
 * cross-checked against `widget/assets/subscription.interface-Z04-ZM87.js`
 * (exports `S`/`a`).
 *
 * Style: `as const` objects + derived union types. The runtime string values
 * MUST stay byte-identical to the originals — no member may be added, removed,
 * renamed, re-cased, or re-hyphenated.
 */

/** Lifecycle status of a user's subscription (`S` in the original). */
export const SubscriptionStatus = {
  ACTIVE: 'active',
  CANCELED: 'canceled',
  REVOKED: 'revoked',
  INACTIVE: 'inactive',
} as const;
export type SubscriptionStatus =
  (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

/** Paid tier of a user account (`a` in the original). */
export const Tier = {
  FREE: 'free',
  PRO: 'pro',
  SUPPORTER: 'supporter',
} as const;
export type Tier = (typeof Tier)[keyof typeof Tier];
