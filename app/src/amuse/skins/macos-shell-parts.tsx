/**
 * Shared primitives for the macOS + Shell skin ports (Todo 22).
 *
 * These are the module-level helper components the original `zr` (macOS) and
 * `Tr` (Shell) skins consume from `PlayerWindows98-ChpRHqWu.js`. Each export
 * keeps the original's exact class strings / DOM hierarchy; the original symbol
 * is named in the JSDoc so the port can be diffed against the source.
 *
 * Source symbols (`PlayerWindows98-ChpRHqWu.js`):
 *   - `C`  class-name combinator (clsx)                     :1
 *   - `G`  player scale/padding wrapper                     :142
 *   - `ce` font frame (applies `fontClass`)                 :360
 *   - `ee` track title                                      :375
 *   - `de` track artist                                     :378
 *   - `Ce` elapsed time                                     :363
 *   - `ke` track duration                                   :366
 *   - `Z`  progress bar                                     :369
 *   - `X`  visualizer (small/large)                         :287
 *   - `U`  live indicator dot                               :300
 *   - `As` shell ASCII progress                             :445
 *   - `O()` `msecToTime` / `map` helpers                    :312
 *
 * NOTE: this module is intentionally named for the two skins it serves so the
 * concurrent sibling skin tasks (Todos 20/21/23/24) never collide with it.
 */

import { twMerge } from 'tailwind-merge';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { useCoverColors } from '../player/colors';
import { usePlayerStoreSelector } from '../player/context';
import { PlaybackState } from '../player/store';
import { useProfileSettings } from '../profile/context';
import {
  getArtistClassName,
  getFontClass,
  getSongTimeClassName,
  getTitleClassName,
} from '../fonts';
import { Theme } from '../types/user';

/** Original `C` — class-name combinator. */
export const cn = twMerge;

/** Original `xt` default (`lt(5)`) — player padding percent. */
export const PLAYER_PADDING_PERCENT = 5;

/**
 * Original `O().msecToTime` — `mm:ss` (with an unpadded `h:` prefix when the
 * track is at least an hour long).
 */
export function msecToTime(ms: number): string {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (60 * 1000)) % 60);
  const hours = Math.floor((ms / (3600 * 1000)) % 3600);
  const pad = (value: number): string =>
    value < 10 ? `0${value}` : value.toString();
  return `${hours > 0 ? `${hours}:` : ''}${pad(minutes)}:${pad(seconds)}`;
}

/** Original `O().map` — linear range mapping. */
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}

