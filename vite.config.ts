import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    // The terrain tile reader runs in the browser (DOM canvas) and on the
    // server (napi-rs/canvas). The native addon must never be pulled into the
    // browser bundle.
    ssr: {
      external: ['@napi-rs/canvas'],
    },
    optimizeDeps: {
      exclude: ['@napi-rs/canvas'],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
