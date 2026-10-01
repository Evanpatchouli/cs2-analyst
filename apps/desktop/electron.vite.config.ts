import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

const resolvePath = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  main: {
    build: {
      outDir: 'dist/electron',
      rollupOptions: {
        input: resolvePath('./electron/main.ts'),
      },
    },
  },
  preload: {
    build: {
      outDir: 'dist/preload',
      rollupOptions: {
        input: resolvePath('./preload/index.ts'),
        output: {
          format: 'cjs',
          entryFileNames: 'index.cjs',
        },
      },
    },
  },
  renderer: {
    root: resolvePath('./renderer'),
    base: './',
    plugins: [react()],
    build: {
      outDir: resolvePath('./dist/renderer'),
      rollupOptions: {
        input: resolvePath('./renderer/index.html'),
      },
    },
  },
});
