// `server-rules.vectors.ts` 를 실 D1 위에서 세 번째로 돈다(도메인 단위 테스트·메모리 가짜 서버에
// 이어) — 같은 벡터 파일을 세 계층이 공유한다(SYNC_DESIGN.md §0 결론 9). `worker/db/entities.ts
// #pushOne` 을 직접 부른다(라우터를 거치지 않음 — SQL 층만 겨냥).
//
// **돌연변이 2·3·7·8** 의 목표 테스트도 여기 있다: (2) ON CONFLICT DO NOTHING→DO UPDATE 로 바꾸면
// #2·#3 벡터가 빨개진다, (3) seq 서브쿼리를 상수 1 로 바꾸면 "500건 서로 다른 seq" 가 빨개진다,
// (7) `device_id <> ?` 를 지우면 "자기 변경은 풀에 안 온다" 가 빨개진다, (8) `cursor < gcFloor`
// 분기를 지우면 resync 테스트가 빨개진다.
import { describe, expect, it } from 'vitest';

import { SERVER_RULE_VECTORS } from '@/domain/sync/server-rules.vectors';

import { deleteAllForUser, gcFloor, pull, pushOne, touchDevice } from '../db/entities';
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
      }
    } finally {
      await fx.dispose();
    }
  });
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
