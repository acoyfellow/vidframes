import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'node:path';

// Cloudflare assets serves /costs.html at /costs in production.
// This makes the Vite dev server do the same so links match.
function prettyDocs(): Plugin {
  const routes = ['/architecture', '/costs'];
  return {
    name: 'pretty-docs',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const path = req.url?.split('?')[0];
        if (path && routes.includes(path)) {
          req.url = `${path}.html`;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  root: 'site',
  plugins: [prettyDocs()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        home: resolve(import.meta.dirname, 'site/index.html'),
        architecture: resolve(import.meta.dirname, 'site/architecture.html'),
        costs: resolve(import.meta.dirname, 'site/costs.html'),
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5374,
  },
});
