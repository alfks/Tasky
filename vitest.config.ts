// 읽기 조건: 테스트 러너 설정 변경 시.
import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const config = defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['**/*.slow.test.*', '**/__arch__/**', 'tests/**', 'node_modules/**', '.worktrees/**'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/repositories/**', 'src/lib/**'],
      reporter: ['text-summary'],
    },
  },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
});

export default config;
