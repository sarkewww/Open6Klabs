import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  type RouterHistory,
} from '@tanstack/react-router';
import WidgetRoot from './amuse/WidgetRoot';

/**
 * Code-based TanStack Router tree (no @tanstack/router-plugin / file routes).
 *
 * Mirrors the original overlay manifest (`widget/overlay.html`) which registers
 * a single `__root__` route plus the widget routes under `/widget/amuse/...`:
 *
 *   /widget/amuse/$widget_token
 *   /widget/amuse/$widget_token/$profile_id
 *
 * Both paths point at the SAME component (`WidgetRoot`), exactly like the
 * original where both route modules re-export the identical widget entry.
 */
function RootLayout() {
  return <Outlet />;
}

const rootRoute = createRootRoute({
  component: RootLayout,
});

export const amuseTokenRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/widget/amuse/$widget_token',
  component: WidgetRoot,
});

export const amuseProfileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/widget/amuse/$widget_token/$profile_id',
  component: WidgetRoot,
});

export const routeTree = rootRoute.addChildren([
  amuseTokenRoute,
  amuseProfileRoute,
]);

export function createAppRouter(history?: RouterHistory) {
  return createRouter({
    routeTree,
    ...(history ? { history } : {}),
  });
}

export const router = createAppRouter();

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
