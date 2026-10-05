/**
 * Compact skin — `settings.skin === "compact"`.
 *
 * Faithful port of the original component `Nr`
 * (`PlayerWindows98-ChpRHqWu.js:403-405`, exported as `P`). DOM hierarchy,
 * class names, text and layout are copied verbatim; the shared sub-components
 * (`G`/`ce`/`Q`/`q`/`ee`/`de`/`_e`/`Z`/`Ce`/`ke`/`U`/`X`) live in
 * `./compact-boxy-shared`.
 *
 * Structure (original `Nr`):
 *   G > ce[data-skin=compact] > div.flex.flex-col.gap-2
 *     > div.flex.h-28.w-full.gap-2
 *         > Q (cover)
 *         > div.z-50.flex.w-full.min-w-0.flex-col.gap-2
 *             > q.flex.flex-col.justify-center.px-3.py-1 (ee/de/_e)
 *             > q.flex.h-[72px].items-center.justify-evenly (live or Ce/X/ke)
 *     > Z (playbar)
 */

import { CoverView } from '../covers';
import { usePlayerStoreSelector } from '../player/context';
import { useProfileSettings } from '../profile/context';
import { Cover } from '../types/user';
import {
  Artist,
  CoverBlur,
  DurationTime,
  FontWrapper,
  LiveIndicator,
  PlayerViewWrapper,
  Playbar,
  ProgressTime,
  Surface,
  Title,
  Visualizer,
} from './compact-boxy-shared';

export function Compact() {
  const settings = useProfileSettings();
  const isLiveStream = usePlayerStoreSelector(
    (state) => state.currentTrack.isLiveStream,
  );

  return (
    <PlayerViewWrapper skin="compact">
      <FontWrapper
        customFontEnabled
        className={settings.cover === Cover.NONE ? 'w-[284px]' : 'w-[405px]'}
      >
        <div className="flex flex-col gap-2">
          <div className="flex h-28 w-full gap-2">
            <CoverView />
            <div className="z-50 flex w-full min-w-0 flex-col gap-2">
              <Surface
                testId="amuse-skin-surface"
                className="flex flex-col justify-center px-3 py-1"
              >
                <Title className="mt-0.5" />
                <Artist />
                <CoverBlur />
              </Surface>
              <Surface className="flex h-[72px] items-center justify-evenly">
                {isLiveStream ? (
                  <div className="flex w-full items-center justify-between">
                    <div className="ml-4 flex items-center gap-2">
                      <LiveIndicator />
                      <span className="text-sm font-bold transition-[color] duration-300">
                        Live
                      </span>
                      <Visualizer size="large" />
                    </div>
                  </div>
                ) : (
                  <>
                    <ProgressTime className="w-10" />
                    <Visualizer size="large" />
                    <DurationTime className="flex w-10 justify-end" />
                  </>
                )}
              </Surface>
            </div>
          </div>
          <Playbar />
        </div>
      </FontWrapper>
    </PlayerViewWrapper>
  );
}
