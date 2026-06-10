import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    emptyOutDir: false, // Keep popup, sidepanel, and content files!
    outDir: 'dist',
    lib: {
      entry: path.resolve(__dirname, 'src/background/serviceWorker.ts'),
      name: 'background',
      formats: ['iife'],
      fileName: () => 'background.js',
    },
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        extend: true,
      },
    },
  },
});
