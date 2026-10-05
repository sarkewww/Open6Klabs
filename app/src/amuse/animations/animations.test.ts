import { describe, expect, it } from 'vitest';

/**
 * Structural assertions for the 24 in/out animations.
 *
 * Every `initial` / `animate` / `exit` / `transition` parameter object is
 * asserted verbatim. A deterministic 1000×1000 container resolver is used so
 * the size-relative offsets (`r(scale) = Math.round(scale * width|height)`)
 * resolve to exact integers: `r(0.2).y = 200`, `r(0.3).y = 300`,
 * `r(0.4).x|y = 400`.
 */

import {
  ALL_ANIMATIONS,
  ALL_ANIMATION_IDS,
  DEFAULT_HIDE_ANIMATION_ID,
  DEFAULT_SHOW_ANIMATION_ID,
  HIDE_ANIMATION_IDS,
  HIDE_ANIMATIONS,
  SHOW_ANIMATION_IDS,
  SHOW_ANIMATIONS,
  createHideAnimations,
  createShowAnimations,
  getHideAnimation,
  getShowAnimation,
  resolveMotionAnimation,
  type OffsetResolver,
} from './index';
import {
  SHOW_ANIMATIONS as REGISTRY_SHOW_ANIMATIONS,
  HIDE_ANIMATIONS as REGISTRY_HIDE_ANIMATIONS,
} from '../settings/registry';

const R: OffsetResolver = (scale = 1) => ({
  x: Math.round(scale * 1000),
  y: Math.round(scale * 1000),
});

const show = createShowAnimations(R);
const hide = createHideAnimations(R);

interface Expected {
  id: string;
  initial: Record<string, unknown>;
  animate: Record<string, unknown>;
  exit: Record<string, unknown>;
  transition: Record<string, unknown>;
}

const SPRING_125 = { duration: 1.25, bounce: 0.5, type: 'spring' };
const SPRING_15_05 = { duration: 1.5, type: 'spring', bounce: 0.5 };
const SPRING_15_04 = { duration: 1.5, type: 'spring', bounce: 0.4 };
const SPRING_1_05 = { duration: 1, type: 'spring', bounce: 0.5 };
const TWEEN_05 = { duration: 0.5, type: 'tween', ease: 'easeInOut' };

const SHOW_EXPECTED: Expected[] = [
  {
    id: 'default_in',
    initial: { opacity: -0.1, y: -200, scale: 0.5, filter: 'blur(0.5rem)' },
    animate: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' },
    exit: { opacity: -0.1 },
    transition: {
      y: { type: 'spring', duration: 1.3, bounce: 0.5, ease: 'easeInOut' },
      scale: { type: 'tween', duration: 1, ease: 'easeInOut' },
    },
  },
  {
    id: 'fade_in',
    initial: { opacity: -0.1 },
    animate: { opacity: 1.1 },
    exit: { opacity: -0.1 },
    transition: TWEEN_05,
  },
  {
    id: 'slide_in_left',
    initial: { x: -400, opacity: -0.1 },
    animate: { x: 0, opacity: 1.1 },
    exit: { opacity: -0.1 },
    transition: SPRING_125,
  },
  {
    id: 'slide_in_right',
    initial: { x: 400, opacity: -0.1 },
    animate: { x: 0, opacity: 1.1 },
    exit: { opacity: -0.1 },
    transition: SPRING_125,
  },
  {
    id: 'slide_in_top',
    initial: { y: -400, opacity: -0.1 },
    animate: { y: 0, opacity: 1.1 },
    exit: { opacity: -0.1 },
    transition: SPRING_125,
  },
  {
    id: 'slide_in_bottom',
    initial: { y: 400, opacity: -0.1 },
    animate: { y: 0, opacity: 1.1 },
    exit: { opacity: -0.1 },
    transition: SPRING_125,
  },
  {
    id: 'grow_in',
    initial: { scale: 0.5, opacity: -0.1 },
    animate: { scale: 1, opacity: 1.1 },
    exit: { opacity: -0.1 },
    transition: SPRING_15_04,
  },
  {
    id: 'shrink_in',
    initial: { scale: 1.5, opacity: -0.1 },
    animate: { scale: 1, opacity: 1.1 },
    exit: { opacity: -0.1 },
    transition: SPRING_15_05,
  },
  {
    id: 'swing_rotate_in_left',
    initial: { rotateZ: 10, y: 400, opacity: -0.1 },
    animate: { rotateZ: 0, y: 0, opacity: 1.1 },
    exit: { opacity: -0.1 },
    transition: SPRING_15_05,
  },
  {
    id: 'swing_rotate_in_right',
    initial: { rotateZ: -10, y: 400, opacity: -0.1 },
    animate: { rotateZ: 0, y: 0, opacity: 1.1 },
    exit: { opacity: -0.1 },
    transition: SPRING_15_05,
  },
  {
    id: 'tilt_in_right',
    initial: { x: 400, rotateZ: 10, opacity: -0.1 },
    animate: { x: 0, rotateZ: 0, opacity: 1.1 },
    exit: { opacity: -0.1 },
    transition: SPRING_1_05,
  },
  {
    id: 'tilt_in_left',
    initial: { x: -400, rotateZ: -10, opacity: -0.1 },
    animate: { x: 0, rotateZ: 0, opacity: 1.1 },
    exit: { opacity: -0.1 },
    transition: SPRING_1_05,
  },
];

