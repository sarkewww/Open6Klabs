/**
 * Boxy skin — `settings.skin === "boxy"`.
 *
 * Faithful port of the original component `Vr`
 * (`PlayerWindows98-ChpRHqWu.js:396-398`, exported as `a`). DOM hierarchy,
 * class names, text and layout are copied verbatim; the shared sub-components
 * (`G`/`ce`/`Q`/`q`/`rt`/`ee`/`de`/`_e`/`Z`/`Ce`/`ke`/`U`/`X`) live in
 * `./compact-boxy-shared`.
 *
 * Structure (original `Vr`):
 *   G > ce.bottom-3.flex.h-20.select-none.items-end.gap-2.text-white
 *     > Q (cover)
 *     > q.flex.w-56.flex-col.justify-center > rt.px-7 (ee/de/_e)
 *     > q.flex.w-[204px].items-center.px-7.transition-[width]
 *         > rt.flex.h-fit.w-full.flex-col.gap-2
 *             > div.flex.h-full.w-full.justify-center (live or Ce/X/ke)
 *             > Z (playbar)
 */

import { CoverView } from '../covers';
import { usePlayerStoreSelector } from '../player/context';
import {
  Artist,
  CoverBlur,
  DurationTime,
  FontWrapper,
  LiveIndicator,
  PlainDiv,
  PlayerViewWrapper,
  Playbar,
  ProgressTime,
  Surface,
  Title,
  Visualizer,
} from './compact-boxy-shared';

export function Boxy() {
  const isLiveStream = usePlayerStoreSelector(
    (state) => state.currentTrack.isLiveStream,
  );

  return (
    <PlayerViewWrapper skin="boxy">
      <FontWrapper
        customFontEnabled
        className="bottom-3 flex h-20 select-none items-end gap-2 text-white"
      >
        <CoverView />
        <Surface className="flex w-56 flex-col justify-center">
          <PlainDiv className="px-7">
            <Title />
            <Artist />
            <CoverBlur />
          </PlainDiv>
        </Surface>
        <Surface
          testId="amuse-skin-surface"
          className="flex w-[204px] items-center px-7 transition-[width]"
        >
          <PlainDiv className="flex h-fit w-full flex-col gap-2">
            <div className="flex h-full w-full justify-center">
              {isLiveStream ? (
                <div className="flex w-full justify-between">
                  <div className="flex items-center gap-2">
                    <LiveIndicator />
                    <span className="text-sm font-bold transition-[color] duration-300">
                      Live
                    </span>
                  </div>
                  <Visualizer size="small" />
                </div>
              ) : (
                <>
                  <ProgressTime className="mr-4 flex h-[20px] max-w-8 justify-start" />
                  <Visualizer size="small" />
                  <DurationTime className="ml-4 flex h-[20px] max-w-8 justify-end" />
                </>
              )}
            </div>
            <Playbar />
          </PlainDiv>
        </Surface>
      </FontWrapper>
    </PlayerViewWrapper>
  );
}
