// 실 D1 테스트 하네스 — `getPlatformProxy`(wrangler, 로컬 Miniflare D1)로 진짜 D1Database 를
// 띄운다. `persist` 옵션·`D1Database.exec` 둘 다 이 PR 에서 직접 확인했다(probe 스크립트 실행
// 결과, PR 본문에 기록) — 막히면 `wrangler d1 execute --local --file` 을 `execFileSync` 로 대체.
//
// 테스트마다 독립 임시 디렉토리를 써서 서로 격리한다(worker/test/** 는 eslint worker 블록의 경계
// 제한 밖 — src/test/** 와 같은 원칙).
//
// **모든 마이그레이션 파일을 정렬 순서로 적용한다**(리뷰에서 지적됨) — `0001_init.sql` 하나만
// 하드코딩했던 옛 판은 `0002_*.sql` 이 생기는 순간 그 파일을 조용히 건너뛰어, 모든 Worker 테스트가
// 새 스키마 없이 낡은 스키마 위에서 초록불을 내는 함정이었다(CLAUDE.md 의 `eslint-config-next`
// 사고와 같은 부류 — 검사는 도는데 실제로는 아무것도 검증하지 않는다).
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getPlatformProxy } from 'wrangler';

const MIGRATIONS_DIR = join(new URL('.', import.meta.url).pathname, '../db/migrations');

function readAllMigrationsSql(): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  return files.map((name) => readFileSync(join(MIGRATIONS_DIR, name), 'utf-8')).join('\n');
}

export type D1Fixture = { db: D1Database; dispose: () => Promise<void> };

export async function createD1Fixture(): Promise<D1Fixture> {
  const persistDir = mkdtempSync(join(tmpdir(), 'tasky-d1-test-'));
  const proxy = await getPlatformProxy({
    configPath: join(new URL('.', import.meta.url).pathname, '../../wrangler.jsonc'),
    persist: { path: persistDir },
  });
  const db = proxy.env.DB as D1Database;
  // 마이그레이션은 주석 줄을 지우고 한 줄로 합쳐 exec 에 넘긴다(D1Database.exec 는 세미콜론으로
  // 구분된 여러 문장을 한 번에 받는다 — probe 스크립트로 확인).
  await db.exec(readAllMigrationsSql().replace(/--.*$/gm, '').replace(/\n/g, ' '));
  return {
    db,
    dispose: async () => {
      await proxy.dispose();
      rmSync(persistDir, { recursive: true, force: true });
    },
  };
}
