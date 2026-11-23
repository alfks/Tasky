// 요청 하나가 D1 에 거는 쿼리 수의 상한 — Workers 는 호출(invocation) 하나가 부를 수 있는 D1 쿼리를
// 무료 50·유료 1,000 으로 제한하고, 넘으면 Worker 가 던져 응답이 500 이 된다(`wire.ts#MAX_PUSH_CHANGES`
// jsdoc 에 사고 경위). 응답이 없으면 클라이언트는 ack 를 못 해 같은 앞부분을 영원히 다시 보내고, 그 기기는
// 보내기도 받기도 못 한다 — 그래서 "쿼리 수가 변경 수에 비례해 무한히 늘지 않는다" 를 고정한다.
import { describe, expect, it } from 'vitest';

import { MAX_PUSH_CHANGES } from '@/domain/sync/wire';
import type { SyncOkResponse } from '@/domain/sync/wire';

import { makeTodo } from '@/test/fixtures/todo';

import { handleSync } from './handler';
import { forUser } from '../db/user-db';
import { createD1Fixture } from '../test/d1-harness';

const NOW = '2026-11-23T00:00:00.000Z';
/** 무료 플랜 호출당 D1 쿼리 상한. 세션 확인(라우터, 이 테스트 밖)이 1~2번을 더 쓴다. */
const FREE_PLAN_QUERY_LIMIT = 50;
const SESSION_QUERIES = 2;

/** `prepare`·`batch` 호출 수 — 이 코드베이스는 쿼리 하나를 prepare 한 번으로 실행한다. */
function counted(db: D1Database): { db: D1Database; count: () => number } {
  let n = 0;
  const proxy = new Proxy(db, {
    get(target, prop) {
      if (prop === 'prepare' || prop === 'batch') {
        return (...args: unknown[]) => {
          n += 1;
          return (target[prop] as (...a: unknown[]) => unknown)(...args);
        };
      }
      const value = Reflect.get(target, prop) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return { db: proxy, count: () => n };
}

function createChanges(total: number, base: number) {
  return Array.from({ length: total }, (_, i) => {
    const todo = makeTodo({ seq: base + i });
    return { tbl: 'todos' as const, id: todo.id, baseSeq: 0, row: todo };
  });
}

async function withUser<T>(run: (db: D1Database) => Promise<T>): Promise<T> {
  const fx = await createD1Fixture();
  try {
    await fx.db
      .prepare('INSERT INTO users (sub, email, created_at) VALUES (?, ?, ?)')
      .bind('budget-user', 'b@x.com', NOW)
      .run();
    return await run(fx.db);
  } finally {
    await fx.dispose();
  }
}

describe('푸시 한 요청의 D1 쿼리 예산', () => {
  it('상한만큼 보내도 무료 플랜 호출당 쿼리 상한 안에 든다', async () => {
    await withUser(async (db) => {
      const c = counted(db);
      const { response } = await handleSync(
        {
          protocol: 1,
          deviceId: 'dev',
          cursor: 0,
          changes: createChanges(MAX_PUSH_CHANGES, 1000),
        },
        forUser(c.db, 'budget-user'),
        NOW,
      );
      expect((response as SyncOkResponse).applied).toHaveLength(MAX_PUSH_CHANGES);
      expect(c.count() + SESSION_QUERIES).toBeLessThanOrEqual(FREE_PLAN_QUERY_LIMIT);
    });
  });

  it('변경 한 건은 D1 쿼리 한 번이다(미리 SELECT 하지 않는다)', async () => {
    await withUser(async (db) => {
      const queriesFor = async (total: number, base: number) => {
        const c = counted(db);
        await handleSync(
          { protocol: 1, deviceId: 'dev', cursor: 0, changes: createChanges(total, base) },
          forUser(c.db, 'budget-user'),
          NOW,
        );
        return c.count();
      };
      const one = await queriesFor(1, 2000);
      const ten = await queriesFor(10, 3000);
      expect(ten - one).toBe(9);
    });
  });

  it('상한을 넘겨 보내도(옛 클라이언트의 500건) 앞의 상한만 처리하고 나머지는 응답에 없다', async () => {
    await withUser(async (db) => {
      const c = counted(db);
      const sent = createChanges(MAX_PUSH_CHANGES + 70, 4000);
      const { status, response } = await handleSync(
        { protocol: 1, deviceId: 'dev', cursor: 0, changes: sent },
        forUser(c.db, 'budget-user'),
        NOW,
      );
      expect(status).toBe(200);
      const ok = response as SyncOkResponse;
      // 응답에 없는 뒷부분은 클라이언트 아웃박스에 남아 다음 왕복에서 처리된다.
      expect(ok.applied.map((a) => a.id)).toEqual(sent.slice(0, MAX_PUSH_CHANGES).map((s) => s.id));
      expect(ok.rejected).toEqual([]);
      expect(c.count() + SESSION_QUERIES).toBeLessThanOrEqual(FREE_PLAN_QUERY_LIMIT);

      // 이어서 나머지를 보내면(클라이언트가 ack 한 뒤 남은 것) 그다음 묶음이 처리된다.
      const next = await handleSync(
        {
          protocol: 1,
          deviceId: 'dev',
          cursor: 0,
          changes: sent.slice(MAX_PUSH_CHANGES),
        },
        forUser(db, 'budget-user'),
        NOW,
      );
      expect((next.response as SyncOkResponse).applied).toHaveLength(MAX_PUSH_CHANGES);
    });
  }, 60_000);
});
