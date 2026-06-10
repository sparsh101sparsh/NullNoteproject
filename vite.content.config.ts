import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    emptyOutDir: false, // Keep popup, sidepanel, and background files!
    outDir: 'dist',
    lib: {
      entry: path.resolve(__dirname, 'src/content/index.ts'),
      name: 'content',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        extend: true,
      },
    },
  },
});
