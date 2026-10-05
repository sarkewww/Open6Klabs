import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Keep the stylesheet cascade in the exact order of the original widget overlay
 * head (widget/overlay.html):
 *
 *   critical-fonts -> fa6 -> Tailwind v4 sheet -> main-Dj8S0xjW
 *     -> AmuseWidget -> PlayerWindows98
 *
 * The Tailwind sheet is linked in index.html (`/src/styles/tailwind.css`) rather
 * than imported from main.tsx, but Vite's build still relocates the generated
 * CSS `<link>` to the end of <head>. This build-only plugin moves that generated
 * link back to slot 3 (right after /css/fa6.css, before /assets/main-Dj8S0xjW.css).
 *
 * The widget/player sheets are published as static /css files (see
 * tools/sync-assets.mjs) so Vite leaves them exactly where index.html puts them
 * instead of merging them into the generated Tailwind sheet.
 */
function amuseCssChainOrder(): Plugin {
  const GENERATED_LINK = /<link\b[^>]*rel="stylesheet"[^>]*crossorigin[^>]*>/;
  const FA6_LINK = /(<link\b[^>]*href="\/css\/fa6\.css"[^>]*>)/;
  return {
    name: 'amuse-css-chain-order',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const generated = html.match(GENERATED_LINK);
        if (!generated) {
          throw new Error(
            'amuse-css-chain-order: generated Tailwind <link> not found',
          );
        }
        const tag = generated[0];
        const withoutGenerated = html.replace(tag, '');
        if (!FA6_LINK.test(withoutGenerated)) {
          throw new Error(
            'amuse-css-chain-order: /css/fa6.css anchor not found',
          );
        }
        return withoutGenerated.replace(FA6_LINK, `$1\n    ${tag}`);
      },
    },
  };
}

// Port 5200 to avoid clashing with panel (:5174) / widget (:5199).
// Only /api is proxied to the local mock backend (:8787).
// /assets, /webfonts and /widget are intentionally NOT proxied: the rewrite
// self-hosts every asset (publicDir = app/public) so dev and preview resolve
// resources from the same origin.
export default defineConfig({
  plugins: [react(), tailwindcss(), amuseCssChainOrder()],
  publicDir: 'public',
  build: {
    // Keep build output out of app/public/assets so it never collides with the
    // self-hosted original assets copied by tools/sync-assets.mjs.
    assetsDir: 'static',
  },
  server: {
    port: 5200,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  // Production hosting of the rewrite: `vite preview` serves the built SPA at
  // /widget/amuse/:widget_token[/:profile_id] (SPA fallback) on the SAME port
  // as dev (:5200) and proxies /api/* to the mock backend (:8787) — so the
  // rewrite can be hosted alongside the original widget-server (:5199) for
  // parity runs (tools/parity/dev-parity.mjs).
  preview: {
    port: 5200,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
