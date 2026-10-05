import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import WidgetRoot from './WidgetRoot';
import { amuseProfileRoute, amuseTokenRoute, createAppRouter } from '../router';

/**
 * Task 6 guard: both overlay routes must resolve to the SAME widget root
 * component and expose the route params (widget_token + optional profile_id).
 *
 * Original overlay routes (widget/overlay.html manifest + main-Dx8nN5Es.js):
 *   /widget/amuse/$widget_token
 *   /widget/amuse/$widget_token/$profile_id
 */

// framer-motion probes prefers-reduced-motion via matchMedia, which jsdom lacks.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

afterEach(cleanup);

async function renderAt(path: string) {
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [path] }),
  );
  await router.load();
  render(<RouterProvider router={router} />);
  return screen.findByTestId('amuse-widget-root');
}

describe('widget overlay routes', () => {
  it('both routes point at the same component (WidgetRoot)', () => {
    expect(amuseTokenRoute.options.component).toBe(WidgetRoot);
    expect(amuseProfileRoute.options.component).toBe(WidgetRoot);
    expect(amuseTokenRoute.options.component).toBe(
      amuseProfileRoute.options.component,
    );
  });

  it('mounts the root at /widget/amuse/$widget_token and exposes widget_token', async () => {
    const root = await renderAt('/widget/amuse/local');
    expect(root).toBeTruthy();
    expect(root.getAttribute('data-widget-token')).toBe('local');
    expect(root.getAttribute('data-profile-id')).toBe('');
    // The root now mounts the player wrapper (`Player`) instead of the old
    // placeholder; the layout shell (`h-full w-full`) is always present.
    expect(root.querySelector('div.h-full.w-full')).toBeTruthy();
  });

  it('mounts the same root at /widget/amuse/$widget_token/$profile_id and exposes both params', async () => {
    const root = await renderAt('/widget/amuse/local/my-profile');
    expect(root.getAttribute('data-widget-token')).toBe('local');
    expect(root.getAttribute('data-profile-id')).toBe('my-profile');
  });
});
