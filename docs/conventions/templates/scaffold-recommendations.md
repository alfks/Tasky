<!-- 읽기 조건: Next.js 스캐폴딩 티켓(chore/scaffold-nextjs)을 수행할 때만 읽는다. -->

# 스캐폴딩 권장안 (package.json / vitest.config.ts)
#### 3.15-d `package.json` 권장안 (scripts + 의존성 — 스캐폴딩 결과에 **병합**)

```json
{
  "name": "tasky",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@10.9.0",
  "engines": { "node": ">=22 <23" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --max-warnings=0",
    "lint:fix": "eslint . --fix",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "check": "pnpm lint && pnpm typecheck && pnpm test",
    "check:words": "bash scripts/check-forbidden-words.sh",
    "check:author": "bash scripts/check-author.sh main",
    "check:agents": "bash scripts/check-agents-md.sh",
    "check:all": "pnpm check:words && pnpm check:agents && pnpm check",
    "setup": "bash scripts/setup.sh",
    "wt": "bash scripts/wt.sh"
  },
  "dependencies": {
    "next": "15.x",
    "react": "19.x",
    "react-dom": "19.x",
    "dexie": "^4",
    "zustand": "^5",
    "nanoid": "^5",
    "clsx": "^2",
    "tailwind-merge": "^3",
    "@serwist/next": "^9"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/node": "^22",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "15.x",
    "@eslint/eslintrc": "^3",
    "eslint-config-prettier": "^10",
    "prettier": "^3",
    "prettier-plugin-tailwindcss": "^0.6",
    "tailwindcss": "^4",
    "@tailwindcss/postcss": "^4",
    "vitest": "^3",
    "@vitest/coverage-v8": "^3",
    "jsdom": "^26",
    "@testing-library/react": "^16",
    "@testing-library/jest-dom": "^6",
    "@testing-library/user-event": "^14",
    "fake-indexeddb": "^6",
    "@playwright/test": "^1",
    "serwist": "^9"
  }
}
```
- 버전은 스캐폴딩 시점의 최신 안정판으로 `pnpm add`가 확정한다(위는 메이저 고정 의도만). `packageManager`의 정확한 pnpm 버전은 `pnpm --version` 출력으로 채운다.
- Playwright는 스캐폴딩 티켓에 넣지 않고 별도 `test/e2e-smoke` 티켓에서 추가해도 된다(그때 `tests/AGENTS.md`도 생성).

#### 3.15-e `vitest.config.ts` 권장안 (스캐폴딩 티켓에서 생성)

```ts
// 읽기 조건: 테스트 러너 설정 변경 시.
import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['**/*.slow.test.*', 'tests/**', 'node_modules/**', '.worktrees/**'],
    coverage: { provider: 'v8', include: ['src/domain/**', 'src/repositories/**', 'src/lib/**'], reporter: ['text-summary'] },
  },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
});
```
(`@vitejs/plugin-react`를 devDependencies에 추가.)

