/**
 * Cover dispatch — `settings.cover` -> square / canvas / vinyl / none.
 *
 * Source: the original cover component `Q`
 * (`app/_reference/PlayerWindows98-ChpRHqWu.js:186-209`), which switches on
 * `settings.cover`:
 *   - `Cover.NONE`   -> `return null`            (`NoneCover`)
 *   - `Cover.VINYL`  -> rotating disc + mask      (`VinylCover`)
 *   - `Cover.CANVAS` -> `<video>` canvas          (`CanvasCover`)
 *   - otherwise      -> square album art          (`SquareCover`)
 *
 * The `COVERS` registry (`app/src/amuse/settings/registry.ts`) owns the ids;
 * this module owns the component map. Each cover component shares the
 * `cover-layers.tsx` structure (`Q` / `ms`) and is rendered by `CoverView`.
 */

import type { ComponentType } from 'react';
import { useProfileSettings } from '../profile/context';
import { Cover } from '../types/user';
import { CanvasCover } from './CanvasCover';
import { NoneCover } from './NoneCover';
import { SquareCover } from './SquareCover';
import { VinylCover } from './VinylCover';

/** `settings.cover` -> cover component. */
export const COVER_COMPONENTS: Record<Cover, ComponentType> = {
  [Cover.SQUARE]: SquareCover,
  [Cover.CANVAS]: CanvasCover,
  [Cover.VINYL]: VinylCover,
  [Cover.NONE]: NoneCover,
};

/**
 * Renders the cover selected by `settings.cover`. Unknown values fall back to
 * the square cover (the original `Q`'s default branch).
 */
export function CoverView() {
  const settings = useProfileSettings();
  const Component =
    COVER_COMPONENTS[settings.cover] ?? COVER_COMPONENTS[Cover.SQUARE];
  return <Component />;
}
