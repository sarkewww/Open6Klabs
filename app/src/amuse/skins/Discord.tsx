/**
 * Discord skin — `settings.skin === "discord"`.
 *
 * Faithful port of `Mr` (export `f`) from the original player bundle
 * (`app/_reference/PlayerWindows98-ChpRHqWu.js:410-420`, byte-checked against
 * the minified `widget/assets/PlayerWindows98-ChpRHqWu.js` @31312).
 *
 * The original composes the skin from module-level helpers of the same bundle.
 * Those helpers are inlined here (the skin tasks stay self-contained — no shared
 * primitives module is owned by this task):
 *
 *   - `G`  PlayerView wrapper (padding + auto-scale) ...:142-164 -> PlayerViewWrapper
 *   - `O`  `{ msecToTime, useHasOverflow }` ...........:308-355 -> msecToTime/useHasOverflow
 *   - `U`  live indicator dot .........................:300-303 -> LiveIndicator
 *   - `X`  visualizer (+ `yt` bar) ....................:282-296 -> Visualizer/VisualizerBar
 *   - `ws` Discord wordmark inline SVG ................:406     -> DiscordWordmark
 *
 * Class names, text, inline styles, DOM hierarchy and the inline wordmark SVG
 * paths are copied verbatim. The membership/display branches are preserved:
 *   - theme branch: DARK -> `bg-discord-dark` / LIGHT -> `bg-light-discord-dark`
 *   - cover branch: `settings.cover !== Cover.NONE` -> `w-[420px]` + cover block,
 *     otherwise `w-[320px]` and no cover node.
 *
 * The ONLY additions are the stable `data-*` hooks carried over from the skin
 * STUB contract (`SkinFrame`): `data-testid="amuse-skin"` + `data-skin` on the
 * PlayerView root, `data-testid="amuse-cover-blur"` + `data-cover-blur`, and
 * `data-testid="amuse-visualizer"` + `data-hide-visualizer`. They do not alter
 * class names, hierarchy, text or layout.
 */

import { clsx } from 'clsx';
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
import { CoverView } from '../covers';
import { useCoverColors } from '../player/colors';
import { usePlayerStoreSelector } from '../player/context';
import { PlaybackState } from '../player/store';
import { useProfileSettings } from '../profile/context';
import { getCurrentFont } from '../settings/registry';
import { Cover, Theme } from '../types/user';

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
 * original branch. The Discord-specific 300 ms recompute is preserved.
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
/* Original `U` — live indicator                                               */
/* -------------------------------------------------------------------------- */

