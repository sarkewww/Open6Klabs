/**
 * Player wrapper — the `Er` composition root from the original Amuse widget.
 *
 * Original sources:
 *   - colour context `Er` (export `C`) .... `PlayerWindows98-ChpRHqWu.js:168-175`
 *   - profile settings hook `k` (export `h`) `PlayerWindows98-ChpRHqWu.js:106-136`
 *   - player layout `fi` .................. `AmuseWidget.js:7283-7600`
 *   - skin dispatch `(B.find(...) ?? B[0])`  `AmuseWidget.js:7499-7537, 7593`
 *
 * `Player` is the wrapper the overlay mounts. It:
 *   1. reads the player store (widget state / current track) via the store
 *      context and the profile settings via the settings context;
 *   2. provides the cover colour palette (`Er`) to the tree;
 *   3. renders the selected skin (`SkinView` -> `settings.skin`), which in turn
 *      renders the selected cover (`CoverView` -> `settings.cover`);
 *   4. wires the profile effect switches `magic_colors` / `cover_glow` /
 *      `cover_blur` / `hide_visualizer` down to the cover/skin frames;
 *   5. applies the profile show/hide animations to the `motion.div` (original
 *      `fi`'s `me`/`ce`/`Oe`/`V`/`Z`/`Te` block, `AmuseWidget.js:7556-7596`).
 *
 * The layout (`<div className="h-full w-full">` + `AnimatePresence` +
 * `motion.div`) is the original `fi` DOM. The player only renders once the
 * widget state is `SUCCESS` (`shouldRenderPlayer`, original `m && b == q.SUCCESS`).
 */

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { StoreApi } from 'zustand';
import {
  DEFAULT_HIDE_ANIMATION_ID,
  DEFAULT_SHOW_ANIMATION_ID,
  resolveMotionAnimation,
  useAnimationContainer,
} from '../animations';
import {
  ProfileSettingsProvider,
  useProfileSettings,
} from '../profile/context';
import {
  resolveProfileSettings,
  type AmuseProfileSettings,
} from '../profile/settings';
import { SkinView } from '../skins';
import { ThemeContainer } from '../themes';
import { CoverColorsProvider, type CoverPalette } from './colors';
import { PlayerStoreProvider, usePlayerStoreSelector } from './context';
import { shouldRenderPlayer } from './state-machine';
import type { PlayerStore } from './store';

export interface PlayerProps {
  /** Optional profile settings override; missing fields fall back to defaults. */
  settings?: Partial<AmuseProfileSettings> | null;
  /** Optional isolated player store; defaults to the module singleton. */
  store?: StoreApi<PlayerStore>;
  /** Optional cover palette override (tests / injected roots). */
  palette?: Partial<CoverPalette>;
  /** Optional custom body; defaults to the player layout. */
  children?: ReactNode;
}

/** The original `fi` layout + skin dispatch, gated on `widgetState === SUCCESS`. */
function PlayerLayout() {
  const settings = useProfileSettings();
  const widgetState = usePlayerStoreSelector((state) => state.widgetState);
  const showPlayer = shouldRenderPlayer(widgetState, true);
  // Original `fe = ps(de, re)`: the 24 animations rebuilt at the container size.
  const { ref, showAnimations, hideAnimations } = useAnimationContainer();

  // Original `me` / `ce`: `find(id)` with the `default_in` / `default_out` fallback.
  const showAnimation =
    showAnimations.find(
      (animation) => animation.id === settings.show_animation,
    ) ??
    showAnimations.find(
      (animation) => animation.id === DEFAULT_SHOW_ANIMATION_ID,
    )!;
  const hideAnimation =
    hideAnimations.find(
      (animation) => animation.id === settings.hide_animation,
    ) ??
    hideAnimations.find(
      (animation) => animation.id === DEFAULT_HIDE_ANIMATION_ID,
    )!;
  const motionProps = resolveMotionAnimation(showAnimation, hideAnimation);

  // Original `ue` (`AmuseWidget.js:7567-7574`): the very first mount does NOT
  // animate — `initial` = the animate target and the transition duration is 0.
  // Once mounted, `initial` = the show animation's initial so skin changes
  // animate (`$ = ue ? Z : V`, `he = ue ? { duration: 0 } : Oe`).
  const [firstMount, setFirstMount] = useState(true);
  useEffect(() => {
    if (firstMount) setFirstMount(false);
  }, [firstMount]);

  return (
    <div ref={ref} className="h-full w-full">
      <AnimatePresence mode="popLayout">
        {showPlayer && (
          <motion.div
            key={settings.skin}
            className="h-full w-full"
            initial={firstMount ? motionProps.animate : motionProps.initial}
            animate={motionProps.animate}
            exit={motionProps.exit}
            transition={firstMount ? { duration: 0 } : motionProps.transition}
          >
            <SkinView />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Wrapper/context component. Renders the selected skin + cover and wires the
 * profile effect switches. Falls back to the default profile settings and the
 * module player store when no provider/store is supplied.
 */
export default function Player({
  settings,
  store,
  palette,
  children,
}: PlayerProps) {
  const inherited = useProfileSettings();
  const resolved = useMemo(
    () => resolveProfileSettings({ ...inherited, ...settings }),
    [inherited, settings],
  );

  return (
    <PlayerStoreProvider store={store}>
      <ThemeContainer theme={resolved.theme} className="h-full w-full">
        <ProfileSettingsProvider settings={resolved}>
          <CoverColorsProvider palette={palette}>
            {children ?? <PlayerLayout />}
          </CoverColorsProvider>
        </ProfileSettingsProvider>
      </ThemeContainer>
    </PlayerStoreProvider>
  );
}
