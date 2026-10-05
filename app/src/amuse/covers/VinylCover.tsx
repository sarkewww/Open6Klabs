/**
 * Vinyl cover — `settings.cover === "vinyl"` (`Cover.VINYL`).
 *
 * Faithful port of the vinyl branch of the original cover component `Q`
 * (`app/_reference/PlayerWindows98-ChpRHqWu.js:186-209`) plus its centre-cover
 * `ms` (`:228-251`). The shared `Q` / `ms` layers live in `cover-layers.tsx`.
 *
 *   1. Rotating wrapper `u` (`:198`): `className="relative h-full w-full
 *      transform-gpu"`, `style={{ transformOrigin: "center center" }}`, and the
 *      imperative `style.transform = \`rotateZ(${h.current}deg)\``.
 *   2. Rotation loop (`:190-205`):
 *        - playing  (`cover === VINYL && is_playing`):
 *            `p += (0.7 - p) * 0.05; h += p;`
 *          i.e. the angular velocity eases toward 0.7 deg/frame (clockwise) and
 *          the start is deferred by 500 ms.
 *        - paused / other:
 *            `j = -(h % 360)` normalised to (-180, 180]; `p = j * 0.05;
 *             h += p;` and once `|j| < 0.05` the disc snaps to `h = 0` and the
 *            rAF loop ends — paused => not spinning.
 *   3. Centre cover `ms` (`:251`): album art clipped to a rounded square with a
 *      radial-gradient centre hole (`transparent 5.5%, black 5.5%`) and a
 *      vibrant centre dot (`h-[20%] w-[20%] rounded-full`).
 *
 * The rotation period/direction are preserved verbatim: a positive `rotateZ`
 * (clockwise) easing to {@link VINYL_SPIN_TARGET_DEG_PER_FRAME} deg/frame —
 * 42 deg/s at 60 fps, a full turn every {@link VINYL_SPIN_PERIOD_SECONDS}s.
 *
 * The glow layer rotates with the disc (both live inside the rotating wrapper),
 * matching `Q`'s `[ms, glow]` children.
 */

import { useEffect, useRef, type RefObject } from 'react';
import { useCoverColors } from '../player/colors';
import { usePlayerStoreSelector } from '../player/context';
import { useProfileSettings } from '../profile/context';
import { CoverArt, CoverGlow } from './cover-layers';

/* -------------------------------------------------------------------------- */
/* Rotation parameters — verbatim from `Q` (`PlayerWindows98-ChpRHqWu.js:193`) */
/* -------------------------------------------------------------------------- */

/** Original target angular velocity (`0.7` in `p += (0.7 - p) * 0.05`). */
export const VINYL_SPIN_TARGET_DEG_PER_FRAME = 0.7;
/** Original velocity easing factor (`0.05`). */
export const VINYL_SPIN_SMOOTHING = 0.05;
/** Original start delay before the first rAF while playing (`:200`). */
export const VINYL_SPIN_START_DELAY_MS = 500;
/** Original settle threshold (`|j| < 0.05` -> stop) (`:196`). */
export const VINYL_SPIN_SETTLE_EPSILON_DEG = 0.05;
/** Positive `rotateZ` turns clockwise; the original never negates the angle. */
export const VINYL_SPIN_DIRECTION = 'clockwise' as const;
/** The reference frame rate used to derive the period from deg/frame. */
export const VINYL_SPIN_FRAME_RATE = 60;
/** Derived period of one full clockwise turn at {@link VINYL_SPIN_FRAME_RATE}. */
export const VINYL_SPIN_PERIOD_SECONDS =
  360 / (VINYL_SPIN_TARGET_DEG_PER_FRAME * VINYL_SPIN_FRAME_RATE);

/** Original centre-hole mask (`y` = `radial-gradient(circle at center, ...)`). */
export const VINYL_CENTER_MASK =
  'radial-gradient(circle at center, transparent 5.5%, black 5.5%)';

/** Original `m`: vinyl radius (`t.skin === "gallery" ? "7rem" : "3.5rem"`). */
export function vinylCoverRadius(skin: string): string {
  return skin === 'gallery' ? '7rem' : '3.5rem';
}

