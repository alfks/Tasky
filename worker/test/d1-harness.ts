// 실 D1 테스트 하네스 — `getPlatformProxy`(wrangler, 로컬 Miniflare D1)로 진짜 D1Database 를
// 띄운다. `persist` 옵션·`D1Database.exec` 둘 다 이 PR 에서 직접 확인했다(probe 스크립트 실행
// 결과, PR 본문에 기록) — 막히면 `wrangler d1 execute --local --file` 을 `execFileSync` 로 대체.
//
// 테스트마다 독립 임시 디렉토리를 써서 서로 격리한다(worker/test/** 는 eslint worker 블록의 경계
// 제한 밖 — src/test/** 와 같은 원칙).
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getPlatformProxy } from 'wrangler';

const MIGRATION_SQL = readFileSync(
  join(new URL('.', import.meta.url).pathname, '../db/migrations/0001_init.sql'),
  'utf-8',
);

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
  await db.exec(MIGRATION_SQL.replace(/--.*$/gm, '').replace(/\n/g, ' '));
  return {
    db,
    dispose: async () => {
      await proxy.dispose();
      rmSync(persistDir, { recursive: true, force: true });
    },
  };
}
