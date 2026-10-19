import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { nitro } from 'nitro/vite';

export default defineConfig(({ command }) => ({
  plugins: [
    tailwindcss(),
    tsconfigPaths({ projects: ['./tsconfig.json'] }),
    tanstackStart({
      server: { entry: 'server' },
      importProtection: {
        behavior: 'error',
        client: { files: ['**/server/**'], specifiers: ['server-only'] },
      },
    }),
    ...(command === 'build'
      ? [nitro({ preset: process.env.VERCEL ? 'vercel' : 'node-server' })]
      : []),
    react(),
  ],
  define: { __APP_VERSION__: JSON.stringify('1.0.0') },
  resolve: { dedupe: ['react', 'react-dom', '@tanstack/react-query', '@tanstack/query-core'] },
  server: { host: '127.0.0.1', port: 3000 },
}));
