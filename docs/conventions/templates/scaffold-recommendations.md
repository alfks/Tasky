<!-- 읽기 조건: Next.js 스캐폴딩 티켓(chore/scaffold-nextjs)을 수행할 때만 읽는다. -->

# 스캐폴딩 권장안 (package.json / vitest.config.ts / 완료 조건)

**스캐폴딩 전에는 린트가 존재하지 않는다.** `package.json`이 없는 동안 CI `build` 잡은 건너뛰고 `docs/ARCHITECTURE.md` §1의 레이어 경계는 문서일 뿐이다. 이 티켓이 머지되기 전에는 `src/` 코드 티켓을 발행하지 않는다.

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
    "check": "pnpm lint && pnpm check:arch && pnpm typecheck && pnpm test",
    "check:words": "bash scripts/check-forbidden-words.sh",
    "check:author": "bash scripts/check-author.sh main",
    "check:agents": "bash scripts/check-agents-md.sh",
    "check:disable": "bash scripts/check-eslint-disable.sh",
    "check:arch": "bash scripts/check-arch.sh",
    "check:all": "pnpm check:words && pnpm check:agents && pnpm check:disable && pnpm check",
    "setup": "bash scripts/setup.sh",
    "wt": "bash scripts/wt.sh"
  },
  "dependencies": {
    "next": "15.x",
    "react": "19.x",
    "react-dom": "19.x",
    "dexie": "^4",
    "zustand": "^5",
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
    "@vitejs/plugin-react": "^4",
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
- ID는 `crypto.randomUUID()`(ADR-0005) — `nanoid`를 넣지 않는다.
- 레이어 경계 린트(`import/no-restricted-paths`, `import/no-unresolved`)는 `eslint-config-next`가 함께 설치하는 `eslint-plugin-import`(≥2.31)와 `eslint-import-resolver-typescript`를 쓴다. **추가 devDependency 없음.** 리졸버 설정도 `next/core-web-vitals`가 절대 경로 키로 주입하므로 `eslint.config.mjs`에 따로 적지 않는다.
- Playwright는 스캐폴딩 티켓에 넣지 않고 별도 `test/e2e-smoke` 티켓에서 추가해도 된다(그때 `tests/AGENTS.md`도 생성).

#### 3.15-e `vitest.config.ts` 권장안 (스캐폴딩 티켓에서 생성)

```ts
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
    coverage: { provider: 'v8', include: ['src/domain/**', 'src/repositories/**', 'src/lib/**'], reporter: ['text-summary'] },
  },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
});

export default config;
```

#### 3.15-f 스캐폴딩 완료 조건 (아키텍처 강제가 실제로 켜졌는지)

1. `src/features/{todo,category,date-strip,stats,theme}/index.ts`(빈 명시 export)와 `src/{app,components,domain,repositories,infra,lib,styles,test}/`가 `AGENTS.md`와 함께 존재한다(`scripts/check-arch.sh`는 feature 디렉토리 2개 이상을 요구).
2. `tsconfig.json`에 `"paths": { "@/*": ["./src/*"] }`. `.gitignore`에 `__arch__/` 한 줄.
3. `pnpm lint` 가 경고 0으로 통과한다(`eslint.config.mjs` 자체도 린트 대상 — `export default config` 형태 유지, 익명 배열 `export default [` 는 next 규칙 경고로 실패).
4. `bash scripts/check-arch.sh` 전 케이스 `PASS` + 마지막 줄 `OK`. 하나라도 `FAIL`이면 `eslint.config.mjs`의 해당 레이어 블록 또는 `@/` 별칭 해석(`import/no-unresolved`가 `@/` import 전체에 오탐을 내면 리졸버 문제)을 고친 뒤 머지.
5. `bash scripts/check-eslint-disable.sh` 가 `OK`. `bash scripts/check.sh main` 통과.
6. `src/**/__arch__/` 잔여물이 없다(`git status`에 나타나지 않아야 한다).