/* -------------------------------------------------------------------------- */
/* Rotation loop — port of `Q`'s `w()` (`:192-199`)                            */
/* -------------------------------------------------------------------------- */

/**
 * Drives the disc rotation exactly like the original rAF loop. `angle` and
 * `velocity` persist across effect runs (the original keeps them in `h`/`p`
 * refs), so pausing decelerates from the current angle instead of resetting.
 */
function useVinylRotation(
  ref: RefObject<HTMLDivElement | null>,
  isPlaying: boolean,
): void {
  const angleRef = useRef(0);
  const velocityRef = useRef(0);

  useEffect(() => {
    let frameId = 0;
    let startTimer: ReturnType<typeof setTimeout> | undefined;
    let running = true;

    const tick = () => {
      if (isPlaying) {
        velocityRef.current +=
          (VINYL_SPIN_TARGET_DEG_PER_FRAME - velocityRef.current) *
          VINYL_SPIN_SMOOTHING;
        angleRef.current += velocityRef.current;
      } else {
        let delta = -(angleRef.current % 360);
        if (Math.abs(delta) > 180) {
          delta = delta > 0 ? delta - 360 : delta + 360;
        }
        velocityRef.current = delta * VINYL_SPIN_SMOOTHING;
        angleRef.current += velocityRef.current;
        if (Math.abs(delta) < VINYL_SPIN_SETTLE_EPSILON_DEG) {
          angleRef.current = 0;
          velocityRef.current = 0;
          running = false;
        }
      }

      if (ref.current) {
        ref.current.style.transform = `rotateZ(${angleRef.current}deg)`;
      }
      if (running) {
        frameId = requestAnimationFrame(tick);
      }
    };

    if (isPlaying) {
      startTimer = setTimeout(() => {
        frameId = requestAnimationFrame(tick);
      }, VINYL_SPIN_START_DELAY_MS);
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      if (startTimer !== undefined) clearTimeout(startTimer);
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [ref, isPlaying]);
}

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

export function VinylCover() {
  const settings = useProfileSettings();
  const coverUrl = usePlayerStoreSelector(
    (state) => state.currentTrack.cover_url,
  );
  const isPlaying = usePlayerStoreSelector(
    (state) => state.currentTrack.is_playing,
  );
  const { colors } = useCoverColors();
  const showGlow = Boolean(settings.cover_glow && coverUrl);
  const discRef = useRef<HTMLDivElement>(null);

  useVinylRotation(discRef, isPlaying);

  const radius = vinylCoverRadius(settings.skin);

  return (
    <div
      data-testid="amuse-cover"
      data-cover="vinyl"
      className="relative aspect-square h-full"
    >
      <div
        ref={discRef}
        data-testid="amuse-vinyl-disc"
        data-spinning={String(isPlaying)}
        data-spin-direction={VINYL_SPIN_DIRECTION}
        data-spin-target-deg-per-frame={VINYL_SPIN_TARGET_DEG_PER_FRAME}
        data-spin-smoothing={VINYL_SPIN_SMOOTHING}
        data-spin-start-delay-ms={VINYL_SPIN_START_DELAY_MS}
        data-spin-settle-epsilon-deg={VINYL_SPIN_SETTLE_EPSILON_DEG}
        data-spin-frame-rate={VINYL_SPIN_FRAME_RATE}
        data-spin-period-seconds={VINYL_SPIN_PERIOD_SECONDS}
        className="relative h-full w-full transform-gpu"
        style={{ transformOrigin: 'center center' }}
      >
        <div className="relative z-50">
          <CoverArt
            radius={radius}
            mask={VINYL_CENTER_MASK}
            testId="amuse-vinyl-center"
            image={
              <div
                data-testid="amuse-vinyl-center-art"
                className="absolute inset-0"
                style={{
                  backgroundImage: coverUrl ? `url(${coverUrl})` : undefined,
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: 'cover',
                }}
              />
            }
            centerDot={
              <div
                data-testid="amuse-vinyl-center-hole"
                className="absolute h-[20%] w-[20%] rounded-full"
                style={{ backgroundColor: colors.vibrant }}
              />
            }
          />
        </div>
        <CoverGlow show={showGlow} radius={radius} coverUrl={coverUrl} />
      </div>
    </div>
  );
}