const HIDE_EXPECTED: Expected[] = [
  {
    id: 'default_out',
    initial: { opacity: 1 },
    animate: {
      opacity: -0.1,
      y: 300,
      scale: 0.8,
      filter: 'blur(0.5rem)',
    },
    exit: { opacity: -0.1 },
    transition: {
      y: { type: 'spring', duration: 1.5, bounce: 0.5, ease: 'easeInOut' },
      scale: { type: 'tween', duration: 1, ease: 'easeInOut' },
    },
  },
  {
    id: 'fade_out',
    initial: { opacity: 1.1 },
    animate: { opacity: -0.1 },
    exit: { opacity: -0.1 },
    transition: TWEEN_05,
  },
  {
    id: 'slide_out_left',
    initial: { opacity: 1, x: 0 },
    animate: { x: -400, opacity: -0.1 },
    exit: { opacity: -0.1 },
    transition: SPRING_125,
  },
  {
    id: 'slide_out_right',
    initial: { opacity: 1, x: 0 },
    animate: { x: 400, opacity: -0.1 },
    exit: { opacity: -0.1 },
    transition: SPRING_125,
  },
  {
    id: 'slide_out_top',
    initial: { opacity: 1, y: 0 },
    animate: { y: -400, opacity: -0.1 },
    exit: { opacity: -0.1 },
    transition: SPRING_125,
  },
  {
    id: 'slide_out_bottom',
    initial: { opacity: 1, y: 0 },
    animate: { y: 400, opacity: -0.1 },
    exit: { opacity: -0.1 },
    transition: SPRING_125,
  },
  {
    id: 'grow_out',
    initial: { opacity: 1, scale: 1 },
    animate: { scale: 1.5, opacity: -0.1 },
    exit: { opacity: -0.1 },
    transition: SPRING_15_05,
  },
  {
    id: 'shrink_out',
    initial: { opacity: 1, scale: 1 },
    animate: { scale: 0.5, opacity: -0.1 },
    exit: { opacity: -0.1 },
    transition: SPRING_15_04,
  },
  {
    id: 'swing_rotate_out_left',
    initial: { opacity: 1, rotateZ: 0, y: 0 },
    animate: { rotateZ: -10, y: 400, opacity: -0.1 },
    exit: { opacity: -0.1 },
    transition: SPRING_15_05,
  },
  {
    id: 'swing_rotate_out_right',
    initial: { opacity: 1, rotateZ: 0, y: 0 },
    animate: { rotateZ: 10, y: 400, opacity: -0.1 },
    exit: { opacity: -0.1 },
    transition: SPRING_15_05,
  },
  {
    id: 'tilt_out_right',
    initial: { opacity: 1, x: 0, rotateZ: 0 },
    animate: { x: 400, rotateZ: 10, opacity: -0.1 },
    exit: { opacity: -0.1 },
    transition: SPRING_1_05,
  },
  {
    id: 'tilt_out_left',
    initial: { opacity: 1, x: 0, rotateZ: 0 },
    animate: { x: -400, rotateZ: -10, opacity: -0.1 },
    exit: { opacity: -0.1 },
    transition: SPRING_1_05,
  },
];

function assertDefinition(
  actual: (typeof show)[number] | undefined,
  expected: Expected,
) {
  expect(actual).toBeDefined();
  expect(actual!.id).toBe(expected.id);
  expect(actual!.initial).toEqual(expected.initial);
  expect(actual!.animate).toEqual(expected.animate);
  expect(actual!.exit).toEqual(expected.exit);
  expect(actual!.transition).toEqual(expected.transition);
}

describe('animations module / exports', () => {
  it('exposes 12 show + 12 hide definitions (24 total)', () => {
    expect(SHOW_ANIMATIONS).toHaveLength(12);
    expect(HIDE_ANIMATIONS).toHaveLength(12);
    expect(ALL_ANIMATIONS).toHaveLength(24);
    expect(ALL_ANIMATION_IDS).toHaveLength(24);
  });

  it('re-exports the registry definitions by identity (no redefinition)', () => {
    expect(SHOW_ANIMATIONS).toBe(REGISTRY_SHOW_ANIMATIONS);
    expect(HIDE_ANIMATIONS).toBe(REGISTRY_HIDE_ANIMATIONS);
  });

  it('keeps the original show/hide id order', () => {
    expect(SHOW_ANIMATION_IDS).toEqual(SHOW_EXPECTED.map((a) => a.id));
    expect(HIDE_ANIMATION_IDS).toEqual(HIDE_EXPECTED.map((a) => a.id));
  });

  it('falls back to default_in / default_out for unknown ids', () => {
    expect(getShowAnimation('does-not-exist').id).toBe(
      DEFAULT_SHOW_ANIMATION_ID,
    );
    expect(getHideAnimation('does-not-exist').id).toBe(
      DEFAULT_HIDE_ANIMATION_ID,
    );
    expect(getShowAnimation(undefined).id).toBe('default_in');
    expect(getHideAnimation(undefined).id).toBe('default_out');
  });
});

