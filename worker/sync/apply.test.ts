// `server-rules.vectors.ts` 를 실 D1 위에서 세 번째로 돈다(도메인 단위 테스트·메모리 가짜 서버에
// 이어) — 같은 벡터 파일을 세 계층이 공유한다(SYNC_DESIGN.md §0 결론 9). `worker/db/entities.ts
// #pushOne` 을 직접 부른다(라우터를 거치지 않음 — SQL 층만 겨냥).
//
// **돌연변이 2·3·7·8** 의 목표 테스트도 여기 있다: (2) ON CONFLICT DO NOTHING→DO UPDATE 로 바꾸면
// #2·#3 벡터가 빨개진다, (3) seq 서브쿼리를 상수 1 로 바꾸면 "500건 서로 다른 seq" 가 빨개진다,
// (7) `device_id <> ?` 를 지우면 "자기 변경은 풀에 안 온다" 가 빨개진다, (8) `cursor < gcFloor`
// 분기를 지우면 resync 테스트가 빨개진다.
//
// **저장된 `updated_at` 컬럼 값도 벡터마다 직접 확인한다**(`applied` 인 벡터만) — `server-rules.ts
// #applyServerRules` 는 판정(`insert`/`update`/…)만 정하고 "저장되는 값이 클램프됐는가"는 보지
// 않는다(그 함수는 순수 판정기고, 생성 시도의 저장값 클램프는 애초에 그 함수가 손대지 않는
// 영역이다). 그래서 `expected` 일치만으로는 §0 상태 블록 1번 버그(`pushOne` 이 생성 경로에서
// `clampFutureUpdatedAt` 을 건너뛰어 미래 시각이 그대로 저장되는 것)를 잡지 못한다 — 이 파일이
// 실제로 저장된 컬럼을 읽어 `clampFutureUpdatedAt(change.updatedAt, receivedAt)` 와 비교하는 것이
// 그 버그의 유일한 회귀 방지선이다(생성 경로에서 클램프를 다시 빼면 이 assertion 이 빨개진다).
import { describe, expect, it } from 'vitest';

import { clampFutureUpdatedAt } from '@/domain/sync/server-rules';
import { SERVER_RULE_VECTORS } from '@/domain/sync/server-rules.vectors';
import type { SyncOkResponse } from '@/domain/sync/wire';

import { makeSettings } from '@/test/fixtures/settings';

import { handleSync } from './handler';
import { deleteAllForUser, gcFloor, pull, pushOne, touchDevice } from '../db/entities';
import { forUser } from '../db/user-db';
import { createD1Fixture, type D1Fixture } from '../test/d1-harness';

async function seedUser(fx: D1Fixture, sub: string, now: string) {
  await fx.db
    .prepare('INSERT INTO users (sub, email, created_at) VALUES (?, ?, ?)')
    .bind(sub, `${sub}@x.com`, now)
    .run();
}

async function seedExisting(
  fx: D1Fixture,
  sub: string,
  row: { tbl: string; id: string; deleted: boolean; updatedAt: string },
) {
  await fx.db
    .prepare(
      `INSERT INTO entities (sub, tbl, id, seq, deleted, device_id, updated_at, body)
       VALUES (?, ?, ?, (SELECT COALESCE(MAX(seq),0)+1 FROM entities WHERE sub = ?), ?, 'seed-device', ?, '{}')`,
    )
    .bind(sub, row.tbl, row.id, sub, row.deleted ? 1 : 0, row.updatedAt)
    .run();
}

describe('SERVER_RULE_VECTORS — 실 D1', () => {
  // 마이그레이션과 19개 실 D1 벡터를 순차 검증하는 fixture 한도(제품 성능 기준 아님).
  it('벡터 각각이 D1 위에서 같은 결과를 낸다(도메인 판정과 SQL 결과가 일치)', async () => {
    const fx = await createD1Fixture();
    try {
      const sub = 'vectors-user';
      await seedUser(fx, sub, '2026-01-01T00:00:00.000Z');
      // 벡터는 도메인 단위 테스트에서는 서로 독립(순수 함수 호출)이지만, 여기서는 실제로 로우를
      // 쓰는 D1 위에서 **순차** 실행한다 — 서로 다른 벡터가 같은 id 를 의도적으로 재사용하므로
      // (예: id 'a' 가 벡터 1·2·3 에 각각 나온다), id 를 벡터 순번으로 이름공간을 나눠 서로
      // 간섭하지 않게 한다(실측: 이름공간을 안 나누면 두 번째 벡터에서 PRIMARY KEY 충돌).
      for (const [index, vector] of SERVER_RULE_VECTORS.entries()) {
        const id = `v${index}-${vector.change.id}`;
        if (vector.existing) {
          await seedExisting(fx, sub, {
            tbl: vector.existing.tbl,
            id,
            deleted: vector.existing.deleted,
            updatedAt: vector.existing.updatedAt,
          });
        }
        const outcome = await pushOne(
          fx.db,
          sub,
          'push-device',
          {
            tbl: vector.change.tbl,
            id,
            baseSeq: vector.change.baseSeq,
            updatedAt: vector.change.updatedAt,
            deleted: false,
            bodyJson: '{}',
          },
          vector.receivedAt,
        );
        const actual =
          outcome.kind === 'applied'
            ? vector.existing
              ? 'update'
              : 'insert'
            : (`reject-${outcome.reason}` as const);
        expect(actual, vector.name).toBe(vector.expected);
        if (outcome.kind === 'applied') {
          // 판정이 아니라 **저장된 값**을 본다 — 위 파일 jsdoc: 생성 경로 클램프 누락(§0 상태
          // 블록 1번)은 `expected` 만으로는 안 잡힌다.
          const stored = await fx.db
            .prepare('SELECT updated_at FROM entities WHERE sub = ? AND tbl = ? AND id = ?')
            .bind(sub, vector.change.tbl, id)
            .first<{ updated_at: string }>();
          const expectedStored = clampFutureUpdatedAt(vector.change.updatedAt, vector.receivedAt);
          expect(stored?.updated_at, `${vector.name} (저장된 updated_at)`).toBe(expectedStored);
        }
      }
    } finally {
      await fx.dispose();
    }
  }, 30_000);
});

