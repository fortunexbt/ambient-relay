import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  resolve: {
    alias: { 'node:crypto': fileURLToPath(new URL('./web/src/node-crypto.js', import.meta.url)) },
  },
  server: { port: 4181, strictPort: true, fs: { allow: ['..'] } },
  preview: { port: 4182, strictPort: true },
  build: { outDir: '../dist', emptyOutDir: true },
});
