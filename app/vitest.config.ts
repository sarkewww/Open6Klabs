import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Vitest config for app/. `globals: false` — every test imports its
// describe/it/expect from 'vitest' explicitly. `environment: 'jsdom'` so the
// upcoming component tasks (17-28) can render React into a DOM.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
  },
});
