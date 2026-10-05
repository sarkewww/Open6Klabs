/**
 * None cover — `settings.cover === "none"` (`Cover.NONE`).
 *
 * The original cover component `Q` short-circuits before rendering anything:
 *
 *   if (t?.cover == E.NONE) return null;
 *   (`app/_reference/PlayerWindows98-ChpRHqWu.js:207`)
 *
 * This reproduces that exactly: the component renders NO node, so
 * `settings.cover = "none"` produces no cover subtree (no cover element, no
 * glow, no album art). The dispatch (`app/src/amuse/covers/index.tsx`) maps
 * `Cover.NONE` to this component, so selecting "none" removes the cover node
 * from the widget entirely.
 */

export function NoneCover() {
  return null;
}
