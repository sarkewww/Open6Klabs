/**
 * Windows 98 skin — faithful port of `Sr` (export `g`).
 *
 * Source: `app/_reference/PlayerWindows98-ChpRHqWu.js:1277-1296`; minified
 * `widget/assets/PlayerWindows98-ChpRHqWu.js` (export `Sr as g`). The original
 * `Sr` is the 8th skin of the widget and is registered as PRO-tier
 * (`Skin.WINDOWS98`, `SKINS` in `../settings/registry`) and feature-flagged
 * behind `WINDOWS_98_PLAYER`. Both the PRO lock (`isSkinLocked`) and the flag
 * visibility (`getVisibleSkins`) live in the registry and are intentionally
 * UNCHANGED here — this module only ports the skin's rendering.
 *
 * The original DOM (exact class names preserved):
 *
 *   G (padding/scale wrapper)                                    :142-164
 *   └ div.h-full.w-full.bg-black
 *     ├ <style>  full 98.css sheet inside `@scope { ... }`       :1291-1294
 *     └ div.window  [width 300 (has cover) | 220 (no cover)]
 *       ├ div.title-bar.h-[18px]  [magic_colors gradient]        :1295
 *       │ ├ div.flex.items-center.justify-center.gap-1
 *       │ │ ├ img (wm-3 icon, imageRendering pixelated)
 *       │ │ └ div.title-bar-text "Amuse"
 *       │ └ div.title-bar-controls -> Minimize/Maximize/Close buttons
 *       └ div.window-body.flex.gap-2
 *         ├ div.sunken-panel.aspect-square... (pixelated <canvas>)
 *         └ div.grid.w-full.shrink.grid-cols-1.px-2.py-1.5.text-black
 *           ├ div#songinfo -> ee (title) + <p><span>{artist}</span></p> + glow div
 *           └ div#songtime
 *             ├ live indicator (U) | elapsed (msecToTime) + duration
 *             └ div#playbar.sunken-panel -> div#active + draggable window thumb
 *
 * `ee` (title), `U` (live dot), `O()` (`msecToTime`) and `G` are reimplemented
 * locally so this module stays self-contained (the concurrent sibling skin
 * tasks own their own helper modules). The pixelated cover hook reproduces the
 * original `vr` (`:1239-1272`) observable contract — crop, saturation boost,
 * palette quantisation (`Dt`, `:1224`) and ordered dithering (`mr`, `:1233`) —
 * using the browser canvas API instead of the bundled image-q machinery.
 *
 * The root wrapper keeps `data-testid="amuse-skin"` / `data-skin="windows98"`
 * so the shared skin-dispatch test (`player-wrapper.test.tsx`) still resolves
 * the Windows 98 skin after the stub frame was replaced.
 */

import { twMerge } from 'tailwind-merge';
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { useCoverColors } from '../player/colors';
import { usePlayerStoreSelector } from '../player/context';
import { PlaybackState } from '../player/store';
import { useProfileSettings } from '../profile/context';
import { getCurrentFont } from '../settings/registry';
import { Cover, Theme } from '../types/user';
import { WINDOWS_98_SCOPE_CSS } from './windows98Css';

/** Original `xr` — the Amuse title-bar icon (`:1273`). */
export const WINDOWS_98_ICON = '/assets/wm-3-B_9bguE5.png';

/** Original `xt` default (`lt(5)`) — player padding percent. */
export const PLAYER_PADDING_PERCENT = 5;

/* -------------------------------------------------------------------------- */
/* `O()` helpers used by `Sr`                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Original `O().msecToTime` — `mm:ss`, with an unpadded `h:` prefix once the
 * track is at least an hour long (`PlayerWindows98-ChpRHqWu.js:313-315`).
 */
export function msecToTime(ms: number): string {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (60 * 1000)) % 60);
  const hours = Math.floor((ms / (3600 * 1000)) % 3600);
  const pad = (value: number): string =>
    value < 10 ? `0${value}` : value.toString();
  return `${hours > 0 ? `${hours}:` : ''}${pad(minutes)}:${pad(seconds)}`;
}