/** Original `xs` — true when the ref's content overflows horizontally. */
export function useHasOverflow<T extends HTMLElement>(
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

export interface PlayerScaleProps {
  children: ReactNode;
  /** Test hook matching the wrapper dispatch test (`amuse-skin`). */
  testId?: string;
  /** Test hook for the active skin id. */
  skin?: string;
}

/**
 * Original `G` — pads the player by {@link PLAYER_PADDING_PERCENT} and scales
 * the content down to fit. Measurement is guarded so jsdom (zero-sized layout)
 * keeps the deterministic initial `scale(1)`.
 */
export function PlayerScale({ children, testId, skin }: PlayerScaleProps) {
  const [scale, setScale] = useState(1);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const measure = () => {
      const element = ref.current;
      const parent = element?.parentElement;
      if (!element || !parent) {
        return;
      }
      const paddingX = (parent.clientWidth * PLAYER_PADDING_PERCENT) / 100;
      const paddingY = (parent.clientHeight * PLAYER_PADDING_PERCENT) / 100;
      const availableWidth = parent.clientWidth - paddingX * 2;
      const availableHeight = parent.clientHeight - paddingY * 2;
      if (!element.clientWidth || !element.clientHeight) {
        return;
      }
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
      data-testid={testId}
      data-skin={skin}
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

export interface SkinFontFrameProps {
  className?: string;
  children: ReactNode;
  customFontEnabled?: boolean;
}

/** Original `ce` — frame that applies the selected font's `fontClass`. */
export function SkinFontFrame({
  className,
  children,
  customFontEnabled = false,
}: SkinFontFrameProps) {
  const settings = useProfileSettings();
  const fontClass = customFontEnabled ? getFontClass(settings.font) : undefined;
  return <div className={cn(className, fontClass)}>{children}</div>;
}

/** Original `ee` — track title. */
export function TrackTitle({ className }: { className?: string }) {
  const title = usePlayerStoreSelector((state) => state.currentTrack.title);
  const settings = useProfileSettings();
  const ref = useRef<HTMLParagraphElement>(null);
  const spanRef = useRef<HTMLSpanElement>(null);
  const hasOverflow = useHasOverflow(title, ref);

  return (
    <p
      ref={ref}
      className={cn(
        'relative z-50 overflow-clip whitespace-nowrap',
        getTitleClassName(settings.font),
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

/** Original `de` — track artist. */
export function TrackArtist({ className }: { className?: string }) {
  const artist = usePlayerStoreSelector((state) => state.currentTrack.artist);
  const settings = useProfileSettings();

  return (
    <p
      className={cn(
        'relative z-50 mb-1 overflow-clip text-ellipsis whitespace-nowrap',
        getArtistClassName(settings.font),
        settings.cover_blur &&
          settings.skin !== 'macos' &&
          settings.skin !== 'shell' &&
          settings.skin !== 'discord' &&
          'text-white',
        className,
      )}
    >
      {artist}
    </p>
  );
}

/** Original `Ce` — elapsed time. */
export function ElapsedTime({ className }: { className?: string }) {
  const progress = usePlayerStoreSelector(
    (state) => state.currentTrack.progress,
  );
  const settings = useProfileSettings();

  return (
    <p className={cn(getSongTimeClassName(settings.font), className)}>
      {msecToTime(progress)}
    </p>
  );
}

/** Original `ke` — track duration. */
export function DurationTime({ className }: { className?: string }) {
  const duration = usePlayerStoreSelector(
    (state) => state.currentTrack.duration,
  );
  const settings = useProfileSettings();

  return (
    <p className={cn(getSongTimeClassName(settings.font), className)}>
      {msecToTime(duration)}
    </p>
  );
}

/** Original `Z`'s `n` map — per-skin playbar contrast class. */
const PROGRESS_BAR_SKIN_CLASS: Record<string, { dark: string; light: string }> =
  {
    macos: { dark: 'bg-white', light: 'bg-spotify-black' },
    boxy: { dark: 'bg-white', light: 'bg-spotify-black' },
    gallery: { dark: 'bg-white', light: 'bg-spotify-black' },
    compact: { dark: 'bg-spotify-black', light: 'bg-white' },
    minimal: { dark: 'bg-white', light: 'bg-spotify-black' },
  };

/** Original `Z` — playbar with magic-colours tint. */
export function ProgressBar({ className }: { className?: string }) {
  const progress = usePlayerStoreSelector((state) => state.progress);
  const settings = useProfileSettings();
  const { colors } = useCoverColors();
  const isDark = settings.theme === Theme.DARK;
  const skinClass =
    PROGRESS_BAR_SKIN_CLASS[settings.skin]?.[isDark ? 'dark' : 'light'];

  return (
    <div
      id="playbar"
      className={cn(
        'bottom-0 z-50 h-2 w-full rounded-full transition-all duration-300',
        isDark ? 'bg-spotify-black' : 'bg-white',
        skinClass,
        className,
      )}
      style={
        settings.magic_colors
          ? { backgroundColor: colors.darkVibrant }
          : undefined
      }
    >
      <div
        id="active"
        className="h-full w-0 min-w-[9px] rounded-full transition-all duration-1000 ease-linear"
        style={{
          width: `${Math.min(progress, 100)}%`,
          backgroundColor: settings.magic_colors
            ? colors.vibrant
            : settings.tint_color,
          transition: 'width 1s, background-color 0.3s',
        }}
      />
    </div>
  );
}

/** Original `yt` — one visualizer bar. */
const VisualizerBar = memo(function VisualizerBar({
  multiplicator,
  color,
}: {
  multiplicator: number;
  color: string;
}) {
  const scale = useMemo(() => 0.5 * multiplicator * 3, [multiplicator]);
  const style = useMemo(
    () => ({
      backgroundColor: color,
      transition: 'transform 1s, background-color 0.3s',
    }),
    [color],
  );

  return (
    <div className="flex flex-col items-center justify-center">
      <div
        className="h-1 w-1 rounded-tl-full rounded-tr-full"
        style={{
          ...style,
          transform: `translateY(calc(-${scale * 50}% + 3px))`,
        }}
      />
      <div
        className="h-1 w-1"
        style={{ ...style, transform: `scale(1, ${scale})` }}
      />
      <div
        className="h-1 w-1 rounded-bl-full rounded-br-full"
        style={{
          ...style,
          transform: `translateY(calc(${scale * 50}% - 3px))`,
        }}
      />
    </div>
  );
});

/** Original `X` — animated visualizer bars. */
const VISUALIZER_LARGE = [
  0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.5, 1.4, 1.3, 1.2, 1.1, 1,
  0.9, 0.8, 0.7,
];
const VISUALIZER_SMALL = [0.7, 1, 1.2, 1, 0.7];

export function Visualizer({ size }: { size?: 'small' | 'large' }) {
  const playbackState = usePlayerStoreSelector((state) => state.playbackState);
  const isPlaying = usePlayerStoreSelector(
    (state) => state.currentTrack.is_playing,
  );
  const settings = useProfileSettings();
  const { colors } = useCoverColors();
  const active =
    playbackState === PlaybackState.NOTHING_PLAYING ? false : isPlaying;
  const color = settings.magic_colors ? colors.vibrant : settings.tint_color;
  const pattern = useMemo(
    () => (size === 'large' ? VISUALIZER_LARGE : VISUALIZER_SMALL),
    [size],
  );
  const [bars, setBars] = useState(pattern);

  const update = useCallback(() => {
    setBars(
      active
        ? pattern.map((value) => value * Math.random() * 2)
        : Array(size === 'large' ? 19 : 5).fill(0.3),
    );
  }, [active, pattern, size]);

  useEffect(() => {
    const id = setInterval(update, 700);
    return () => clearInterval(id);
  }, [update]);

  return (
    <div
      className="flex items-center transition-all duration-500"
      style={{ opacity: settings.hide_visualizer ? '0%' : '100%' }}
    >
      <div className="flex w-fit items-center gap-1 px-2">
        {bars.map((multiplicator, index) => (
          <VisualizerBar
            key={index}
            multiplicator={multiplicator}
            color={color ?? 'gray'}
          />
        ))}
      </div>
    </div>
  );
}

/** Original `U` — live indicator dot. */
export function LiveDot({ className }: { className?: string }) {
  const isPlaying = usePlayerStoreSelector(
    (state) => state.currentTrack.is_playing,
  );

  return (
    <div className={cn('relative', className)}>
      <div
        className={cn(
          'h-2 w-2 rounded-full bg-gray-500',
          isPlaying && 'bg-red-600',
        )}
      />
      <div className="absolute inset-0">
        <div
          className={cn(
            'h-2 w-2 animate-ping rounded-full bg-red-600 opacity-0',
            isPlaying && 'opacity-100',
          )}
        />
      </div>
    </div>
  );
}

/** Original `As` — 34-cell ASCII progress bar used by the Shell skin. */
const SHELL_PROGRESS_WIDTH = 34;
const SHELL_PROGRESS_EMPTY = '---------------------------------';

export function ShellProgress() {
  const settings = useProfileSettings();
  const isLiveStream = usePlayerStoreSelector(
    (state) => state.currentTrack.isLiveStream,
  );
  const progress = usePlayerStoreSelector(
    (state) => state.currentTrack.progress,
  );
  const duration = usePlayerStoreSelector(
    (state) => state.currentTrack.duration,
  );
  const { colors } = useCoverColors();

  const raw = isLiveStream
    ? SHELL_PROGRESS_WIDTH
    : Math.ceil(mapRange(progress, 0, duration, 0, SHELL_PROGRESS_WIDTH));
  const filled = Math.min(Math.max(0, raw), SHELL_PROGRESS_WIDTH);
  const empty = SHELL_PROGRESS_WIDTH - filled;
  const color = settings.magic_colors ? colors.vibrant : settings.tint_color;

  return (
    <p style={{ hyphens: 'auto' }}>
      <span className="transition-[color] duration-300">[</span>
      <span className="transition-[color] duration-300" style={{ color }}>
        {raw
          ? Array(filled)
              .fill('#')
              .map((char, index) => <span key={index}>{char}</span>)
          : '#'}
      </span>
      <span className="transition-[color] duration-300">
        {raw
          ? Array(empty)
              .fill('-')
              .map((char, index) => <span key={index}>{char}</span>)
          : SHELL_PROGRESS_EMPTY}
      </span>
      <span className="transition-[color] duration-300">]</span>
    </p>
  );
}
