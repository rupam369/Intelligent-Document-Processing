import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite configuration.
 *
 * The dev server proxies every /api request to the Express backend so the
 * browser never needs to know where the backend lives (and no API key ever
 * reaches the client).
 */
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    // Ports are overridable so the bundled start script can run several copies.
    port: Number(process.env.VITE_PORT || 5173),
    strictPort: false,
    // Accept requests addressed to any host (needed for sandbox/preview hosts).
    // This only affects the local dev server - production builds are static.
    allowedHosts: true,
    proxy: {
      '/api': {
        target:
          process.env.VITE_API_PROXY_TARGET ||
          `http://localhost:${process.env.API_PORT || 5000}`,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: Number(process.env.VITE_PREVIEW_PORT || 4173),
    allowedHosts: true,
    // `vite preview` does not inherit `server.proxy`, so repeat it here.
    proxy: {
      '/api': {
        target:
          process.env.VITE_API_PROXY_TARGET ||
          `http://localhost:${process.env.API_PORT || 5000}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
