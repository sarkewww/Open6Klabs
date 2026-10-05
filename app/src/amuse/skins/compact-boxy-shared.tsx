/**
 * Shared sub-components for the Compact (`Nr`) and Boxy (`Vr`) skins.
 *
 * Faithful port of the module-level helpers the original `PlayerWindows98-*`
 * bundle composes every skin from (beautified copy at
 * `app/_reference/PlayerWindows98-ChpRHqWu.js`):
 *
 *   - `G`  PlayerView wrapper (padding + auto-scale) ...:142-164 -> PlayerViewWrapper
 *   - `ce` custom-font wrapper ........................:360-362 -> FontWrapper
 *   - `ee` title (marquee on overflow) ................:375-377 -> Title
 *   - `de` artist .....................................:378-380 -> Artist
 *   - `_e` blurred cover background ...................:381-383 -> CoverBlur
 *   - `q`  magic-colours surface ......................:372-374 -> Surface
 *   - `rt` plain div ..................................:375     -> PlainDiv
 *   - `Z`  progress playbar ...........................:369-371 -> Playbar
 *   - `Ce` progress time ..............................:363-365 -> ProgressTime
 *   - `ke` duration time ..............................:366-368 -> DurationTime
 *   - `U`  live indicator dot .........................:300-303 -> LiveIndicator
 *   - `X`  visualizer (+ `yt` bar) ....................:282-296 -> Visualizer/VisualizerBar
 *   - `O`  `{ msecToTime, useHasOverflow }` ...........:308-355 -> msecToTime/useHasOverflow
 *
 * Class names, text, inline styles and DOM hierarchy are copied verbatim.
 *
 * The ONLY additions are stable `data-*` test hooks carried over from the skin
 * STUB contract (`SkinFrame`): `data-testid="amuse-skin"` + `data-skin` on the
 * PlayerView root, `data-testid="amuse-cover-blur"` + `data-cover-blur`,
 * `data-testid="amuse-visualizer"` + `data-hide-visualizer`, and
 * `data-testid="amuse-skin-surface"` + `data-magic-colors` on the first surface.
 * They do not alter class names, hierarchy, text or layout.
 */

import { twMerge } from 'tailwind-merge';
import { atom, useAtomValue } from 'jotai';
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
import {
  getArtistClassName,
  getFontClass,
  getSongTimeClassName,
  getTitleClassName,
} from '../fonts';
import { useProfileSettings } from '../profile/context';
import { Theme } from '../types/user';

/* -------------------------------------------------------------------------- */
/* Original `O()` utils — `msecToTime` + `useHasOverflow`                      */
/* -------------------------------------------------------------------------- */

/** Original `e` in `O()` (`PlayerWindows98-ChpRHqWu.js:313-315`). */
export function msecToTime(p: number): string {
  const seconds = Math.floor((p / 1e3) % 60);
  const minutes = Math.floor((p / (60 * 1e3)) % 60);
  const hours = Math.floor((p / (3600 * 1e3)) % 3600);
  const pad = (value: number) => (value < 10 ? `0${value}` : value.toString());
  return `${hours > 0 ? `${hours}:` : ''}${pad(minutes)}:${pad(seconds)}`;
}

/** Original `xs` (`PlayerWindows98-ChpRHqWu.js:307-311`). */
export function useHasOverflow<T extends HTMLElement>(
  text: string,
  ref: RefObject<T | null>,
): boolean {
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    if (ref.current) {
      setOverflow(ref.current.scrollWidth > ref.current.clientWidth);
    }
  }, [text, ref]);
  return overflow;
}

/* -------------------------------------------------------------------------- */
/* Original `G` — PlayerView wrapper                                           */
/* -------------------------------------------------------------------------- */

/** Original `xt` / `playerPaddingPercentAtom` (`PlayerWindows98:140`). */
const playerPaddingPercentAtom = atom(5);

export interface PlayerViewWrapperProps {
  children: ReactNode;
  /** Runtime skin id, exposed as `data-skin` on the root (test hook). */
  skin?: string;
}

