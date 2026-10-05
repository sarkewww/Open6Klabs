import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider as JotaiProvider } from 'jotai';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router';

// NOTE (Task 5): app/src/styles/tailwind.css is intentionally NOT imported here.
// It is linked in index.html as the 3rd stylesheet so the runtime cascade order
// matches the original widget overlay head exactly (critical-fonts -> fa6 ->
// Tailwind v4 sheet -> main-Dj8S0xjW -> AmuseWidget -> PlayerWindows98).
// Importing it from JS would make Vite append the generated sheet after the
// later <link>s and break that order. Do not re-add this import.
// (Task 6 extended this file with the providers below - keep this comment.)

// App-shell providers, matching the original overlay entry:
//  - jotai Provider       -> shared atom store for settings/player state
//  - QueryClientProvider  -> TanStack Query cache (axios-backed loaders)
//  - RouterProvider       -> TanStack Router (routes in ./router.tsx)
//  - framer-motion        -> no provider; imported directly by WidgetRoot
const queryClient = new QueryClient();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('[Amuse] #root element not found in index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <JotaiProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </JotaiProvider>
  </StrictMode>,
);