/** Original `xs` — true when the ref's content overflows horizontally. */
function useHasOverflow<T extends HTMLElement>(
  value: string,
  ref: RefObject<T | null>,
): boolean {
  const [hasOverflow, setHasOverflow] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (element) {
      setHasOverflow(element.scrollWidth > element.clientWidth);
    }
  }, [value, ref]);
  return hasOverflow;
}

/* -------------------------------------------------------------------------- */
/* `G` — padding/scale wrapper                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Original `G` (`:142-164`) — pads the player by
 * {@link PLAYER_PADDING_PERCENT} and scales the content down to fit. The
 * measurement is guarded so jsdom (zero-sized layout) keeps the deterministic
 * initial `scale(1)`.
 */
function Windows98Scale({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const measure = () => {
      const element = ref.current;
      const parent = element?.parentElement;
      if (
        !element ||
        !parent ||
        !element.clientWidth ||
        !element.clientHeight
      ) {
        return;
      }
      const paddingX = (parent.clientWidth * PLAYER_PADDING_PERCENT) / 100;
      const paddingY = (parent.clientHeight * PLAYER_PADDING_PERCENT) / 100;
      const availableWidth = parent.clientWidth - paddingX * 2;
      const availableHeight = parent.clientHeight - paddingY * 2;
      const next = Math.min(
        availableWidth / element.clientWidth,
        availableHeight / element.clientHeight,
      );
      if (Number.isFinite(next) && next > 0) {
        setScale(next);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return (
    <div
      data-testid="amuse-skin"
      data-skin="windows98"
      className="relative flex h-full w-full select-none items-center justify-center"
      style={{ padding: `${PLAYER_PADDING_PERCENT}%` }}
    >
      <div
        ref={ref}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'center',
          perspective: 900,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* `ee` (title) + `U` (live dot)                                               */
/* -------------------------------------------------------------------------- */

/** Original `ee` — track title with the selected font's title class. */
function SkinTitle({ className }: { className?: string }) {
  const title = usePlayerStoreSelector((state) => state.currentTrack.title);
  const settings = useProfileSettings();
  const font = getCurrentFont(settings.font);
  const ref = useRef<HTMLParagraphElement>(null);
  const spanRef = useRef<HTMLSpanElement>(null);
  const hasOverflow = useHasOverflow(title, ref);

  return (
    <p
      ref={ref}
      className={twMerge(
        'relative z-50 overflow-clip whitespace-nowrap',
        font.titleClassName,
        hasOverflow && 'animated-title',
        settings.cover_blur &&
          settings.skin !== 'macos' &&
          settings.skin !== 'shell' &&
          settings.skin !== 'discord' &&
          'text-white',
        className,
      )}
    >
      <span
        ref={spanRef}
        style={{
          animationDuration: `${(spanRef.current?.clientWidth ?? 500) / 50}s`,
          animationTimingFunction: 'linear',
          animationDelay: '0s',
          animationIterationCount: 'infinite',
          animationDirection: 'alternate',
          animationName: 'move',
        }}
      >
        {title}
      </span>
    </p>
  );
}

/** Original `U` — live indicator dot. */
function LiveIndicator({ className }: { className?: string }) {
  const isPlaying = usePlayerStoreSelector(
    (state) => state.currentTrack.is_playing,
  );

  return (
    <div className={twMerge('relative', className)}>
      <div
        className={twMerge(
          'h-2 w-2 rounded-full bg-gray-500',
          isPlaying && 'bg-red-600',
        )}
      />
      <div className="absolute inset-0">
        <div
          className={twMerge(
            'h-2 w-2 animate-ping rounded-full bg-red-600 opacity-0',
            isPlaying && 'opacity-100',
          )}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* `vr` — pixelated cover (crop + saturation boost + quantise + dither)        */
/* -------------------------------------------------------------------------- */

/** Original `$e` — the 16-colour Windows palette (ABGR-packed). */
const PALETTE_16 = [
  4278190080, 4286578688, 4278222848, 4286611456, 4278190208, 4286578816,
  4278222976, 4290822336, 4286611584, 4294901760, 4278255360, 4294967040,
  4278190335, 4294902015, 4278255615, 4294967295,
];

/** Original `gr` — extended palette used for bright warm images. */
const PALETTE_EXTENDED = [
  ...PALETTE_16,
  4294934656,
  4286644096,
  4286611711,
  4294934783,
  4286644223,
  4294967168,
  4290805888,
  4286627968,
  4286611648,
  4290805952,
  4286628032,
  4290822272,
];

/** Original `Be` — global brightness multiplier. */
const PALETTE_BRIGHTNESS = 1;

/**
 * Original `Dt` (`:1224-1232`) — nearest-colour palette mapping (a weighted
 * RGB distance with a warm-colour bias). Operates on the ABGR-packed channel
 * order the original uses.
 */
export function mapToPalette(red: number, green: number, blue: number): number {
  let r = Math.min(255, Math.floor(red * PALETTE_BRIGHTNESS));
  const g = Math.min(255, Math.floor(green * PALETTE_BRIGHTNESS));
  let b = Math.min(255, Math.floor(blue * PALETTE_BRIGHTNESS));
  if (r > g * 1.5 && b > g * 1.5) {
    r = Math.min(255, Math.floor(r * 1.1));
    b = Math.min(255, Math.floor(b * 1.1));
  }

  let best = PALETTE_16[0];
  let bestDistance = Number.MAX_VALUE;
  const palette = r > 200 && b > 200 && g < 150 ? PALETTE_EXTENDED : PALETTE_16;

  for (const entry of palette) {
    const pr = (entry >> 16) & 255;
    const pg = (entry >> 8) & 255;
    const pb = entry & 255;
    const mean = (r + pr) / 2;
    const dr = r - pr;
    const dg = g - pg;
    const db = b - pb;
    const distanceR = (2 + mean / 256) * dr * dr;
    const distanceG = 4 * dg * dg;
    const distanceB = (2 + (255 - mean) / 256) * db * db;
    const weight = r > g && b > g ? 0.8 : 1;
    const distance = Math.sqrt(distanceR + distanceG + distanceB) * weight;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry;
    }
  }

  if (
    r > 180 &&
    b > 180 &&
    g < 150 &&
    (best === 4286611584 || best === 4290822336)
  ) {
    return 4294902015;
  }
  return best;
}

/** Original `mr`'s 4x4 ordered-dither matrix (`:1234`). */
const DITHER_MATRIX = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
const DITHER_SIZE = 4;
const DITHER_DIVISOR = 16;

/** Original `mr` (`:1233-1238`) — ordered dithering over packed pixels. */
export function ditherPixels(
  width: number,
  height: number,
  pixels: Uint32Array,
): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const packed = pixels[index];
      const c = (packed >> 16) & 255;
      const h = (packed >> 8) & 255;
      const d = packed & 255;
      const warm = c > h * 1.5 && d > h * 1.5;
      const offset =
        ((DITHER_MATRIX[y % DITHER_SIZE][x % DITHER_SIZE] /
          (DITHER_SIZE * DITHER_SIZE)) *
          (warm ? 100 : 128)) /
        DITHER_DIVISOR;
      const bias = warm ? 0.2 : 0.3;
      const v = Math.min(255, Math.max(0, c + offset - offset * bias));
      const m = Math.min(255, Math.max(0, h + offset - offset * bias));
      const n = Math.min(255, Math.max(0, d + offset - offset * bias));
      pixels[index] = mapToPalette(v, m, n);
    }
  }
}

/** Original `vr`'s per-pixel saturation/contrast boost (`:1254-1257`). */
function boostSaturation(pixels: Uint32Array): void {
  for (let index = 0; index < pixels.length; index++) {
    const packed = pixels[index];
    const c = (packed >> 16) & 255;
    const h = (packed >> 8) & 255;
    const d = packed & 255;
    const warm = c > h * 1.5 && d > h * 1.5;
    const gain = warm ? 1.1 : 1.05;
    const contrast = warm ? 1.15 : 1.1;
    const r = Math.min(
      255,
      Math.max(0, Math.floor((c - 128) * contrast + 128) * gain),
    );
    const g = Math.min(
      255,
      Math.max(0, Math.floor((h - 128) * contrast + 128) * gain),
    );
    const b = Math.min(
      255,
      Math.max(0, Math.floor((d - 128) * contrast + 128) * gain),
    );
    pixels[index] = (255 << 24) | (r << 16) | (g << 8) | b;
  }
}

/** Original `vr`'s aspect-ratio crop + 150x150 downscale (`:1249-1253`). */
function cropAndScale(
  image: HTMLImageElement,
  maxWidth: number,
  maxHeight: number,
): ImageData {
  const ratio = image.width / image.height;
  const targetRatio = maxWidth / maxHeight;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Failed to get canvas 2D context');
  }

  let sx = 0;
  let sy = 0;
  let sw = image.width;
  let sh = image.height;
  if (Math.abs(ratio - 16 / 9) < 0.1 || ratio > targetRatio) {
    sw = image.height * targetRatio;
    sx = (image.width - sw) / 2;
  } else if (ratio < targetRatio) {
    sh = image.width / targetRatio;
    sy = (image.height - sh) / 2;
  }

  canvas.width = maxWidth;
  canvas.height = maxHeight;
  context.drawImage(image, sx, sy, sw, sh, 0, 0, maxWidth, maxHeight);
  return context.getImageData(0, 0, maxWidth, maxHeight);
}

/** Original `ar` (`:690-692`) — load an image with anonymous CORS. */
async function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = src;
  await image.decode();
  return image;
}

/** The `vr` buffer contract: dimensions + a `blitCanvas` equivalent. */
export interface PixelatedCoverBuffer {
  width: number;
  height: number;
  toImageData: () => ImageData;
}

export interface PixelatedCoverOptions {
  imageUrl: string;
  maxWidth?: number;
  maxHeight?: number;
  useDithering?: boolean;
  dependencyKey?: string;
}

export interface PixelatedCoverResult {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  isLoading: boolean;
  error: Error | null;
  buffer: PixelatedCoverBuffer | null;
}

/**
 * Original `vr` (`:1239-1272`) — resolves the current cover into a pixelated
 * 150x150 buffer and blits it to the bound canvas. Returns the same observable
 * contract (`canvasRef` / `isLoading` / `error` / `buffer`).
 */
export function usePixelatedCover({
  imageUrl,
  maxWidth = 150,
  maxHeight = 150,
  useDithering = true,
  dependencyKey,
}: PixelatedCoverOptions): PixelatedCoverResult {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [buffer, setBuffer] = useState<PixelatedCoverBuffer | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!imageUrl) {
      setBuffer(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setIsLoading(true);
        setError(null);
        const image = await loadImage(imageUrl);
        const imageData = cropAndScale(image, maxWidth, maxHeight);
        const pixels = new Uint32Array(imageData.data.buffer);
        boostSaturation(pixels);
        if (useDithering) {
          ditherPixels(maxWidth, maxHeight, pixels);
        } else {
          for (let index = 0; index < pixels.length; index++) {
            const packed = pixels[index];
            pixels[index] = mapToPalette(
              (packed >> 16) & 255,
              (packed >> 8) & 255,
              packed & 255,
            );
          }
        }
        if (!cancelled) {
          setBuffer({
            width: maxWidth,
            height: maxHeight,
            toImageData: () => imageData,
          });
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause : new Error(String(cause)));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [imageUrl, maxWidth, maxHeight, useDithering, dependencyKey]);

  useEffect(() => {
    if (buffer && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      context?.putImageData(buffer.toImageData(), 0, 0);
    }
  }, [buffer]);

  return { canvasRef, isLoading, error, buffer };
}

/* -------------------------------------------------------------------------- */
/* Skin                                                                        */
/* -------------------------------------------------------------------------- */

/** Windows 98 skin — the original `Sr` (`PlayerWindows98-ChpRHqWu.js:1277`). */
export function Windows98() {
  const settings = useProfileSettings();
  const artist = usePlayerStoreSelector((state) => state.currentTrack.artist);
  const coverUrl = usePlayerStoreSelector(
    (state) => state.currentTrack.cover_url,
  );
  const isLiveStream = usePlayerStoreSelector(
    (state) => state.currentTrack.isLiveStream,
  );
  const trackProgress = usePlayerStoreSelector(
    (state) => state.currentTrack.progress,
  );
  const duration = usePlayerStoreSelector(
    (state) => state.currentTrack.duration,
  );
  const playbackState = usePlayerStoreSelector((state) => state.playbackState);
  const progress = usePlayerStoreSelector((state) => state.progress);
  const { colors } = useCoverColors();

  const thumbRef = useRef<HTMLDivElement>(null);
  const [thumbWidth, setThumbWidth] = useState(0);

  useEffect(() => {
    const element = thumbRef.current;
    if (!element) {
      return;
    }
    const measure = () => {
      if (thumbRef.current) {
        setThumbWidth(thumbRef.current.clientWidth);
      }
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const { canvasRef, buffer } = usePixelatedCover({
    imageUrl: coverUrl,
    dependencyKey: settings.cover,
  });

  if (!settings) {
    return null;
  }

  const hasCover = settings.cover !== Cover.NONE;
  const clampedProgress = Math.min(progress, 100);

  return (
    <Windows98Scale>
      <div className="h-full w-full bg-black">
        <style>{WINDOWS_98_SCOPE_CSS}</style>
        <div style={{ width: hasCover ? 300 : 220 }} className="window">
          <div
            className="title-bar h-[18px]"
            style={{
              background: `linear-gradient(90deg, ${
                settings.magic_colors ? colors.darkVibrant : '#000080'
              }, ${settings.magic_colors ? colors.vibrant : '#1084d0'})`,
            }}
          >
            <div className="flex items-center justify-center gap-1">
              <img
                src={WINDOWS_98_ICON}
                alt="Amuse icon"
                className="h-3 w-3"
                style={{ imageRendering: 'pixelated' }}
              />
              <div className="title-bar-text">Amuse</div>
            </div>
            <div className="title-bar-controls">
              <button aria-label="Minimize" />
              <button aria-label="Maximize" />
              <button aria-label="Close" />
            </div>
          </div>
          <div className="window-body flex gap-2">
            {hasCover && (
              <div className="sunken-panel aspect-square h-fit w-fit shrink-0">
                {buffer && (
                  <canvas
                    ref={canvasRef}
                    className="h-[80px] w-[80px] object-cover"
                    width={buffer.width}
                    height={buffer.height}
                  />
                )}
              </div>
            )}
            <div className="grid w-full shrink grid-cols-1 px-2 py-1.5 text-black">
              <div
                id="songinfo"
                className="relative w-full overflow-x-clip rounded"
              >
                <SkinTitle className="mt-0 text-[12px] text-black" />
                <p className="relative z-50 mb-1 overflow-clip text-ellipsis whitespace-nowrap text-[11px]">
                  <span>{artist}</span>
                </p>
                <div className="absolute -left-[50%] -top-[50%] h-[200%] w-[200%]" />
              </div>
              <div
                id="songtime"
                className="flex flex-col items-center justify-end gap-1"
              >
                <div className="flex w-full flex-col">
                  <div className="flex w-full items-center justify-between">
                    {isLiveStream ? (
                      <div className="flex items-center gap-2">
                        <LiveIndicator />
                        <p className="-mb-0.5 text-[0.6rem] font-bold">Live</p>
                      </div>
                    ) : (
                      <p className="flex w-16 justify-start text-[10px]">
                        {playbackState === PlaybackState.NOTHING_PLAYING
                          ? '00:00'
                          : msecToTime(trackProgress)}
                      </p>
                    )}
                    {!isLiveStream && (
                      <p className="flex w-16 justify-end text-[10px]">
                        {msecToTime(duration)}
                      </p>
                    )}
                  </div>
                </div>
                <div
                  id="playbar"
                  className={twMerge(
                    'sunken-panel relative h-fit w-full !overflow-visible',
                    settings.theme === Theme.DARK
                      ? 'bg-discord-dark'
                      : 'bg-light-discord-divider',
                  )}
                  style={
                    settings.magic_colors
                      ? { backgroundColor: colors.darkMuted }
                      : { backgroundColor: '#c0c0c0' }
                  }
                >
                  <div
                    id="active"
                    className="h-2 w-0 min-w-[7px]"
                    style={{
                      width: `${clampedProgress}%`,
                      backgroundColor: settings.magic_colors
                        ? colors.vibrant
                        : settings.tint_color,
                    }}
                  />
                  <div
                    className="relative -top-[13.1px] flex w-[100%]"
                    ref={thumbRef}
                  >
                    <div
                      className="window absolute h-[18px] w-[12px] bg-white ease-linear"
                      style={{
                        transform: `translateX(${Math.max(
                          -2,
                          thumbWidth * (clampedProgress / 100) - 6,
                        )}px)`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Windows98Scale>
  );
}
