import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Keep API requests same-origin so mobile devices use the host's backend.
export default defineConfig({
  plugins: [react()],
  build: {
    // The Three.js runtime is 690 KB minified but 179 KB gzipped and is lazy-loaded only near the viewer.
    chunkSizeWarningLimit: 750,
    rollupOptions: {
      output: {
        manualChunks(id) {
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