describe('animations module / show params (12)', () => {
  it.each(SHOW_EXPECTED)('$id params verbatim', (expected) => {
    assertDefinition(
      show.find((animation) => animation.id === expected.id),
      expected,
    );
  });

  it('has the original names and directions', () => {
    expect(show.map((a) => a.name)).toEqual([
      'Original',
      'Fade',
      'Slide',
      'Slide',
      'Slide',
      'Slide',
      'Grow',
      'Shrink',
      'Swing',
      'Swing',
      'Tilt',
      'Tilt',
    ]);
    expect(show.find((a) => a.id === 'slide_in_left')?.direction).toBe('left');
    expect(show.find((a) => a.id === 'slide_in_right')?.direction).toBe(
      'right',
    );
    expect(show.find((a) => a.id === 'swing_rotate_in_left')?.direction).toBe(
      'left',
    );
    expect(show.find((a) => a.id === 'tilt_in_right')?.direction).toBe('right');
    expect(show.find((a) => a.id === 'tilt_in_left')?.direction).toBe('left');
  });
});

describe('animations module / hide params (12)', () => {
  it.each(HIDE_EXPECTED)('$id params verbatim', (expected) => {
    assertDefinition(
      hide.find((animation) => animation.id === expected.id),
      expected,
    );
  });

  it('has the original names and directions', () => {
    expect(hide.map((a) => a.name)).toEqual([
      'Original',
      'Fade',
      'Slide',
      'Slide',
      'Slide',
      'Slide',
      'Grow',
      'Shrink',
      'Swing',
      'Swing',
      'Tilt',
      'Tilt',
    ]);
    expect(hide.find((a) => a.id === 'slide_out_left')?.direction).toBe('left');
    expect(hide.find((a) => a.id === 'slide_out_right')?.direction).toBe(
      'right',
    );
    expect(hide.find((a) => a.id === 'tilt_out_right')?.direction).toBe(
      'right',
    );
    expect(hide.find((a) => a.id === 'tilt_out_left')?.direction).toBe('left');
  });
});

describe('animations module / tilt left vs right are not swapped', () => {
  const right = show.find((a) => a.id === 'tilt_in_right')!;
  const left = show.find((a) => a.id === 'tilt_in_left')!;

  it('tilt_in_right enters from +x with a +rotateZ', () => {
    expect(right.initial).toEqual({ x: 400, rotateZ: 10, opacity: -0.1 });
    expect(right.initial.x as number).toBeGreaterThan(0);
    expect(right.initial.rotateZ as number).toBeGreaterThan(0);
  });

  it('tilt_in_left enters from -x with a -rotateZ', () => {
    expect(left.initial).toEqual({ x: -400, rotateZ: -10, opacity: -0.1 });
    expect(left.initial.x as number).toBeLessThan(0);
    expect(left.initial.rotateZ as number).toBeLessThan(0);
  });

  it('does not mirror the two definitions', () => {
    expect(right.initial).not.toEqual(left.initial);
    expect(right.direction).not.toBe(left.direction);
  });

  it('keeps the hide tilts the opposite way too', () => {
    const outRight = hide.find((a) => a.id === 'tilt_out_right')!;
    const outLeft = hide.find((a) => a.id === 'tilt_out_left')!;
    expect(outRight.animate).toEqual({ x: 400, rotateZ: 10, opacity: -0.1 });
    expect(outLeft.animate).toEqual({ x: -400, rotateZ: -10, opacity: -0.1 });
  });
});

describe('animations module / resolveMotionAnimation', () => {
  it('maps show initial/animate/transition and hide animate/transition', () => {
    const showAnimation = getShowAnimation('default_in');
    const hideAnimation = getHideAnimation('default_out');
    const props = resolveMotionAnimation(showAnimation, hideAnimation);

    expect(props.initial).toEqual(showAnimation.initial);
    expect(props.animate).toEqual(showAnimation.animate);
    expect(props.transition).toEqual(showAnimation.transition);
    expect(props.exit).toEqual({
      ...hideAnimation.animate,
      transition: hideAnimation.transition,
    });
  });

  it('uses the resolved show/hide pair', () => {
    const props = resolveMotionAnimation(
      show.find((animation) => animation.id === 'tilt_in_left')!,
      hide.find((animation) => animation.id === 'tilt_out_right')!,
    );
    expect(props.initial).toEqual({ x: -400, rotateZ: -10, opacity: -0.1 });
    expect(props.exit).toEqual({
      x: 400,
      rotateZ: 10,
      opacity: -0.1,
      transition: SPRING_1_05,
    });
  });
});
