import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // A string skips Vite's nearest-tsconfig lookup. Files under mobile/ extend
  // expo/tsconfig.base, which is not installed for the root test run.
  esbuild: {
    tsconfigRaw: JSON.stringify({
      compilerOptions: {
        jsx: 'react-jsx',
        target: 'ES2022',
        verbatimModuleSyntax: false,
      },
    }),
  },
  resolve: {
    // Phone files sit next to their own React. Tests must see the root copy,
    // which is the one vi.mock('react') replaces.
    dedupe: ['react'],
    alias: {
      // Phone screens import React Native. The root test run does not install Expo.
      'react-native': fileURLToPath(new URL('./tests/stubs/react-native.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@ledgerly/core/shared': fileURLToPath(
        new URL('./src/ledgerly/core/shared.ts', import.meta.url),
      ),
      '@ledgerly/core': fileURLToPath(new URL('./src/ledgerly/core/index.ts', import.meta.url)),
    },
  },

  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/routeTree.gen.ts', 'src/integrations/supabase/types.ts'],
    },
  },
});
