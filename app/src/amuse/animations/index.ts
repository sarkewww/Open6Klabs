/**
 * Show/hide animation module — the 24 framer-motion definitions (`R` show,
 * `D` hide) plus the application point from the original Amuse widget.
 *
 * Sources:
 *   - `useAmuseSettings.js:700-828`  show animations `R` (12)
 *   - `useAmuseSettings.js:840-958`  hide animations `D` (12)
 *   - `AmuseWidget.js:7556-7596`     application in the player layout `fi`
 *
 * The parameter objects themselves already live verbatim in
 * `../settings/registry.ts` (`SHOW_ANIMATIONS` / `HIDE_ANIMATIONS`, ported by
 * Task 3). This module is the single import point for the animation layer: it
 * re-exports the 24 definitions (it does NOT redefine the ids or the params),
 * exposes the ordered id lists, mirrors the original `V(id)` lookup with the
 * `default_in` / `default_out` fallbacks, and resolves the
 * `initial` / `animate` / `exit` / `transition` props the player mounts.
 *
 * All duration / easing / offset / rotate / scale values are copied verbatim
 * from the registry — this module adds lookup + application only.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TargetAndTransition, Transition } from 'framer-motion';
import {
  SHOW_ANIMATIONS,
  HIDE_ANIMATIONS,
  SHOW_ANIMATION_IDS,
  HIDE_ANIMATION_IDS,
  createShowAnimations,
  createHideAnimations,
  type AnimationDef,
  type AnimationValues,
  type OffsetResolver,
  type TransitionSpec,
} from '../settings/registry';

export {
  SHOW_ANIMATIONS,
  HIDE_ANIMATIONS,
  SHOW_ANIMATION_IDS,
  HIDE_ANIMATION_IDS,
  createShowAnimations,
  createHideAnimations,
  getAnimationById,
} from '../settings/registry';

export type {
  AnimationDef,
  AnimationValues,
  AnimationDirection,
  OffsetResolver,
  TransitionSpec,
  TransitionStep,
} from '../settings/registry';

/** `default_in` — the original show fallback (`AmuseWidget.js:7558`). */
export const DEFAULT_SHOW_ANIMATION_ID = 'default_in' as const;
/** `default_out` — the original hide fallback (`AmuseWidget.js:7561`). */
export const DEFAULT_HIDE_ANIMATION_ID = 'default_out' as const;

/** 12 show definitions. */
export const SHOW_ANIMATION_COUNT = SHOW_ANIMATIONS.length;
/** 12 hide definitions. */
export const HIDE_ANIMATION_COUNT = HIDE_ANIMATIONS.length;
/** 24 in total. */
export const ANIMATION_COUNT = SHOW_ANIMATION_COUNT + HIDE_ANIMATION_COUNT;

/** All 24 definitions — show (12) then hide (12), original order. */
export const ALL_ANIMATIONS: readonly AnimationDef[] = [
  ...SHOW_ANIMATIONS,
  ...HIDE_ANIMATIONS,
];

/** All 24 ids — show then hide, original order. */
export const ALL_ANIMATION_IDS: readonly string[] = [
  ...SHOW_ANIMATION_IDS,
  ...HIDE_ANIMATION_IDS,
];

/** `fi` show lookup: `find(id)`, falling back to `default_in`. */
export function getShowAnimation(id: string | undefined): AnimationDef {
  return (
    SHOW_ANIMATIONS.find((animation) => animation.id === id) ??
    SHOW_ANIMATIONS.find(
      (animation) => animation.id === DEFAULT_SHOW_ANIMATION_ID,
    )!
  );
}

/** `fi` hide lookup: `find(id)`, falling back to `default_out`. */
export function getHideAnimation(id: string | undefined): AnimationDef {
  return (
    HIDE_ANIMATIONS.find((animation) => animation.id === id) ??
    HIDE_ANIMATIONS.find(
      (animation) => animation.id === DEFAULT_HIDE_ANIMATION_ID,
    )!
  );
}

/** The four motion props the player mounts (`fi`'s `$` / `ie` / `Te` / `he`). */
export interface MotionAnimationProps {
  initial: TargetAndTransition;
  animate: TargetAndTransition;
  exit: TargetAndTransition;
  transition: Transition;
}

/** Registry values are plain `number | string` records; cast at the boundary. */
function toTarget(values: AnimationValues): TargetAndTransition {
  return values as unknown as TargetAndTransition;
}

/** Registry transitions are `{duration,type,ease}` records; cast at the boundary. */
function toTransition(spec: TransitionSpec): Transition {
  return spec as unknown as Transition;
}

/**
 * Resolves the motion props from a show/hide pair, mirroring the original:
 *   - `initial`  = show animation `initial`   (`fi`'s `V`)
 *   - `animate`  = show animation `animate`   (`fi`'s `Z` / `ie`)
 *   - `exit`     = hide animation `animate`   (`fi`'s `Te`)
 *   - `transition` = show animation `transition` (enter; `fi`'s `Oe` on show)
 *
 * The hide transition is inlined into `exit` so `AnimatePresence` uses the hide
 * timing (the original flips a single `transition` prop on its hidden flag).
 */
export function resolveMotionAnimation(
  showAnimation: AnimationDef,
  hideAnimation: AnimationDef,
): MotionAnimationProps {
  return {
    initial: toTarget(showAnimation.initial),
    animate: toTarget(showAnimation.animate),
    exit: {
      ...toTarget(hideAnimation.animate),
      transition: toTransition(hideAnimation.transition),
    },
    transition: toTransition(showAnimation.transition),
  };
}

/** Live container geometry, measured exactly like the original `p()` helper. */
export interface AnimationContainer {
  /** Attach to the original `fi` root `<div className="h-full w-full">`. */
  ref: React.RefObject<HTMLDivElement | null>;
  /** Show animations resolved at the current container size. */
  showAnimations: readonly AnimationDef[];
  /** Hide animations resolved at the current container size. */
  hideAnimations: readonly AnimationDef[];
}

/**
 * Measures the player container and rebuilds the size-relative animations at
 * that size. Mirrors `useAmuseSettings`'s ResizeObserver + `r(scale)` resolver
 * (`useAmuseSettings.js:676-708`). jsdom has no ResizeObserver, so the initial
 * `{width:0,height:0}` state is kept there (offsets collapse to 0, same as the
 * original's pre-measurement render).
 */
export function useAnimationContainer(): AnimationContainer {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const resolveOffset = useCallback<OffsetResolver>(
    (scale = 1) => ({
      x: Math.round(scale * (size.width || 0)),
      y: Math.round(scale * (size.height || 0)),
    }),
    [size],
  );

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () =>
      setSize({ width: node.clientWidth || 0, height: node.clientHeight || 0 });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return {
    ref,
    showAnimations: createShowAnimations(resolveOffset),
    hideAnimations: createHideAnimations(resolveOffset),
  };
}
