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
const clientInclude = slowOnly ? ['src/**/*.slow.test.{ts,tsx}'] : ['src/**/*.test.{ts,tsx}'];
const clientExclude = [
  ...(slowOnly ? [] : ['**/*.slow.test.*']),
  '**/__arch__/**',
  'tests/**',
  'node_modules/**',
  '.worktrees/**',
];

// worker/**(T-93)는 jsdom 도, src/test/setup.ts 의 메모리 저장소 주입도 필요 없다 — D1 은 실제
// getPlatformProxy(로컬 Miniflare)를 쓰고, Request/Response 는 Node 20+/22 전역이다. **같은
// vitest 실행 안에서** src 와 worker 를 함께 돌리려고 `test.projects` 를 쓴다(Vitest 5 키, `--project`
// 플래그로 실측 확인) — 별도 `vitest.worker.config.ts` + `test:worker` 스크립트를 새로 만들면
// `pnpm test`(check.sh 가 부르는 그 명령) 가 worker 를 빼먹는 채로 계속 초록일 수 있어(§A-2 표의
// 함정과 같은 종류) 택하지 않았다.
const config = defineConfig({
  plugins: [react()],
  test: {
    // 두 프로젝트 다 이름을 명시한다 — 이름 없는 프로젝트가 섞이면 `--project=worker` 필터가
    // 의도와 다르게 두 프로젝트를 동시에 골라 jsdom 없이 client 테스트를 도는 사고가 났다(실측:
    // 첫 항목을 `{ extends: true }`(무명)로 두자 client 파일 217개가 environment:'node' 로 같이
    // 돌아 `document is not defined` 로 무더기 실패했다). include/exclude 도 top-level 계산값을
    // 그대로 참조해 slowOnly 스위치와 갈라지지 않게 한다.
    projects: [
      {
        extends: true,
        test: {
          name: 'client',
          environment: 'jsdom',
          include: clientInclude,
          exclude: [...clientExclude, 'worker/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'worker',
          environment: 'node',
          setupFiles: [],
          include: ['worker/**/*.test.ts'],
          // `extends: true` 가 include/exclude 배열을 **합친다**(교체가 아니라) — 실측: `include` 만
          // 좁혀도 client 의 216개 파일이 이 프로젝트에서 environment:'node' 로 다시 돌아
          // `document is not defined` 로 무더기 실패했다. `exclude: ['src/**']` 로 명시적으로
          // 막아야 실제로 걸러진다.
          exclude: [...clientExclude, 'src/**'],
          // D1 계약 테스트(worker/db/isolation.test.ts 등)가 getPlatformProxy 로 로컬 Miniflare D1 을
          // 띄운다 — 파일마다 독립 임시 디렉토리를 쓰므로 격리는 되지만, 여러 Miniflare 인스턴스를
          // 동시에 올리면 무겁다. `fileParallelism: false` 로 worker 프로젝트만 파일을 순차 실행한다
          // (Vitest 4+ 이후 `poolOptions.forks.singleFork` 대체 — 공식 마이그레이션 경고 실측).
          // client 프로젝트의 vmThreads 설정은 이 블록과 무관하게 그대로 남는다.
          pool: 'forks',
          fileParallelism: false,
        },
      },
    ],
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
    include: clientInclude,
    exclude: clientExclude,
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
