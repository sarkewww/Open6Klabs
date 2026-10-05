/**
 * macOS skin — `settings.skin === "macos"`.
 *
 * Original skin: `zr` (`PlayerWindows98-ChpRHqWu.js:431`, export `c`).
 * Structure is copied verbatim: the `G` scale wrapper (`PlayerScale`) wraps the
 * `ce` font frame (`SkinFontFrame`), whose first child is the window chrome
 * (close/minimize/fullscreen traffic lights + visualizer) and whose second
 * child is the cover + song-info/playbar row.
 *
 * The cover is the shared `CoverView` dispatch (`Q` in the original); the
 * original passes `radius="0.75rem"` — the radius prop is owned by the cover
 * components (Todos 17-19) and is not part of this task's file set.
 *
 * Test hooks: the root `PlayerScale` carries `data-testid="amuse-skin"` /
 * `data-skin="macos"` so the wrapper dispatch test (`player-wrapper.test.tsx`)
 * keeps resolving the skin after this stub is replaced. These are non-visual
 * attributes only; classes and DOM hierarchy are unchanged.
 */

import { CoverView } from '../covers';
import { useCoverColors } from '../player/colors';
import { usePlayerStoreSelector } from '../player/context';
import { useProfileSettings } from '../profile/context';
import { Cover, Theme } from '../types/user';
import {
  cn,
  DurationTime,
  ElapsedTime,
  LiveDot,
  PlayerScale,
  ProgressBar,
  SkinFontFrame,
  TrackArtist,
  TrackTitle,
  Visualizer,
} from './macos-shell-parts';

export function MacOS() {
  const settings = useProfileSettings();
  const isLiveStream = usePlayerStoreSelector(
    (state) => state.currentTrack.isLiveStream,
  );
  const { colors } = useCoverColors();

  return (
    <PlayerScale testId="amuse-skin" skin="macos">
      <SkinFontFrame
        className={cn(
          'flex flex-col overflow-hidden rounded-2xl transition-[background-color,outline] duration-300',
          settings.theme === Theme.DARK
            ? 'bg-osx-content-bg text-white outline-2 outline-osx-top-bg'
            : 'bg-osx-content-bg-light text-black outline-2 outline-osx-top-bg-light',
        )}
        customFontEnabled
      >
        {/* window chrome */}
        <div
          className={cn(
            'flex h-10 w-full justify-between border-b-[2px] p-4 transition duration-300',
            settings.theme === Theme.DARK
              ? 'border-b-gray-800 bg-osx-top-bg'
              : 'border-b-gray-300 bg-osx-top-bg-light',
          )}
        >
          <div className="flex items-center gap-3">
            <div className="h-4 w-4 rounded-full bg-osx-close" />
            <div className="h-4 w-4 rounded-full bg-osx-minimize" />
            <div className="h-4 w-4 rounded-full bg-osx-fullscreen" />
          </div>
          <Visualizer size="small" />
        </div>

        {/* cover + song info */}
        <div
          className={cn(
            'flex items-center p-5',
            settings.cover !== Cover.NONE && 'gap-2',
          )}
        >
          <div
            className={`relative h-28 transition duration-1000 ${
              !settings.cover_glow && 'drop-shadow-[0_0px_10px_rgba(0,0,0,0.7)]'
            }`}
          >
            <CoverView />
          </div>
          <div
            className="flex w-full min-w-0 flex-col gap-2"
            style={{
              color: settings.magic_colors
                ? settings.theme === Theme.DARK
                  ? colors.lightVibrant
                  : colors.darkVibrant
                : '',
              outlineOffset: '-2px',
            }}
          >
            <div
              id="songinfo"
              className="relative w-52 overflow-x-clip rounded px-2 transition-all duration-300"
            >
              <TrackTitle />
              <TrackArtist />
            </div>
            <div
              id="songtime"
              className="flex h-full w-full items-center justify-between gap-2 rounded px-2 text-lg transition-all duration-300"
            >
              <div className="flex w-full flex-col gap-1">
                {isLiveStream ? (
                  <div className="flex items-center gap-2">
                    <LiveDot />
                    <span className="text-sm font-bold transition-[color] duration-300">
                      Live
                    </span>
                  </div>
                ) : (
                  <div className="flex h-[20px] w-full justify-between">
                    <ElapsedTime />
                    <DurationTime />
                  </div>
                )}
                <ProgressBar />
              </div>
            </div>
          </div>
        </div>
      </SkinFontFrame>
    </PlayerScale>
  );
}