/** Original `U` (`PlayerWindows98-ChpRHqWu.js:300-303`). */
export function LiveIndicator() {
  const isPlaying = usePlayerStoreSelector(
    (state) => state.currentTrack.is_playing,
  );
  return (
    <div className="relative">
      <div
        className={clsx(
          'h-2 w-2 rounded-full bg-gray-500',
          isPlaying && 'bg-red-600',
        )}
      />
      <div className="absolute inset-0">
        <div
          className={clsx(
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

/* -------------------------------------------------------------------------- */
/* Original `ws` — Discord wordmark (inline SVG)                               */
/* -------------------------------------------------------------------------- */

export interface DiscordWordmarkProps {
  className?: string;
  fill?: string;
}

/** Original `ws` (`PlayerWindows98-ChpRHqWu.js:406`). */
export function DiscordWordmark({ className, fill }: DiscordWordmarkProps) {
  return (
    <svg
      id="Isolation_Mode"
      data-name="Isolation Mode"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 337.82 53.38"
      className={className}
      fill={fill}
    >
      <path
        className="cls-1"
        d="m0,2.95h27.3c6.58,0,12.15,1.03,16.7,3.08,4.19,1.76,7.75,4.75,10.21,8.58,2.3,3.78,3.48,8.14,3.4,12.56.05,4.44-1.17,8.81-3.53,12.58-2.63,3.98-6.38,7.09-10.79,8.92-4.83,2.2-10.81,3.3-17.95,3.29H0V2.95Zm25.06,36.54c4.43,0,7.84-1.11,10.22-3.32,2.44-2.37,3.74-5.67,3.57-9.07.15-3.15-1-6.22-3.18-8.5-2.13-2.12-5.34-3.18-9.63-3.19h-8.54v24.08h7.56Z"
      />
      <path
        className="cls-1"
        d="m98.49,51.88c-3.6-.9-7.05-2.34-10.22-4.27v-11.62c2.77,2.01,5.89,3.5,9.2,4.38,3.62,1.1,7.38,1.68,11.17,1.71,1.31.07,2.61-.16,3.82-.66.86-.44,1.29-1,1.29-1.58.02-.66-.23-1.29-.7-1.75-.8-.61-1.74-1.02-2.73-1.19l-8.4-1.89c-4.81-1.12-8.23-2.67-10.25-4.65-2.05-2.07-3.14-4.9-3-7.81-.03-2.61.92-5.13,2.66-7.07,2.07-2.19,4.68-3.79,7.56-4.65,3.71-1.17,7.59-1.72,11.48-1.65,3.63-.03,7.25.39,10.78,1.26,2.85.67,5.58,1.76,8.12,3.22v11c-2.38-1.38-4.94-2.43-7.6-3.11-2.89-.77-5.86-1.16-8.85-1.16-4.39,0-6.58.75-6.58,2.24-.01.68.38,1.3,1,1.58,1.2.51,2.45.87,3.74,1.08l7,1.26c4.55.8,7.94,2.2,10.17,4.2s3.35,4.93,3.36,8.78c.07,4.12-2.05,7.98-5.57,10.12-3.69,2.47-8.95,3.71-15.79,3.7-3.93,0-7.85-.49-11.66-1.47Z"
      />
      <path
        className="cls-1"
        d="m148.05,50.41c-3.74-1.72-6.9-4.5-9.07-8-2.03-3.43-3.07-7.36-3-11.34-.06-3.98,1.03-7.9,3.15-11.27,2.26-3.44,5.47-6.15,9.24-7.8,4.59-2,9.56-2.97,14.56-2.84,7,0,12.81,1.47,17.43,4.41v12.83c-1.76-1.18-3.68-2.1-5.7-2.73-2.26-.71-4.63-1.07-7-1.05-4.34,0-7.74.79-10.19,2.38-3.45,1.92-4.68,6.28-2.76,9.73.63,1.12,1.55,2.06,2.66,2.7,2.38,1.61,5.83,2.41,10.36,2.41,2.34,0,4.66-.33,6.9-1,2.04-.59,4-1.42,5.84-2.49v12.4c-5.41,3.15-11.59,4.75-17.85,4.62-5.02.14-10-.88-14.57-2.96Z"
      />
      <path
        className="cls-1"
        d="m197.79,50.41c-3.78-1.73-6.99-4.5-9.25-8-2.13-3.42-3.23-7.38-3.18-11.41-.07-3.98,1.04-7.89,3.18-11.25,2.27-3.41,5.46-6.09,9.21-7.74,9.2-3.73,19.5-3.73,28.7,0,3.73,1.63,6.91,4.31,9.17,7.7,2.13,3.37,3.22,7.29,3.15,11.27.05,4.02-1.04,7.98-3.15,11.41-2.23,3.5-5.43,6.28-9.2,8-9.14,3.92-19.49,3.92-28.63,0v.02Zm21.27-12.42c1.75-1.8,2.67-4.25,2.56-6.76.12-2.49-.81-4.91-2.56-6.68-1.9-1.74-4.43-2.64-7-2.49-2.57-.14-5.09.76-7,2.49-1.75,1.77-2.67,4.19-2.55,6.68-.11,2.51.81,4.95,2.55,6.76,1.89,1.76,4.42,2.69,7,2.55,2.58.15,5.12-.77,7-2.55Z"
      />
      <path
        className="cls-1"
        d="m280.84,11.75v15.14c-2.09-1.25-4.5-1.86-6.93-1.75-3.73,0-6.61,1.14-8.61,3.4s-3,5.77-3,10.53v12.88h-17.15V11h16.8v13c.93-4.76,2.44-8.27,4.52-10.53,2.04-2.25,4.96-3.49,8-3.4,2.24-.06,4.45.52,6.37,1.68Z"
      />
      <path
        className="cls-1"
        d="m337.82,1.55v50.4h-17.15v-9.2c-1.29,3.28-3.62,6.04-6.62,7.88-3.32,1.89-7.09,2.83-10.9,2.72-3.59.08-7.12-.9-10.15-2.83-2.93-1.9-5.27-4.6-6.74-7.77-1.61-3.5-2.41-7.32-2.34-11.17-.11-3.99.74-7.96,2.48-11.55,1.6-3.29,4.1-6.07,7.21-8,3.2-1.94,6.87-2.93,10.61-2.87,8.16,0,13.64,3.55,16.45,10.64V1.55h17.15Zm-19.67,36.2c1.77-1.74,2.72-4.14,2.63-6.62.08-2.4-.88-4.73-2.63-6.38-4.04-3.29-9.85-3.29-13.89,0-1.74,1.69-2.68,4.04-2.59,6.47-.09,2.45.86,4.82,2.62,6.53,1.86,1.73,4.33,2.63,6.86,2.51,2.58.14,5.1-.76,7-2.51Z"
      />
      <ellipse className="cls-1" cx={72.07} cy={7.68} rx={8.55} ry={7.68} />
      <path
        className="cls-1"
        d="m63.51,20.65c5.47,2.3,11.64,2.3,17.11,0v31.52h-17.11v-31.52Z"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Original `Mr` — the Discord skin                                            */
/* -------------------------------------------------------------------------- */

export function Discord() {
  const settings = useProfileSettings();
  const title = usePlayerStoreSelector((state) => state.currentTrack.title);
  const artist = usePlayerStoreSelector((state) => state.currentTrack.artist);
  const isLiveStream = usePlayerStoreSelector(
    (state) => state.currentTrack.isLiveStream,
  );
  const progressMs = usePlayerStoreSelector(
    (state) => state.currentTrack.progress,
  );
  const durationMs = usePlayerStoreSelector(
    (state) => state.currentTrack.duration,
  );
  const progressPercent = usePlayerStoreSelector((state) => state.progress);
  const playbackState = usePlayerStoreSelector((state) => state.playbackState);
  const { colors } = useCoverColors();
  const titleRef = useRef<HTMLParagraphElement>(null);
  const spanRef = useRef<HTMLSpanElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const hasOverflow = useHasOverflow(title, titleRef);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const font = getCurrentFont(settings.font);
  const dark = settings.theme === Theme.DARK;
  const hasCover = settings.cover !== Cover.NONE;
  const clampedPercent = Math.min(progressPercent, 100);

  return (
    <PlayerViewWrapper skin="discord">
      <div
        className={clsx(
          'transition-[width, background-color,outline] flex flex-col overflow-hidden rounded-2xl duration-300',
          font.fontClass,
          dark
            ? 'bg-discord-dark outline-osx-top-bg text-white outline outline-2'
            : 'bg-light-discord-dark text-light-discord-text-main outline-osx-top-bg-light outline outline-2',
          hasCover ? 'w-[420px]' : 'w-[320px]',
        )}
        style={{
          color: settings.magic_colors
            ? dark
              ? colors.lightVibrant
              : colors.darkVibrant
            : '',
          outlineOffset: '-2px',
        }}
      >
        {/* header — Discord wordmark + visualizer */}
        <div
          className={clsx(
            'flex h-10 w-full items-center justify-between p-3 pl-6',
            dark ? 'bg-discord-dark border-b-gray-800' : 'border-b-gray-300',
          )}
        >
          <DiscordWordmark
            className="h-[15px] w-fit"
            fill={dark ? '#949ba4' : '#5c5e66'}
          />
          <Visualizer size="small" />
        </div>

        {/* body */}
        <div className="flex items-end">
          {hasCover && (
            <div className="relative flex flex-col">
              <div className="relative h-[90px] px-5 transition duration-1000">
                <CoverView />
              </div>
              <div className="my-3 h-1 w-full px-10">
                <div
                  className={clsx(
                    'h-full w-full rounded-full',
                    dark ? 'bg-discord-divider' : 'bg-light-discord-divider',
                  )}
                />
              </div>
              <div className="absolute left-[2px] h-full w-full">
                <div className="relative h-full w-full overflow-clip">
                  <div
                    className={clsx(
                      'absolute top-3 -left-[7px] h-16 w-3 rounded-full',
                      dark ? 'bg-white' : 'bg-light-discord-active-chat',
                    )}
                  />
                </div>
              </div>
            </div>
          )}

          <div
            className={`flex w-full min-w-0 flex-col gap-2 px-5 py-6 ${
              dark ? 'bg-discord-light' : 'bg-light-discord-light'
            } ${hasCover && 'rounded-tl-xl'}`}
          >
            <div
              id="songinfo"
              className="relative h-[48px] w-full overflow-x-clip rounded px-2"
            >
              <p
                ref={titleRef}
                className={`relative z-50 -mt-1 overflow-clip whitespace-nowrap drop-shadow-md ${
                  font.titleClassName
                } ${hasOverflow && 'animated-title'}`}
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
              <p
                className={clsx(
                  'relative z-50 mb-1 overflow-clip text-ellipsis whitespace-nowrap',
                  font.artistClassName,
                )}
              >
                <span>{artist}</span>
              </p>
              <div className="absolute -top-[50%] -left-[50%] h-[200%] w-[200%] transition-all" />
            </div>

            <div
              id="songtime"
              className={clsx(
                'flex h-[20px] w-full items-center justify-between gap-2 rounded px-2',
                font.songTimeClassName,
              )}
            >
              <div className="flex w-full flex-col gap-1">
                <div className="flex w-full items-center justify-between gap-2">
                  {isLiveStream ? (
                    <>
                      <LiveIndicator />
                      <p className="justify-start text-sm font-bold">Live</p>
                    </>
                  ) : (
                    <p
                      className="flex w-20 justify-start"
                      style={{ textSizeAdjust: '80%' }}
                    >
                      {playbackState === PlaybackState.NOTHING_PLAYING
                        ? '00:00'
                        : msecToTime(progressMs)}
                    </p>
                  )}

                  <div
                    id="playbar"
                    className={clsx(
                      'relative h-fit w-full rounded-full',
                      dark ? 'bg-discord-dark' : 'bg-light-discord-divider',
                    )}
                    style={
                      settings.magic_colors
                        ? { backgroundColor: colors.darkMuted }
                        : {}
                    }
                  >
                    <div
                      id="active"
                      className="h-2 w-0 min-w-[7px] rounded-full ease-linear"
                      style={{
                        width: `${clampedPercent}%`,
                        backgroundColor: settings.magic_colors
                          ? colors.vibrant
                          : settings.tint_color,
                        transition: 'width 1s, background-color 0.3s',
                      }}
                    />
                    <div
                      className="relative -top-[16.6px] flex w-[100%]"
                      ref={knobRef}
                    >
                      {knobRef.current && (
                        <div
                          className="absolute h-[25px] w-3 rounded bg-white drop-shadow-md ease-linear"
                          style={{
                            transform: `translateX(${Math.max(
                              -2,
                              knobRef.current.clientWidth *
                                (clampedPercent / 100) -
                                6,
                            )}px)`,
                            transition: mounted ? 'transform 1s' : '',
                          }}
                        />
                      )}
                    </div>
                  </div>

                  {!isLiveStream && (
                    <p className="flex w-20 justify-end">
                      {msecToTime(durationMs)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PlayerViewWrapper>
  );
}
