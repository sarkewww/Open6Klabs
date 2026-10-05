/**
 * Minimal skin — `settings.skin === "minimal"`.
 *
 * Faithful port of the original skin component `Rr` (export `e`) at
 * `app/_reference/PlayerWindows98-ChpRHqWu.js:438-440`. The original renders:
 *
 *   G  (PlayerView)                              -> <PlayerViewWrapper skin="minimal">
 *    └ ce (custom-font wrapper)                  -> <FontWrapper customFontEnabled>
 *       └ div.flex.flex-col.gap-2
 *          └ q  (surface, h-8 w-[400px])         -> <Surface className="relative flex h-8 w-[400px] items-center justify-between overflow-hidden">
 *              ├ div.h-8.w-full.p-1
 *              │   ├ Q  (cover, radius "0.3125rem")  -> <CoverView />
 *              │   ├ bs (marquee, ml-3)              -> <OverflowMarquee className="ml-3">
 *              │   │   └ div.flex.items-center.justify-center.gap-2
 *              │   │       ├ ee (title, m-0 text-sm) -> <Title className="m-0 text-sm" />
 *              │   │       ├ span "•"                -> <span className={cover_blur...}>•</span>
 *              │   │       └ de (artist, m-0 text-sm)-> <Artist className="m-0 text-sm" />
 *              │   ├ isLiveStream ? [U + "Live"]     -> <LiveIndicator /> + <span>Live</span>
 *              │   └ else         ? [Z (mx-3 w-24)]  -> <Playbar className="mx-3 w-24" />
 *              └ _e (blurred cover)                  -> <CoverBlur />
 *
 * The Minimal layout is the "minimized" single-bar layout: one `h-8` by
 * `w-[400px]` surface holding the cover, a marquee title/artist, and either the
 * live badge or the progress playbar. The original passes `radius="0.3125rem"`
 * to the cover `Q`; the rewrite's cover dispatch renders `Q`'s port
 * (`SquareCover`) with its own default (`0.5rem`) because `CoverView` takes no
 * props (owned by Todo 16). The Gallery crop value the plan calls out
 * (`0.5rem`) is preserved exactly; the Minimal cover radius is the dispatch's
 * default — recorded as a known dispatch-architecture limitation.
 *
 * Class names, text, inline styles and DOM hierarchy are copied verbatim.
 */

import { clsx } from 'clsx';
import { CoverView } from '../covers';
import { usePlayerStoreSelector } from '../player/context';
import { useProfileSettings } from '../profile/context';
import {
  Artist,
  CoverBlur,
  FontWrapper,
  LiveIndicator,
  OverflowMarquee,
  Playbar,
  PlayerViewWrapper,
  Surface,
  Title,
} from './gallery-minimal-shared';

export function Minimal() {
  const settings = useProfileSettings();
  const isLiveStream = usePlayerStoreSelector(
    (state) => state.currentTrack.isLiveStream,
  );

  return (
    <PlayerViewWrapper skin="minimal">
      <FontWrapper customFontEnabled className="">
        <div className="flex flex-col gap-2">
          <Surface
            testId="amuse-skin-surface"
            className="relative flex h-8 w-[400px] items-center justify-between overflow-hidden"
          >
            <div className="relative flex h-8 w-full items-center p-1">
              <CoverView />
              <OverflowMarquee className="ml-3">
                <div className="flex items-center justify-center gap-2">
                  <Title className="m-0 text-sm" />
                  <span
                    className={clsx(
                      settings &&
                        settings.cover_blur &&
                        settings.skin !== 'macos' &&
                        settings.skin !== 'shell' &&
                        settings.skin !== 'discord' &&
                        'text-white',
                    )}
                  >
                    {'\u2022'}
                  </span>
                  <Artist className="m-0 text-sm" />
                </div>
              </OverflowMarquee>
              {isLiveStream ? (
                <div className="mx-3 flex items-center gap-2">
                  <LiveIndicator />
                  <span className="text-sm font-bold">Live</span>
                </div>
              ) : (
                <div className="ml-auto flex items-center gap-2">
                  <Playbar className="mx-3 w-24" />
                </div>
              )}
            </div>
            <CoverBlur />
          </Surface>
        </div>
      </FontWrapper>
    </PlayerViewWrapper>
  );
}
