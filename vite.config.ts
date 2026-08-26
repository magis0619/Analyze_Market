import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    rollupOptions: {
      // 移行中は canvas 版と three.js 版を併存させる
      input: { main: 'index.html', next: 'index2.html' }
    }
  },
  server: {
    host: true
  }
});
