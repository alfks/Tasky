// 읽기 조건: 테스트 러너 설정 변경 시.
import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// 느린 스위트(`*.slow.test.ts`) 실행 스위치 — `pnpm test:slow` 가 `VITEST_SLOW=1` 로 켠다.
//
// **왜 설정에서 가르는가**: vitest 5 의 CLI `--exclude` 는 설정값을 덮어쓰지 않고 **더하기만** 한다(실측).
// 즉 명령줄로는 `test.exclude` 의 느린 스위트 글롭을 풀 방법이 없고, 그래서 이 스위치가 없던 동안
// 느린 스위트는 **어디서도 돌지 않았다** — `pnpm test` 에서 제외되고, CI 는 `scripts/check.sh` 의
// `pnpm test` 만 부르므로 CI 에서도 돌지 않았다. code-style §166 · TECH_PLAN §309 의 "느린 테스트는
// 분리(CI만)" 가 아무 데서도 참이 아니었다(PR #34 리뷰 라운드 1 Major 11).
//
// 켜면 **느린 것만** 돈다(`include` 가 뒤집힌다). 기본 실행에는 영향이 없다 — 환경 변수가 없으면 아래
// 두 줄은 스위치 이전과 글자 그대로 같은 값이다.
const slowOnly = process.env.VITEST_SLOW === '1';

const config = defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // 기본 pool(forks)은 테스트 파일마다 jsdom 을 새로 만든다 — 74개 파일 기준 전체 시간의 55%가
    // 환경 생성에 쓰였다(vitest 가 직접 권고를 출력한다). vmThreads 는 워커당 jsdom 을 한 번만 만들고
    // 파일마다 node:vm 컨텍스트를 새로 열어 **파일 단위 격리는 그대로 유지한다**.
    // 측정(전체 994건): 18.7s → 5.7s. 셔플 4개 시드 + 반복 5회 + 단일 워커 모두 994건 통과.
    //
    // `isolate: false` 는 검토했으나 채택하지 않는다. 모듈 레지스트리까지 공유돼 setup.ts 의
    // 레포지토리 주입과 testing-library 의 자동 cleanup 등록이 파일마다 다시 일어나지 않고,
    // 그 결과 DOM 이 파일 사이로 새어 86건이 깨진다(5.5s 로 더 빠르지만 신뢰할 수 없다).
    pool: 'vmThreads',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: slowOnly ? ['src/**/*.slow.test.{ts,tsx}'] : ['src/**/*.test.{ts,tsx}'],
    exclude: [
      ...(slowOnly ? [] : ['**/*.slow.test.*']),
      '**/__arch__/**',
      'tests/**',
      'node_modules/**',
      '.worktrees/**',
    ],
    coverage: {
      provider: 'v8',
      include: [
        'src/domain/**/*.{ts,tsx}',
        'src/repositories/**/*.{ts,tsx}',
        'src/lib/**/*.{ts,tsx}',
      ],
      // 글롭에 확장자를 박지 않으면 디렉토리의 `AGENTS.md` 까지 소스로 넘어가 v8 이 파싱하려다
      // PARSE_ERROR 를 뱉는다(수치·exit code 에는 영향이 없지만 로그를 더럽혀 진짜 오류를 묻는다).
      reporter: ['text-summary'],
    },
  },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
});

export default config;