describe('seq — 단조 증가 · 배치 내 유일', () => {
  it('500건을 순차로 밀어 넣으면 500개 서로 다른 seq 를 오름차순으로 받는다', async () => {
    const fx = await createD1Fixture();
    try {
      const sub = 'seq-user';
      await seedUser(fx, sub, '2026-01-01T00:00:00.000Z');
      const seqs: number[] = [];
      for (let i = 0; i < 500; i++) {
        const outcome = await pushOne(
          fx.db,
          sub,
          'dev',
          {
            tbl: 'todos',
            id: `seq-${i}`,
            baseSeq: 0,
            updatedAt: '2026-01-01T00:00:00.000Z',
            deleted: false,
            bodyJson: '{}',
          },
          '2026-01-01T00:00:00.000Z',
        );
        expect(outcome.kind).toBe('applied');
        if (outcome.kind === 'applied') seqs.push(outcome.seq);
      }
      expect(new Set(seqs).size).toBe(500);
      expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    } finally {
      await fx.dispose();
    }
  }, 30000);
});

describe('격리 — 실 D1 두 사용자', () => {
  it('A 의 푸시가 B 의 풀에 오지 않는다(다른 sub)', async () => {
    const fx = await createD1Fixture();
    try {
      await seedUser(fx, 'user-a', '2026-01-01T00:00:00.000Z');
      await seedUser(fx, 'user-b', '2026-01-01T00:00:00.000Z');
      await pushOne(
        fx.db,
        'user-a',
        'dev-a',
        {
          tbl: 'todos',
          id: 'shared-id',
          baseSeq: 0,
          updatedAt: '2026-01-01T00:00:00.000Z',
          deleted: false,
          bodyJson: '{"owner":"a"}',
        },
        '2026-01-01T00:00:00.000Z',
      );
      const bPulled = await pull(fx.db, 'user-b', 0, 'dev-b', 500);
      expect(bPulled).toEqual([]);

      // B 가 같은 id 로 생성해도 A 의 로우와 충돌하지 않는다(PK 가 (sub,tbl,id)).
      const bOutcome = await pushOne(
        fx.db,
        'user-b',
        'dev-b',
        {
          tbl: 'todos',
          id: 'shared-id',
          baseSeq: 0,
          updatedAt: '2026-01-01T00:00:00.000Z',
          deleted: false,
          bodyJson: '{"owner":"b"}',
        },
        '2026-01-01T00:00:00.000Z',
      );
      expect(bOutcome.kind).toBe('applied');

      const aPulled = await pull(fx.db, 'user-a', 0, 'other-a-device', 500);
      expect(aPulled).toHaveLength(1);
      expect(JSON.parse(aPulled[0]!.body)).toEqual({ owner: 'a' });
    } finally {
      await fx.dispose();
    }
  });
});

