// 동기화 저장소 계약 스위트(ADR-0018) — memory·indexeddb 양쪽이 함께 돈다(`memory.contract.test.ts`·
// `indexeddb.contract.test.ts`). 아웃박스 전수 계약(`WRITES`)·`applyRemote`(`client-merge.vectors.ts`
// 그대로)·`existingIds`·`wipeLocal` 을 **실제 구현** 위에서 검증한다.
//
// 이 파일은 `*.contract.test.ts` 가 아니라 `*.contract.ts` 라 `no-restricted-syntax`(NO_META_WRITE,
// ADR-0007)가 그대로 걸린다(테스트 블록의 리셋은 파일명이 `test` 로 끝나야 적용된다) — 그래서 아래
// 단언은 `rev`·`updatedAt` 키를 가진 기대값 객체를 직접 짓지 않고 읽기(`entries[0].rev` 등)로만 비교한다.
import type { DateKey } from '@/domain/date/date-key';
import type { Dday } from '@/domain/dday/dday';
import type { DiaryEntry } from '@/domain/diary/diary-entry';
import {
  createMeta,
  markDeleted,
  touch,
  type Meta,
  type MetaDeps,
  type Persistable,
} from '@/domain/meta';
import type { Routine } from '@/domain/routine/routine';
import { CLIENT_MERGE_VECTORS } from '@/domain/sync/client-merge.vectors';
import type { SyncTable } from '@/domain/sync/wire';

import type { Repositories } from '@/repositories/container';
import {
  contractCategory,
  contractDeps,
  contractFocusSession,
  contractSettings,
  contractTodo,
  CONTRACT_CATEGORY_ID,
  type ContractTarget,
} from '@/repositories/contract';
import { isRepositoryError } from '@/repositories/repository-error';
import { pick, type RemoteWrite } from '@/repositories/sync-repository';

const START = '2026-01-15' as DateKey;

function freshDday(deps: MetaDeps): Persistable<Dday> {
  return createMeta<Dday>(deps, { title: 'D-day', date: START });
}
function freshDiaryEntry(deps: MetaDeps): Persistable<DiaryEntry> {
  return createMeta<DiaryEntry>(deps, { date: START, content: '오늘의 기록' });
}
function freshRoutine(deps: MetaDeps): Persistable<Routine> {
  return createMeta<Routine>(deps, {
    title: '운동',
    categoryId: CONTRACT_CATEGORY_ID,
    recurrence: { type: 'weekly', daysOfWeek: [4] },
    startDate: START,
    active: true,
    fillFloor: '2026-01-14' as DateKey,
  });
}

/** `entity` 가 이미 `id`·`rev` 를 legitimate 하게 들고 있으므로(`createMeta` 산출물) 그 두 값을
 * 별도 리터럴 키로 복제하지 않는다(머리주석) — 호출부는 `result.entity.id`/`.rev` 를 읽는다. */
type WriteResult = { tbl: SyncTable; entity: Meta; remote: RemoteWrite };
type WriteCall = (repos: Repositories, deps: MetaDeps) => Promise<WriteResult>;

/** `Repositories` 에서 `upsert` 를 가진 키 + dataset 두 메서드로 **타입으로** 파생한다(새 쓰기 메서드가
 * 생기면 `WRITES` 가 그 키를 안 채운 순간 컴파일 에러가 난다). */
type UpsertKeys = {
  [K in keyof Repositories]: Repositories[K] extends { upsert: (entity: never) => Promise<void> }
    ? K
    : never;
}[keyof Repositories];
export type WriteName = UpsertKeys | 'dataset.write' | 'dataset.restore';

const REMOTE_DEPS = contractDeps({ now: '2026-02-01T00:00:00.000Z', seed: 900 });

/** 방금 만든 로컬 로우와 같은 id 를 가진 "서버 쪽" 로우 — `applyRemote` 시험용. */
function remoteFor(tbl: SyncTable, id: string): RemoteWrite {
  const build: Record<SyncTable, () => unknown> = {
    todos: () => contractTodo(REMOTE_DEPS, { id }),
    categories: () => contractCategory(REMOTE_DEPS, { id }),
    settings: () => contractSettings(REMOTE_DEPS, { id }),
    focusSessions: () => contractFocusSession(REMOTE_DEPS, { id }),
    ddays: () => freshDday({ ...REMOTE_DEPS, id: () => id }),
    diaryEntries: () => freshDiaryEntry({ ...REMOTE_DEPS, id: () => id }),
    routines: () => freshRoutine({ ...REMOTE_DEPS, id: () => id }),
  };
  return { tbl, seq: 1, entity: build[tbl]() } as RemoteWrite;
}

