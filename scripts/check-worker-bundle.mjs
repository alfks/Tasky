#!/usr/bin/env node
// 읽기 조건: Worker 번들에 무엇이 새는지 확인할 때, 또는 이 검사가 실패했을 때.
// `pnpm build && pnpm run deploy:dry-run` 이 만든 `dist/dry-run/*.js` 를 본다(실제 배포는 파일을
// 로컬에 남기지 않으므로 이 산출물이 유일한 검사 지점이다). 셋을 확인한다:
//   1) `.vectors.ts`(테스트 전용 판정 고정 벡터)의 표식 `[vectors] ` 이 새지 않았다(§A-3).
//   2) `@/infra/**`·`@/features/**` 흔적(별칭 해석 뒤에도 남는 디렉토리 이름 문자열)이 없다 —
//      worker/** 는 domain 만 import 할 수 있어야 한다(eslint.config.mjs worker 블록의 런타임 대조).
//   3) `wrangler.jsonc` 가 `main`+`run_worker_first`(두 패턴 다 `/api/*`·`/auth/*`)를 갖고 있다.
// 사용법: node scripts/check-worker-bundle.mjs   (package.json 없거나 dist/dry-run 없으면 SKIP)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const write = (line) => process.stdout.write(`${line}\n`);

const ROOT = new URL('..', import.meta.url).pathname;
const DRY_RUN_DIR = join(ROOT, 'dist/dry-run');

if (!existsSync(DRY_RUN_DIR)) {
  write(
    'SKIP: dist/dry-run 이 없습니다 — 먼저 `pnpm build && pnpm run deploy:dry-run` 을 실행하세요.',
  );
  process.exit(0);
}

const jsFiles = readdirSync(DRY_RUN_DIR).filter((f) => f.endsWith('.js'));
if (jsFiles.length === 0) {
  console.error(
    'FAIL: dist/dry-run 에 .js 파일이 없습니다 — deploy:dry-run 이 실패했을 수 있습니다.',
  );
  process.exit(1);
}

let bad = false;
for (const file of jsFiles) {
  const text = readFileSync(join(DRY_RUN_DIR, file), 'utf-8');
  if (text.includes('[vectors] ')) {
    console.error(
      `FAIL: ${file} 에 '[vectors] ' 표식이 있습니다 — *.vectors.ts 가 Worker 번들에 샜습니다(§A-3).`,
    );
    bad = true;
  }
  for (const needle of ['@/infra/', '@/features/', 'src/infra/', 'src/features/']) {
    if (text.includes(needle)) {
      console.error(
        `FAIL: ${file} 에 '${needle}' 흔적이 있습니다 — worker/** 는 domain 만 import 해야 합니다.`,
      );
      bad = true;
    }
  }
}
if (bad) process.exit(1);
write(
  `PASS: Worker 번들(${jsFiles.length}개 파일) — [vectors] 표식 없음, @/infra·@/features 흔적 없음`,
);

// --- wrangler.jsonc: main + run_worker_first 두 패턴(돌연변이 9, run_worker_first 에서 "/auth/*" 를
// 지우면 여기가 빨개진다) ---
const wranglerSource = readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf-8').replace(
  /^\s*\/\/.*$/gm,
  '',
);
if (!/"main"\s*:\s*"worker\/index\.ts"/.test(wranglerSource)) {
  console.error('FAIL: wrangler.jsonc 에 "main": "worker/index.ts" 가 없습니다.');
  process.exit(1);
}
if (!/"run_worker_first"\s*:\s*\[[^\]]*"\/api\/\*"[^\]]*\]/.test(wranglerSource)) {
  console.error('FAIL: wrangler.jsonc 의 run_worker_first 에 "/api/*" 가 없습니다.');
  process.exit(1);
}
if (!/"run_worker_first"\s*:\s*\[[^\]]*"\/auth\/\*"[^\]]*\]/.test(wranglerSource)) {
  console.error('FAIL: wrangler.jsonc 의 run_worker_first 에 "/auth/*" 가 없습니다.');
  process.exit(1);
}
write('PASS: wrangler.jsonc — main + run_worker_first(두 패턴: /api/*, /auth/*)');
