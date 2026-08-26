import { defineConfig } from 'vite';

// 島歩きは DELVERS とは別のアプリなので、vite の root ごと分けている。
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  base: './',
  build: {
    target: 'es2020',
    outDir: new URL('../dist-island/', import.meta.url).pathname,
    emptyOutDir: true
  },
  server: { host: true, port: 5174 }
});