const WRITES = {
  todos: async (repos, deps) => {
    const todo = contractTodo(deps);
    await repos.todos.upsert(todo);
    return { tbl: 'todos', entity: todo, remote: remoteFor('todos', todo.id) };
  },
  categories: async (repos, deps) => {
    const category = contractCategory(deps);
    await repos.categories.upsert(category);
    return { tbl: 'categories', entity: category, remote: remoteFor('categories', category.id) };
  },
  settings: async (repos, deps) => {
    const settings = contractSettings(deps);
    await repos.settings.upsert(settings);
    return { tbl: 'settings', entity: settings, remote: remoteFor('settings', settings.id) };
  },
  focusSessions: async (repos, deps) => {
    const session = contractFocusSession(deps);
    await repos.focusSessions.upsert(session);
    return {
      tbl: 'focusSessions',
      entity: session,
      remote: remoteFor('focusSessions', session.id),
    };
  },
  dday: async (repos, deps) => {
    const dday = freshDday(deps);
    await repos.dday.upsert(dday);
    return { tbl: 'ddays', entity: dday, remote: remoteFor('ddays', dday.id) };
  },
  diaryEntries: async (repos, deps) => {
    const entry = freshDiaryEntry(deps);
    await repos.diaryEntries.upsert(entry);
    return { tbl: 'diaryEntries', entity: entry, remote: remoteFor('diaryEntries', entry.id) };
  },
  routines: async (repos, deps) => {
    const routine = freshRoutine(deps);
    await repos.routines.upsert(routine);
    return { tbl: 'routines', entity: routine, remote: remoteFor('routines', routine.id) };
  },
  'dataset.write': async (repos, deps) => {
    const todo = contractTodo(deps);
    await repos.dataset.write([{ table: 'todos', entity: todo }]);
    return { tbl: 'todos', entity: todo, remote: remoteFor('todos', todo.id) };
  },
  'dataset.restore': async (repos, deps) => {
    const todo = contractTodo(deps);
    await repos.dataset.restore({
      todos: [todo],
      categories: [],
      focusSessions: [],
      settings: contractSettings(deps),
      ddays: [],
      diaryEntries: [],
      routines: [],
    });
    return { tbl: 'todos', entity: todo, remote: remoteFor('todos', todo.id) };
  },
} satisfies Record<WriteName, WriteCall>;

