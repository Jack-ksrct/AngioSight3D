import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Keep API requests same-origin so mobile devices use the host's backend.
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 750,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Keep loaders and controls in a separate async dependency chunk so
          // the core Three.js runtime stays below Vite's per-chunk warning.
          if (id.includes('/node_modules/three/examples/jsm/')) return 'three-addons';
          if (id.includes('/node_modules/three/')) return 'three-vendor';
          if (id.includes('/node_modules/@react-three/')) return 'react-three-vendor';
          if (id.includes('/node_modules/three-stdlib/')) return 'anatomy-utils';
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    proxy: { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true, rewrite: path => path.replace(/^\/api/, '') } },
  },
});
