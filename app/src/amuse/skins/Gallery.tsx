/**
 * Gallery skin — `settings.skin === "gallery"`.
 *
 * Faithful port of the original skin component `Hr` (export `b`) at
 * `app/_reference/PlayerWindows98-ChpRHqWu.js:424-427`. The original renders:
 *
 *   G  (PlayerView)                              -> <PlayerViewWrapper skin="gallery">
 *    └ ce (custom-font wrapper)                  -> <FontWrapper className="flex h-fit w-52 flex-col gap-2" customFontEnabled>
 *       ├ Q  (cover, radius "0.5rem")            -> <CoverView />
 *       ├ q  (surface, h-[63px])                 -> <Surface className="flex h-[63px] w-full flex-col justify-center px-3 py-1">
 *       │   ├ ee (title, mt-0.5)                 -> <Title className="mt-0.5" />
 *       │   ├ de (artist)                        -> <Artist />
 *       │   └ _e (blurred cover)                 -> <CoverBlur />
 *       └ q  (surface, control row, p-3)         -> <Surface className="flex w-full items-center gap-2 p-3">
 *           ├ isLiveStream ? [U + "Live" + Z]    -> <LiveIndicator /> + <span>Live</span> + <Playbar />
 *           └ else         ? [Ce + Z + ke]       -> <ProgressTime /> + <Playbar /> + <DurationTime />
 *
 * The Gallery layout is the "big cover" layout: a `w-52` (208px) column whose
 * first child is the large square cover. The cover crop/radius rule is
 * `0.5rem` — the original passes `radius="0.5rem"` to `Q`; the rewrite's cover
 * dispatch renders `Q`'s port (`SquareCover`) with the identical default
 * (`SQUARE_COVER_RADIUS = "0.5rem"`), so the crop value is preserved exactly.
 * The vinyl-cover special case (`7rem` for the gallery skin) is owned by the
 * vinyl cover component and reads `settings.skin`.
 *
 * Class names, text, inline styles and DOM hierarchy are copied verbatim.
 */

import { CoverView } from '../covers';
import { usePlayerStoreSelector } from '../player/context';
import {
  Artist,
  CoverBlur,
  DurationTime,
  FontWrapper,
  LiveIndicator,
  Playbar,
  PlayerViewWrapper,
  ProgressTime,
  Surface,
  Title,
} from './gallery-minimal-shared';

export function Gallery() {
  const isLiveStream = usePlayerStoreSelector(
    (state) => state.currentTrack.isLiveStream,
  );

  return (
    <PlayerViewWrapper skin="gallery">
      <FontWrapper className="flex h-fit w-52 flex-col gap-2" customFontEnabled>
        <CoverView />
        <Surface
          testId="amuse-skin-surface"
          className="flex h-[63px] w-full flex-col justify-center px-3 py-1"
        >
          <Title className="mt-0.5" />
          <Artist />
          <CoverBlur />
        </Surface>
        <Surface className="flex w-full items-center gap-2 p-3">
          {isLiveStream ? (
            <div className="flex w-full items-center gap-2">
              <div className="flex items-center gap-2">
                <LiveIndicator />
                <span className="text-sm font-bold transition-[color] duration-300">
                  Live
                </span>
              </div>
              <Playbar />
            </div>
          ) : (
            <>
              <ProgressTime className="h-[20px]" />
              <Playbar />
              <DurationTime className="h-[20px]" />
            </>
          )}
        </Surface>
      </FontWrapper>
    </PlayerViewWrapper>
  );
}