describe('풀 — 자기 기기 제외 · gcFloor · 계정 삭제', () => {
  it('자기 기기가 쓴 로우는 자기 풀에 안 온다(device_id <> ?)', async () => {
    const fx = await createD1Fixture();
    try {
      const sub = 'self-exclude-user';
      await seedUser(fx, sub, '2026-01-01T00:00:00.000Z');
      await pushOne(
        fx.db,
        sub,
        'dev-self',
        {
          tbl: 'todos',
          id: 'x',
          baseSeq: 0,
          updatedAt: '2026-01-01T00:00:00.000Z',
          deleted: false,
          bodyJson: '{}',
        },
        '2026-01-01T00:00:00.000Z',
      );
      const selfPull = await pull(fx.db, sub, 0, 'dev-self', 500);
      expect(selfPull).toEqual([]);
      const otherPull = await pull(fx.db, sub, 0, 'dev-other', 500);
      expect(otherPull).toHaveLength(1);
    } finally {
      await fx.dispose();
    }
  });

  it('gcFloor 는 users.gc_floor 를 그대로 읽는다', async () => {
    const fx = await createD1Fixture();
    try {
      await seedUser(fx, 'gc-user', '2026-01-01T00:00:00.000Z');
      expect(await gcFloor(fx.db, 'gc-user')).toBe(0);
      await fx.db.prepare('UPDATE users SET gc_floor = ? WHERE sub = ?').bind(42, 'gc-user').run();
      expect(await gcFloor(fx.db, 'gc-user')).toBe(42);
    } finally {
      await fx.dispose();
    }
  });

  it('deleteAllForUser — entities·devices 가 명시 DELETE 로 비워진다', async () => {
    const fx = await createD1Fixture();
    try {
      const sub = 'delete-user';
      await seedUser(fx, sub, '2026-01-01T00:00:00.000Z');
      await touchDevice(fx.db, sub, 'dev-1', '2026-01-01T00:00:00.000Z');
      await pushOne(
        fx.db,
        sub,
        'dev-1',
        {
          tbl: 'todos',
          id: 'x',
          baseSeq: 0,
          updatedAt: '2026-01-01T00:00:00.000Z',
          deleted: false,
          bodyJson: '{}',
        },
        '2026-01-01T00:00:00.000Z',
      );
      await deleteAllForUser(fx.db, sub);
      const entities = await fx.db
        .prepare('SELECT COUNT(*) c FROM entities WHERE sub = ?')
        .bind(sub)
        .first<{ c: number }>();
      const devices = await fx.db
        .prepare('SELECT COUNT(*) c FROM devices WHERE sub = ?')
        .bind(sub)
        .first<{ c: number }>();
      expect(entities?.c).toBe(0);
      expect(devices?.c).toBe(0);
    } finally {
      await fx.dispose();
    }
  });
});

/**
 * 프로필 세 필드(ADR-0023 규칙 3·6) — **배포될 Worker 번들이 세 필드를 살려 저장한다는 증거는 이
 * 테스트뿐이다.** `handleSync` 는 `readRemoteRow` → `readSettings`(`SETTINGS_KEYS` 화이트리스트)로
 * 걸러 D1 에 저장하므로, 화이트리스트에 세 필드가 없는 옛 Worker 는 `applied` 를 돌려주면서 조용히
 * 떼어 낸다(그래서 재배포가 출시 조건이다). 벡터 파일(`server-rules.vectors.ts`)은 LWW 규칙용이라
 * 여기 화이트리스트 검사는 벡터 대상이 아니다 — 벡터를 복사하지도 늘리지도 않는다.
 */
describe('프로필 세 필드 — 푸시 → D1 저장 → 풀 왕복 (profile.md R8 · ADR-0023 규칙 3)', () => {
  const NOW = '2026-09-29T00:00:00.000Z';
  const AVATAR = 'data:image/webp;base64,AAAA';

  async function roundTrip(fx: D1Fixture, sub: string, row: Record<string, unknown>) {
    const pushed = await handleSync(
      {
        protocol: 1,
        deviceId: 'dev-a',
        cursor: 0,
        changes: [{ tbl: 'settings', id: 'default', baseSeq: 0, row }],
      },
      forUser(fx.db, sub),
      NOW,
    );
    expect(pushed.status).toBe(200);
    const pushResponse = pushed.response as SyncOkResponse;
    expect(pushResponse.applied).toHaveLength(1);
    expect(pushResponse.rejected).toEqual([]);
    const pulled = await handleSync(
      { protocol: 1, deviceId: 'dev-b', cursor: 0, changes: [] },
      forUser(fx.db, sub),
      NOW,
    );
    const pullResponse = pulled.response as SyncOkResponse;
    expect(pullResponse.pulled).toHaveLength(1);
    return pullResponse.pulled[0]!.row as Record<string, unknown>;
  }

  it('유효한 세 필드가 살아남고, 앞뒤 공백 있는 이름은 받은 값 그대로다', async () => {
    const fx = await createD1Fixture();
    try {
      await seedUser(fx, 'profile-user', NOW);
      const stored = await roundTrip(
        fx,
        'profile-user',
        makeSettings({
          profileName: ' 밀리 ',
          profileBio: '오늘도 한 칸씩',
          profileAvatar: AVATAR,
        }),
      );
      expect(stored).toMatchObject({
        profileName: ' 밀리 ',
        profileBio: '오늘도 한 칸씩',
        profileAvatar: AVATAR,
        accentColor: makeSettings().accentColor,
      });
    } finally {
      await fx.dispose();
    }
  });

  it('잘못된 profileAvatar 는 그 필드만 떼고 행은 applied — 이름·테마는 저장된다', async () => {
    const fx = await createD1Fixture();
    try {
      await seedUser(fx, 'profile-user-2', NOW);
      const stored = await roundTrip(
        fx,
        'profile-user-2',
        makeSettings({
          theme: 'dark',
          profileName: '밀리',
          profileAvatar: 'data:image/png;base64,AAAA',
        }),
      );
      expect(stored).toMatchObject({ theme: 'dark', profileName: '밀리' });
      expect('profileAvatar' in stored).toBe(false);
    } finally {
      await fx.dispose();
    }
  });
});
