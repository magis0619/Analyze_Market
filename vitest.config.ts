import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // 'server-only' は Next.js のビルド時ガード。vitest には RSC の概念がないため
      // そのまま import すると必ず落ちる。テスト時は no-op に差し替える。
      'server-only': new URL('./src/test/server-only-stub.ts', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
