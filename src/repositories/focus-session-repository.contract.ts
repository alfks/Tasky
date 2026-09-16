// `FocusSessionRepository` 계약 스위트 — memory·indexeddb 공용. ADR-0007 규칙 3 (a)~(e) 포함.
import type { FocusSession } from '@/domain/focus/focus-session';
import { markDeleted, touch } from '@/domain/meta';

import {
  contractDeps,
  contractFocusSession,
  idsOf,
  CONTRACT_INSTANT,
  type ContractTarget,
} from '@/repositories/contract';
import type { FocusSessionRepository } from '@/repositories/focus-session-repository';

type ReadName = Exclude<keyof FocusSessionRepository, 'upsert'>;
type ReadCall = (
  repo: FocusSessionRepository,
  session: FocusSession,
) => Promise<FocusSession | FocusSession[] | undefined>;

/** (e) `READS` 전수 대조(ADR-0007 결정 6). */
const READS = {
  getActive: (repo) => repo.getActive(),
  getById: (repo, session) => repo.getById(session.id),
  listByDate: (repo, session) => repo.listByDate(session.date),
  listByTodo: (repo, session) => repo.listByTodo(session.todoId ?? ''),
  listAll: (repo) => repo.listAll(),
} satisfies Record<ReadName, ReadCall>;

function rowsOf(result: FocusSession | FocusSession[] | undefined): FocusSession[] {
  return result === undefined ? [] : Array.isArray(result) ? result : [result];
}

const T1 = '2026-01-16T09:30:00.000Z';
const TODO_ID = '10000000-0000-4000-8000-000000000001';

export function runFocusSessionRepositoryContract(target: ContractTarget): void {
  describe(`FocusSessionRepository 계약 (${target.name})`, () => {
    let repo: FocusSessionRepository;

    beforeEach(async () => {
      repo = (await target.create()).focusSessions;
    });

    it('(a) Meta 를 왕복해도 값이 그대로다', async () => {
      const session = contractFocusSession(contractDeps(), { todoId: TODO_ID });

      await repo.upsert(session);

      expect(await repo.getById(session.id)).toEqual({ ...session });
    });

    it('(b) touch 한 값을 저장하면 rev 가 정확히 +1 된다', async () => {
      const session = contractFocusSession(contractDeps());
      await repo.upsert(session);

      await repo.upsert(touch({ ...session, elapsedSeconds: 60 }, T1));

      const saved = await repo.getById(session.id);
      expect(saved?.rev).toBe(session.rev + 1);
      expect(saved?.elapsedSeconds).toBe(60);
    });

    it('(c) 툼스톤은 READS 의 모든 조회 메서드에서 빠진다', async () => {
      const session = contractFocusSession(contractDeps(), { todoId: TODO_ID });
      await repo.upsert(session);

      await repo.upsert(markDeleted(session, T1));

      for (const [name, read] of Object.entries(READS)) {
        const rows = rowsOf(await read(repo, session));
        expect(idsOf(rows), `${name} 가 툼스톤을 돌려줬다`).not.toContain(session.id);
      }
    });

    it('(d) 브랜드 없는 값은 저장할 수 없다', async () => {
      const session = contractFocusSession(contractDeps());
      await repo.upsert(session);
      const plain = await repo.getById(session.id);
      expect(plain).toBeDefined();
      if (plain === undefined) {
        return;
      }

      // @ts-expect-error 조회 결과는 브랜드가 없다 (ADR-0007 규칙 3-d, TS2345)
      await repo.upsert(plain);
    });

    it('(e) READS 는 인터페이스의 조회 메서드를 하나도 빠뜨리지 않는다', () => {
      for (const name of Object.keys(READS)) {
        expect(repo[name as ReadName]).toBeTypeOf('function');
      }
    });

    it('getActive 는 running·paused 만 돌려주고 끝난 세션은 무시한다 (timer R5)', async () => {
      const deps = contractDeps();
      const done = contractFocusSession(deps, { status: 'completed', endedAt: T1 });
      const paused = contractFocusSession(deps, { status: 'paused', pausedAt: T1 });
      await repo.upsert(done);
      await repo.upsert(paused);

      expect((await repo.getActive())?.id).toBe(paused.id);
    });

    it('활성 세션이 둘이면 가장 늦게 시작한 것을 돌려준다 (인터페이스 주석의 타이브레이크)', async () => {
      // 이 단언이 없던 동안 `.at(-1)` 을 `.at(0)` 으로 바꿔도 계약 44건이 전부 통과했다.
      // timer R5 는 활성 최대 1개를 전제하지만, 데이터가 어긋났을 때 두 구현이 갈리지 않는 것이 계약이다.
      const early = contractFocusSession(contractDeps({ seed: 1 }));
      const late = contractFocusSession(contractDeps({ seed: 2 }), {
        status: 'paused',
        startedAt: T1,
        pausedAt: T1,
      });
      await repo.upsert(early);
      await repo.upsert(late);

      expect((await repo.getActive())?.id).toBe(late.id);

      // 삽입 순서에 기대지 않는다 — 거꾸로 넣어도 답이 같아야 한다.
      const reversed = (await target.create()).focusSessions;
      await reversed.upsert(late);
      await reversed.upsert(early);
      expect((await reversed.getActive())?.id).toBe(late.id);
    });

    it('진행 중인 세션이 없으면 getActive 는 undefined 다', async () => {
      await repo.upsert(contractFocusSession(contractDeps(), { status: 'canceled', endedAt: T1 }));

      expect(await repo.getActive()).toBeUndefined();
    });

    it('목록은 startedAt → createdAt → id 순이다', async () => {
      const late = contractFocusSession(contractDeps({ seed: 1 }), { startedAt: T1 });
      const early = contractFocusSession(contractDeps({ seed: 2 }), {
        startedAt: CONTRACT_INSTANT,
      });
      await repo.upsert(late);
      await repo.upsert(early);

      expect(idsOf(await repo.listAll())).toEqual([early.id, late.id]);
    });

    it('listByDate·listByTodo 는 해당하는 것만 돌려준다', async () => {
      const deps = contractDeps();
      const mine = contractFocusSession(deps, { todoId: TODO_ID });
      const other = contractFocusSession(deps, { date: '2026-01-16' });
      await repo.upsert(mine);
      await repo.upsert(other);

      expect(idsOf(await repo.listByDate(mine.date))).toEqual([mine.id]);
      expect(idsOf(await repo.listByTodo(TODO_ID))).toEqual([mine.id]);
    });
  });
}
