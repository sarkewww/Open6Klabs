/**
 * Square cover — `settings.cover === "square"` (`Cover.SQUARE`).
 *
 * Faithful port of the square branch of the original cover component `Q`
 * (`app/_reference/PlayerWindows98-ChpRHqWu.js:186-209`) together with its
 * album-art child `ms` (`:228-251`). The shared `Q` / `ms` layers live in
 * `cover-layers.tsx`; this module supplies the square-specific radius, mask and
 * image.
 *
 * `Q`'s default radius when no `radius` prop is passed is `"0.5rem"`
 * (`m ?? e.radius ?? "0.5rem"`, `:209`). The dispatch
 * (`app/src/amuse/covers/index.tsx`) renders covers without props, so the
 * square cover uses that default. The glow's radius is the same expression
 * (`:209`), and `ms`'s album-art radius is `e.radius ?? "0.5rem"` (`:251`).
 *
 * Fidelity notes: the original wraps the glow/album layers in framer-motion
 * `motion.div` + `AnimatePresence` and cross-fades the previous/current cover
 * through an `Image`-load state machine. Those wrappers render plain `<div>`
 * elements, so this port reproduces the exact DOM elements, class names and
 * inline styles of the settled state (a single current-cover layer). Every
 * static value — crop (`background-size: cover` / `center`), radius (`0.5rem`),
 * blur (`blur-md`), glow brightness (`brightness-150`), mask — is byte-identical
 * to the original; no animation timing is re-implemented.
 */

import { usePlayerStoreSelector } from '../player/context';
import { useProfileSettings } from '../profile/context';
import { CoverArt, CoverGlow } from './cover-layers';

/** Matches `Q`'s `m ?? e.radius ?? "0.5rem"` default for non-vinyl covers. */
export const SQUARE_COVER_RADIUS = '0.5rem';

/**
 * `ms`'s radial mask for non-vinyl covers. The `useSpring` settles at `-0.5`
 * (`x.set(t.cover === E.VINYL ? 5.5 : -0.5)`, `:248`), so the square mask is
 * `radial-gradient(circle at center, transparent -0.5%, black -0.5%)` — a
 * fully-opaque mask. Reproduced verbatim for structural parity.
 */
export const SQUARE_COVER_MASK =
  'radial-gradient(circle at center, transparent -0.5%, black -0.5%)';

export interface SquareCoverProps {
  /** Cover corner radius; original default `"0.5rem"` when omitted. */
  radius?: string;
}

export function SquareCover({
  radius = SQUARE_COVER_RADIUS,
}: SquareCoverProps = {}) {
  const settings = useProfileSettings();
  const coverUrl = usePlayerStoreSelector(
    (state) => state.currentTrack.cover_url,
  );
  const showGlow = Boolean(settings.cover_glow && coverUrl);

  return (
    <div
      data-testid="amuse-cover"
      data-cover="square"
      className="relative aspect-square h-full"
    >
      <div
        className="relative h-full w-full transform-gpu"
        style={{ transformOrigin: 'center center' }}
      >
        <div className="relative z-50">
          <CoverArt
            radius={radius}
            mask={SQUARE_COVER_MASK}
            testId="amuse-cover-art"
            image={
              coverUrl ? (
                <div
                  data-testid="amuse-cover-art-image"
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `url(${coverUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                />
              ) : null
            }
          />
        </div>
        <CoverGlow show={showGlow} radius={radius} coverUrl={coverUrl} />
      </div>
    </div>
  );
}