/**
 * Original `G` (`PlayerWindows98-ChpRHqWu.js:142-164`). Measures the parent and
 * scales its content so the `padding%` gutter is respected. The `NaN` guard
 * (`Number.isFinite`) only exists so jsdom — where every box is 0×0 — keeps
 * `transform: scale(1)` instead of `scale(NaN)`; real browsers take the exact
 * original branch.
 */
export function PlayerViewWrapper({ children, skin }: PlayerViewWrapperProps) {
  const padding = useAtomValue(playerPaddingPercentAtom);
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const compute = useCallback(() => {
    if (ref.current) {
      const parent = ref.current.parentElement;
      if (parent) {
        const padW = (parent.clientWidth * padding) / 100;
        const padH = (parent.clientHeight * padding) / 100;
        const innerW = parent.clientWidth - padW * 2;
        const innerH = parent.clientHeight - padH * 2;
        const next = Math.min(
          innerW / ref.current.clientWidth,
          innerH / ref.current.clientHeight,
        );
        setScale(Number.isFinite(next) ? next : 1);
      }
    }
  }, [padding]);

  useEffect(() => {
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [compute]);

  const settings = useProfileSettings();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (settings.skin === 'discord') {
      timer = setTimeout(compute, 300);
    } else {
      compute();
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [settings, compute]);

  if (!settings) {
    return (
      <div className="relative flex h-full w-full items-center justify-center" />
    );
  }
  return (
    <div
      data-testid="amuse-skin"
      data-skin={skin}
      className="relative flex h-full w-full select-none items-center justify-center"
      style={{ padding: `${padding}%` }}
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
/* Original `ce` — custom-font wrapper                                         */
/* -------------------------------------------------------------------------- */

export interface FontWrapperProps {
  className?: string;
  children: ReactNode;
  customFontEnabled?: boolean;
}

/** Original `ce` (`PlayerWindows98-ChpRHqWu.js:360-362`). */
export function FontWrapper({
  className,
  children,
  customFontEnabled = false,
}: FontWrapperProps) {
  const settings = useProfileSettings();
  if (!settings) {
    return null;
  }
  return (
    <div
      className={twMerge(
        className,
        customFontEnabled && getFontClass(settings.font),
      )}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Original `ee` / `de` — title / artist                                       */
/* -------------------------------------------------------------------------- */

export interface SkinTextProps {
  className?: string;
}

/** Original `ee` (`PlayerWindows98-ChpRHqWu.js:375-377`). */
export function Title({ className }: SkinTextProps) {
  const title = usePlayerStoreSelector((state) => state.currentTrack.title);
  const settings = useProfileSettings();
  const ref = useRef<HTMLParagraphElement>(null);
  const spanRef = useRef<HTMLSpanElement>(null);
  const hasOverflow = useHasOverflow(title, ref);
  if (!settings) {
    return null;
  }
  const blurWhite =
    settings.cover_blur &&
    settings.skin !== 'macos' &&
    settings.skin !== 'shell' &&
    settings.skin !== 'discord';
  return (
    <p
      ref={ref}
      className={twMerge(
        'relative z-50 overflow-clip whitespace-nowrap',
        getTitleClassName(settings.font),
        hasOverflow && 'animated-title',
        blurWhite && 'text-white',
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

/** Original `de` (`PlayerWindows98-ChpRHqWu.js:378-380`). */
export function Artist({ className }: SkinTextProps) {
  const artist = usePlayerStoreSelector((state) => state.currentTrack.artist);
  const settings = useProfileSettings();
  if (!settings) {
    return null;
  }
  const blurWhite =
    settings.cover_blur &&
    settings.skin !== 'macos' &&
    settings.skin !== 'shell' &&
    settings.skin !== 'discord';
  return (
    <p
      className={twMerge(
        'relative z-50 mb-1 overflow-clip text-ellipsis whitespace-nowrap',
        getArtistClassName(settings.font),
        blurWhite && 'text-white',
        className,
      )}
    >
      {artist}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* Original `_e` — blurred cover background                                    */
/* -------------------------------------------------------------------------- */

/** Original `_e` (`PlayerWindows98-ChpRHqWu.js:381-383`). */
export function CoverBlur({ className }: SkinTextProps) {
  const coverUrl = usePlayerStoreSelector(
    (state) => state.currentTrack.cover_url,
  );
  const settings = useProfileSettings();
  if (!settings) {
    return null;
  }
  return (
    <div
      data-testid="amuse-cover-blur"
      data-cover-blur={String(settings.cover_blur)}
      className={twMerge(
        'absolute -left-[50%] -top-[50%] h-[200%] w-[200%] transition-all duration-300',
        className,
      )}
      style={{
        backgroundImage: `url(${coverUrl})`,
        backgroundPosition: 'center',
        filter: settings.magic_colors
          ? 'blur(15px) brightness(80%) saturate(120%)'
          : settings.theme === Theme.DARK
            ? 'blur(15px) brightness(35%)'
            : 'blur(15px) brightness(80%) saturate(120%)',
        opacity: settings.cover_blur ? '100%' : '0%',
      }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Original `q` — magic-colours surface                                        */
/* -------------------------------------------------------------------------- */

export interface SurfaceProps {
  className?: string;
  children: ReactNode;
  /** Test hook — only the first surface per skin carries it. */
  testId?: string;
}

/** Original `q` (`PlayerWindows98-ChpRHqWu.js:372-374`). */
export function Surface({ className, children, testId }: SurfaceProps) {
  const settings = useProfileSettings();
  const { colors } = useCoverColors();
  if (!settings) {
    return null;
  }
  return (
    <div
      data-testid={testId}
      data-magic-colors={String(settings.magic_colors)}
      className={twMerge(
        'relative z-50 h-full transform-gpu overflow-clip rounded-lg transition-all duration-300',
        settings.theme === Theme.DARK && 'bg-spotify-black text-white',
        settings.theme === Theme.LIGHT && 'bg-white text-black',
        className,
      )}
      style={
        settings.magic_colors
          ? { backgroundColor: colors.darkMuted, color: colors.lightVibrant }
          : {}
      }
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Original `rt` — plain div                                                   */
/* -------------------------------------------------------------------------- */

/** Original `rt` (`PlayerWindows98-ChpRHqWu.js:375`). */
export function PlainDiv({ className, children }: SurfaceProps) {
  return <div className={twMerge(className)}>{children}</div>;
}

/* -------------------------------------------------------------------------- */
/* Original `Z` — progress playbar                                             */
/* -------------------------------------------------------------------------- */

/** Original per-skin playbar background map (inside `Z`). */
function playbarSkinBackground(
  skin: string,
  dark: boolean,
): string | undefined {
  switch (skin) {
    case 'macos':
    case 'boxy':
    case 'gallery':
    case 'minimal':
      return dark ? 'bg-white' : 'bg-spotify-black';
    case 'compact':
      return dark ? 'bg-spotify-black' : 'bg-white';
    default:
      return undefined;
  }
}

/** Original `Z` (`PlayerWindows98-ChpRHqWu.js:369-371`). */
export function Playbar({ className }: SkinTextProps) {
  const progress = usePlayerStoreSelector((state) => state.progress);
  const settings = useProfileSettings();
  const { colors } = useCoverColors();
  if (!settings) {
    return null;
  }
  const dark = settings.theme === Theme.DARK;
  return (
    <div
      id="playbar"
      className={twMerge(
        'bottom-0 z-50 h-2 w-full rounded-full transition-all duration-300',
        dark ? 'bg-spotify-black' : 'bg-white',
        playbarSkinBackground(settings.skin, dark),
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

/* -------------------------------------------------------------------------- */
/* Original `Ce` / `ke` — progress / duration time                             */
/* -------------------------------------------------------------------------- */

/** Original `Ce` (`PlayerWindows98-ChpRHqWu.js:363-365`). */
export function ProgressTime({ className }: SkinTextProps) {
  const progress = usePlayerStoreSelector(
    (state) => state.currentTrack.progress,
  );
  const settings = useProfileSettings();
  if (!settings) {
    return null;
  }
  return (
    <p className={twMerge(getSongTimeClassName(settings.font), className)}>
      {msecToTime(progress)}
    </p>
  );
}

/** Original `ke` (`PlayerWindows98-ChpRHqWu.js:366-368`). */
export function DurationTime({ className }: SkinTextProps) {
  const duration = usePlayerStoreSelector(
    (state) => state.currentTrack.duration,
  );
  const settings = useProfileSettings();
  if (!settings) {
    return null;
  }
  return (
    <p className={twMerge(getSongTimeClassName(settings.font), className)}>
      {msecToTime(duration)}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* Original `U` — live indicator                                               */
/* -------------------------------------------------------------------------- */

/** Original `U` (`PlayerWindows98-ChpRHqWu.js:300-303`). */
export function LiveIndicator({ className }: SkinTextProps) {
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
/* Original `X` (+ `yt`) — visualizer                                          */
/* -------------------------------------------------------------------------- */

interface VisualizerBarProps {
  multiplicator: number;
  color: string;
}

/** Original `yt` (`PlayerWindows98-ChpRHqWu.js:282-286`). */
const VisualizerBar = memo(
  function VisualizerBar({ multiplicator, color }: VisualizerBarProps) {
    const s = 0.5 * multiplicator * 3;
    const style = {
      backgroundColor: color ?? 'gray',
      transition: 'transform 1s, background-color 0.3s',
    };
    return (
      <div className="flex flex-col items-center justify-center">
        <div
          className="h-1 w-1 rounded-tl-full rounded-tr-full"
          style={{ ...style, transform: `translateY(calc(-${s * 50}% + 3px))` }}
        />
        <div
          className="h-1 w-1"
          style={{ ...style, transform: `scale(1, ${s})` }}
        />
        <div
          className="h-1 w-1 rounded-bl-full rounded-br-full"
          style={{ ...style, transform: `translateY(calc(${s * 50}% - 3px))` }}
        />
      </div>
    );
  },
  (prev, next) =>
    prev.color === next.color &&
    Math.abs(prev.multiplicator - next.multiplicator) < 0.1,
);
VisualizerBar.displayName = 'VisualizerBar';

/** Original base multiplicators (`i` in `X`). */
const VISUALIZER_BASE = {
  large: [
    0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.5, 1.4, 1.3, 1.2, 1.1, 1,
    0.9, 0.8, 0.7,
  ],
  small: [0.7, 1, 1.2, 1, 0.7],
} as const;

export interface VisualizerProps {
  size: 'large' | 'small';
}

/** Original `X` (`PlayerWindows98-ChpRHqWu.js:287-296`). */
export function Visualizer({ size }: VisualizerProps) {
  const playbackState = usePlayerStoreSelector((state) => state.playbackState);
  const isPlaying = usePlayerStoreSelector(
    (state) => state.currentTrack.is_playing,
  );
  const settings = useProfileSettings();
  const { colors } = useCoverColors();
  const active =
    playbackState === PlaybackState.NOTHING_PLAYING ? false : isPlaying;
  const color = settings.magic_colors ? colors.vibrant : settings.tint_color;
  const base = useMemo(
    () => (size === 'large' ? VISUALIZER_BASE.large : VISUALIZER_BASE.small),
    [size],
  );
  const [bars, setBars] = useState<readonly number[]>(base);
  const update = useCallback(() => {
    setBars(
      active
        ? base.map((value) => value * Math.random() * 2)
        : Array(size === 'large' ? 19 : 5).fill(0.3),
    );
  }, [active, base, size]);
  useEffect(() => {
    const timer = setInterval(update, 700);
    return () => clearInterval(timer);
  }, [update]);
  if (!settings) {
    return null;
  }
  return (
    <div
      data-testid="amuse-visualizer"
      data-hide-visualizer={String(settings.hide_visualizer)}
      className="flex items-center transition-all duration-500"
      style={{ opacity: settings.hide_visualizer ? '0%' : '100%' }}
    >
      <div className="flex w-fit items-center gap-1 px-2">
        {bars.map((value, index) => (
          <VisualizerBar
            multiplicator={value}
            color={color ?? 'gray'}
            key={index}
          />
        ))}
      </div>
    </div>
  );
}
