import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// Flat ESLint config for the rewrite app. Lints the authored TypeScript/TSX
// surface only: the gitignored `_reference/` capture (minified original
// bundles), the Vite `dist/` output, and the regenerable `public/` asset layer
// are all ignored. `tsc --noEmit` remains the strict type gate; this config is
// the syntax/style lint gate that runs alongside it in `pnpm --dir app verify`.
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'public/**',
      '_reference/**',
      'src/**/__snapshots__/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // Honour the `_`-prefix convention for intentionally-unused bindings
      // (no-op stub params, destructuring discards) without weakening the
      // rule for genuinely dead code.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
