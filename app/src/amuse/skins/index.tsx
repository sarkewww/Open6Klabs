/**
 * Skin dispatch — `settings.skin` -> one of the 8 skin components.
 *
 * Source: the original skin registry array `B` in `AmuseWidget.js:7499-7537`,
 * which maps each skin id to a component element and renders:
 *
 *   (B.find((entry) => entry.id === settings.skin) ?? B[0]).element
 *
 * i.e. an unknown/missing skin falls back to the FIRST registry entry
 * (`compact`). The original filters `windows98` out unless the
 * `WINDOWS_98_PLAYER` feature flag is on; the flag-gated visibility is owned by
 * `getVisibleSkins()` in `app/src/amuse/settings/registry.ts`, so this dispatch
 * always knows all 8 ids.
 */

import type { ComponentType } from 'react';
import { useProfileSettings } from '../profile/context';
import { Skin, type SkinId } from '../settings/registry';
import { Boxy } from './Boxy';
import { Compact } from './Compact';
import { Discord } from './Discord';
import { Gallery } from './Gallery';
import { MacOS } from './MacOS';
import { Minimal } from './Minimal';
import { Shell } from './Shell';
import { Windows98 } from './Windows98';

/** `settings.skin` -> skin component (all 8 ids). */
export const SKIN_COMPONENTS: Record<SkinId, ComponentType> = {
  [Skin.COMPACT]: Compact,
  [Skin.BOXY]: Boxy,
  [Skin.GALLERY]: Gallery,
  [Skin.MINIMAL]: Minimal,
  [Skin.MACOS]: MacOS,
  [Skin.SHELL]: Shell,
  [Skin.DISCORD]: Discord,
  [Skin.WINDOWS98]: Windows98,
};

/**
 * Renders the skin selected by `settings.skin`. Unknown values fall back to the
 * compact skin (the original `?? B[0]`).
 */
export function SkinView() {
  const settings = useProfileSettings();
  const Component =
    SKIN_COMPONENTS[settings.skin as SkinId] ?? SKIN_COMPONENTS[Skin.COMPACT];
  return <Component />;
}
