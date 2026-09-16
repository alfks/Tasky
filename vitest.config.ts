// 읽기 조건: 테스트 러너 설정 변경 시.
import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

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
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['**/*.slow.test.*', '**/__arch__/**', 'tests/**', 'node_modules/**', '.worktrees/**'],
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
