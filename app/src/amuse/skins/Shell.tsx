/**
 * Shell skin — `settings.skin === "shell"`.
 *
 * Original skin: `Tr` (`PlayerWindows98-ChpRHqWu.js:454`, export `d`).
 * Structure is copied verbatim: the `G` scale wrapper (`PlayerScale`) wraps the
 * terminal window (`bg-shell-bg` / `bg-shell-menu-bar`), whose menu bar holds
 * the buttons SVG + `root@amuse` title and whose body holds the `--nowplaying`
 * prompt, title/artist lines, ASCII progress and the live/time row.
 *
 * IMPORTANT: Shell has NO cover branch. The original `Tr` never renders the
 * cover component `Q` (`CoverView`); the layout is a terminal-style window
 * only. Do not add a cover here.
 */

import { useCoverColors } from '../player/colors';
import { usePlayerStoreSelector } from '../player/context';
import { useProfileSettings } from '../profile/context';
import { Theme } from '../types/user';
import {
  cn,
  LiveDot,
  msecToTime,
  PlayerScale,
  ShellProgress,
} from './macos-shell-parts';

/** Original `ys` — the shell menu-bar buttons asset. */
const SHELL_BUTTONS_SVG = '/assets/buttons-CPde-GSm.svg';

export function Shell() {
  const settings = useProfileSettings();
  const isLiveStream = usePlayerStoreSelector(
    (state) => state.currentTrack.isLiveStream,
  );
  const title = usePlayerStoreSelector((state) => state.currentTrack.title);
  const artist = usePlayerStoreSelector((state) => state.currentTrack.artist);
  const progress = usePlayerStoreSelector(
    (state) => state.currentTrack.progress,
  );
  const duration = usePlayerStoreSelector(
    (state) => state.currentTrack.duration,
  );
  const { colors } = useCoverColors();
  const isDark = settings.theme === Theme.DARK;

  return (
    <PlayerScale testId="amuse-skin" skin="shell">
      <div
        className={cn(
          'h-full w-96 overflow-hidden rounded-lg bg-shell-bg transition-[background-color,outline] duration-300',
          isDark
            ? 'bg-shell-bg text-white outline outline-2 outline-shell-menu-bar'
            : 'bg-shell-bg-light text-black outline outline-2 outline-shell-menu-bar-light',
        )}
        style={{ fontFamily: 'JetBrainsMono-Bold', outlineOffset: '-2px' }}
      >
        {/* menu bar */}
        <div
          className={cn(
            'relative flex h-8 w-full items-center justify-end p-2 text-center transition-[background-color] duration-300',
            isDark ? 'bg-shell-menu-bar' : 'bg-shell-menu-bar-light',
          )}
        >
          <img src={SHELL_BUTTONS_SVG} className="h-5" alt="" />
          <p className="absolute left-0 right-0 transition-[color] duration-300">
            root@amuse
          </p>
        </div>

        {/* terminal body */}
        <div className={cn('p-4', isDark ? 'text-white' : 'text-black')}>
          <p>
            <span
              className="transition-[color] duration-300"
              style={{
                color: settings.magic_colors
                  ? colors.vibrant
                  : settings.tint_color,
              }}
            >
              root@amuse&gt;
            </span>
            <span
              className={cn(
                'transition duration-300',
                isDark ? 'text-white' : 'text-black',
              )}
              style={{
                color: settings.magic_colors
                  ? isDark
                    ? colors.lightVibrant
                    : colors.lightMuted
                  : '',
              }}
            >
              ./amuse
            </span>{' '}
            <span className="text-gray-400">--nowplaying</span>
          </p>
          <p className="overflow-hidden text-ellipsis whitespace-nowrap transition-[color] duration-300">
            Title: {title}
          </p>
          <p className="overflow-hidden text-ellipsis whitespace-nowrap transition-[color] duration-300">
            Artist: {artist}
          </p>
          <ShellProgress />
          <p>
            {isLiveStream ? (
              <div className="flex items-center gap-2">
                <LiveDot />
                <span className="transition-[color] duration-300">Live</span>
              </div>
            ) : (
              <>
                <span className="transition-[color] duration-300">
                  {msecToTime(progress)}
                </span>
                <span className="transition-[color] duration-300"> - </span>
                <span className="transition-[color] duration-300">
                  {msecToTime(duration)}
                </span>
              </>
            )}
          </p>
        </div>
      </div>
    </PlayerScale>
  );
}
