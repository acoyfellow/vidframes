import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'site',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        home: resolve(import.meta.dirname, 'site/index.html'),
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5374,
  },
});
