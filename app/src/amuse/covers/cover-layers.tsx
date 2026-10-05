/**
 * Shared `Q` / `ms` cover layers.
 *
 * The original cover component `Q` (`PlayerWindows98-ChpRHqWu.js:186-209`) and
 * its album-art child `ms` (`:228-251`) render the SAME wrapper DOM for every
 * cover kind — only the radius / mask / centre-dot / canvas media differ. This
 * module ports those two layers verbatim so `SquareCover`, `VinylCover` and
 * `CanvasCover` share one exact structure:
 *
 *   Q  : div.relative.aspect-square.h-full
 *        └ div.relative.h-full.w-full.transform-gpu      [transformOrigin center]
 *          ├ div.relative.z-50
 *          │  └ ms : div.aspect-square.h-full
 *          │         └ div.relative.h-full.w-full
 *          │            └ div.relative.flex.aspect-square.items-center
 *          │              .justify-center.overflow-hidden  [radius + mask]
 *          │              ├ cover image div.absolute.inset-0
 *          │              ├ div.relative.flex.h-full.w-full.scale-[101%]
 *          │              │  .transform-gpu.items-center.justify-center
 *          │              │  .overflow-hidden                [ms's `j`]
 *          │              └ (vinyl) div.absolute.h-[20%].w-[20%].rounded-full
 *          └ div.absolute.inset-0.overflow-hidden.blur-md.brightness-150
 *                                                          [glow]
 *             └ div.absolute.inset-0                        [glow fallback]
 *
 * Class names, hierarchy and inline styles are copied verbatim; the only
 * additions are the stable `data-*` test hooks carried over from the cover
 * STUB contract.
 */

import type { ReactNode } from 'react';

/* -------------------------------------------------------------------------- */
/* `ms` — album-art layer                                                      */
/* -------------------------------------------------------------------------- */

export interface CoverArtProps {
  /** `ms`'s `borderRadius` (`e.radius ?? "0.5rem"`; vinyl uses 3.5rem/7rem). */
  radius: string;
  /** `ms`'s `mask-image` (`radial-gradient(circle at center, …)`). */
  mask: string;
  /** The cover image layer (`div.absolute.inset-0`). */
  image: ReactNode;
  /** Optional canvas media, rendered inside `j` (empty for non-canvas). */
  canvas?: ReactNode;
  /** Optional vinyl centre dot. */
  centerDot?: ReactNode;
  /** `data-testid` on the album-art clip node. */
  testId?: string;
}

/** Original `ms` (`PlayerWindows98-ChpRHqWu.js:228-251`). */
export function CoverArt({
  radius,
  mask,
  image,
  canvas,
  centerDot,
  testId,
}: CoverArtProps) {
  return (
    <div className="aspect-square h-full">
      <div className="relative h-full w-full">
        <div
          data-testid={testId}
          className="relative flex aspect-square items-center justify-center overflow-hidden"
          style={{
            borderRadius: radius,
            WebkitMaskImage: mask,
            maskImage: mask,
          }}
        >
          {image}
          {/* Original `j` (`:250`): the canvas-video slot, always rendered. */}
          <div className="relative flex h-full w-full scale-[101%] transform-gpu items-center justify-center overflow-hidden">
            {canvas}
          </div>
          {centerDot}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* `Q` — glow layer                                                            */
/* -------------------------------------------------------------------------- */

export interface CoverGlowProps {
  /** `i = !!(settings.cover_glow && cover_url)`. */
  show: boolean;
  /** Glow `borderRadius` (vinyl 3.5rem/7rem, else `radius ?? "0.5rem"`). */
  radius: string;
  /** Cover url for the fallback image layer. */
  coverUrl: string;
}

/**
 * Original `Q`'s glow layer (`:209`). For every fixture case the video branch
 * (`c`) is false, so the fallback `div.absolute.inset-0` image is rendered
 * (the canvas video lives in `j` above, matching the original).
 */
export function CoverGlow({ show, radius, coverUrl }: CoverGlowProps) {
  return (
    <div
      data-testid="amuse-cover-glow"
      data-cover-glow={String(show)}
      className="absolute inset-0 overflow-hidden blur-md brightness-150"
      style={{ opacity: show ? 1 : 0, borderRadius: radius }}
    >
      <div
        data-testid="amuse-cover-glow-image"
        className="absolute inset-0"
        style={{
          backgroundImage: coverUrl ? `url(${coverUrl})` : undefined,
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover',
        }}
      />
    </div>
  );
}