/** `sync-repository.contract.ts` 스위트. memory·indexeddb 두 `ContractTarget` 이 이 함수를 부른다. */
export function runSyncRepositoryContract(target: ContractTarget): void {
  describe(`SyncRepository (${target.name})`, () => {
    it('getState() 는 setState() 전에 undefined, 후에는 넣은 값 그대로다', async () => {
      const repos = await target.create();
      expect(await repos.sync.getState()).toBeUndefined();

      const state = { deviceId: 'device-1', cursor: 0 };
      await repos.sync.setState(state);

      expect(await repos.sync.getState()).toEqual(state);
    });

    describe.each(Object.entries(WRITES) as [WriteName, WriteCall][])('쓰기 %s', (name, call) => {
      it('아웃박스에 (tbl,id,rev) 가 남는다', async () => {
        const repos = await target.create();
        const result = await call(repos, contractDeps());
        const outbox = await repos.sync.listOutbox(100);
        const match = outbox.find((e) => e.tbl === result.tbl && e.id === result.entity.id);
        expect(match).toBeDefined();
        expect(match?.rev).toBe(result.entity.rev);
      });

      it('applyRemote 로 adopt 되면 아웃박스에서 사라진다(rev 1 → adopt-remote-and-drop-outbox)', async () => {
        const repos = await target.create();
        const result = await call(repos, contractDeps());
        expect(result.entity.rev, '이 계약은 신규 생성(rev 1)만 다룬다').toBe(1);

        await repos.sync.applyRemote([result.remote]);

        const outbox = await repos.sync.listOutbox(100);
        expect(outbox.some((e) => e.tbl === result.tbl && e.id === result.entity.id)).toBe(false);
      });
    });

    it('같은 id 를 두 번 쓰면 아웃박스는 1건, rev 는 마지막 값이다', async () => {
      const repos = await target.create();
      const deps = contractDeps();
      const todo = contractTodo(deps);
      await repos.todos.upsert(todo);
      const touched = touch(todo, '2026-01-16T00:00:00.000Z');
      await repos.todos.upsert(touched);

      const outbox = await repos.sync.listOutbox(100);
      const entries = outbox.filter((e) => e.tbl === 'todos' && e.id === todo.id);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.rev).toBe(2);
    });

    it('ackOutbox: 푸시한 rev 와 일치해야 지운다(다시 고쳤으면 남는다)', async () => {
      const repos = await target.create();
      const deps = contractDeps();
      const todo = contractTodo(deps);
      await repos.todos.upsert(todo);

      // 이 시점의 todo.rev 는 1(방금 생성) — pick 으로 그대로 옮긴다(리터럴 rev: 를 쓰지 않는다).
      await repos.sync.ackOutbox([{ tbl: 'todos', ...pick(todo, ['id', 'rev']) }]);
      expect(await repos.sync.listOutbox(100)).toEqual([]);

      const touched = touch(todo, '2026-01-16T00:00:00.000Z');
      await repos.todos.upsert(touched);
      // 응답이 오는 사이 사용자가 다시 고쳤다(rev 2) — 방금 푸시에 실은 rev(1, `todo` 그대로) 로
      // ack 하면 남아야 한다.
      await repos.sync.ackOutbox([{ tbl: 'todos', ...pick(todo, ['id', 'rev']) }]);

      const remaining = await repos.sync.listOutbox(100);
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.rev).toBe(2);
    });

    it('dropOutbox 는 rev 와 무관하게 지운다', async () => {
      const repos = await target.create();
      const todo = contractTodo(contractDeps());
      await repos.todos.upsert(todo);

      await repos.sync.dropOutbox([{ tbl: 'todos', id: todo.id }]);

      expect(await repos.sync.listOutbox(100)).toEqual([]);
    });

    it('applyRemote — client-merge.vectors.ts 4행을 저장소 위에서 그대로 돈다', async () => {
      for (const vector of CLIENT_MERGE_VECTORS) {
        const repos = await target.create();
        const deps = contractDeps();
        let localId = 'f0000000-0000-4000-8000-000000009999';

        if (vector.input.local !== undefined) {
          let todo = contractTodo(deps);
          localId = todo.id;
          await repos.todos.upsert(todo);
          while (todo.rev < vector.input.local.rev) {
            todo = touch(todo, '2026-01-16T00:00:00.000Z');
            await repos.todos.upsert(todo);
          }
          if (!vector.input.inOutbox) {
            await repos.sync.dropOutbox([{ tbl: 'todos', id: todo.id }]);
          }
        }

        const remote = remoteFor('todos', localId);
        const result = await repos.sync.applyRemote([remote]);
        const stored = await repos.todos.getById(localId);
        const outbox = await repos.sync.listOutbox(100);
        const stillQueued = outbox.some((e) => e.tbl === 'todos' && e.id === localId);

        if (vector.expected.action === 'keep-local') {
          expect(result.kept, vector.name).toBe(1);
          expect(stored?.rev, vector.name).toBe(vector.input.local?.rev);
          // 유지된 로컬은 여전히 푸시 대상이다 — 아웃박스에 그대로 남아 있어야 한다.
          expect(stillQueued, vector.name).toBe(true);
        } else {
          expect(result.adopted.todos, vector.name).toBe(1);
          expect(stored?.id, vector.name).toBe(localId);
          // adopt 계열(드롭 여부와 무관하게) 뒤에는 큐에 없다 — `putRemote` 가 적재하면 여기서 드러난다
          // (원래 큐에 없던 vector 1·2 도 포함: putRemote 가 새로 적재하면 여기서 true 로 깨진다).
          expect(stillQueued, vector.name).toBe(false);
        }
      }
    });

    it('existingIds: 살아 있는 id·툼스톤 id 를 포함하고 없는 id 는 뺀다', async () => {
      const repos = await target.create();
      const deps = contractDeps();
      const alive = contractTodo(deps);
      const gone = contractTodo(deps);
      await repos.todos.upsert(alive);
      await repos.todos.upsert(markDeleted(gone, '2026-01-16T00:00:00.000Z'));

      const found = await repos.sync.existingIds('todos', [alive.id, gone.id, 'missing-id']);

      expect(found).toEqual(new Set([alive.id, gone.id]));
    });

    it('enqueueAll: 툼스톤 포함 전량을 큐에 넣고 건수를 돌려준다', async () => {
      const repos = await target.create();
      const deps = contractDeps();
      const todo = contractTodo(deps);
      await repos.todos.upsert(todo);
      await repos.sync.dropOutbox([{ tbl: 'todos', id: todo.id }]);
      expect(await repos.sync.listOutbox(100)).toEqual([]);

      const count = await repos.sync.enqueueAll();

      expect(count).toBeGreaterThanOrEqual(1);
      const outbox = await repos.sync.listOutbox(100);
      expect(outbox.some((e) => e.tbl === 'todos' && e.id === todo.id)).toBe(true);
    });

    it('wipeLocal: 8스토어를 비우고 syncState 는 deviceId 만 남긴다', async () => {
      const repos = await target.create();
      const deps = contractDeps();
      await repos.todos.upsert(contractTodo(deps));
      await repos.sync.setState({
        deviceId: 'device-1',
        userSub: 'sub-1',
        userEmail: 'a@example.com',
        cursor: 42,
      });

      await repos.sync.wipeLocal();

      expect(await repos.sync.listOutbox(100)).toEqual([]);
      expect(await repos.sync.getState()).toEqual({ deviceId: 'device-1', cursor: 0 });
      await expect(repos.dataset.readAll()).rejects.toSatisfy(
        (error: unknown) => isRepositoryError(error) && error.code === 'SETTINGS_MISSING',
      );
    });
  });
}
