import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BACKUP_MAX_BYTES } from '@/domain/backup/backup-document';
import { serializeBackup } from '@/domain/backup/export-backup';
import { BACKUP_WARN_MIN_TODOS } from '@/domain/backup/stale-backup';
import type { DatasetSnapshot } from '@/domain/dataset';
import type { Meta, Persistable } from '@/domain/meta';

import { setRepositories, type Repositories } from '@/repositories/container';
import { createMemoryTables, type MemoryTables } from '@/repositories/memory/live';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import type { BackupDeps, BackupIo } from '@/features/backup/store/backup-actions';
import {
  EXPORT_FAILED,
  EXPORT_UNCONFIRMED,
  IMPORT_FAILED,
  importResultMessage,
  LOAD_FAILED,
} from '@/features/backup/store/backup-state';
import { createBackupStore } from '@/features/backup/store/backup-store';
import type { BackupTarget } from '@/features/backup/store/browser-file';
import { useTodoStore } from '@/features/todo';
import { makeCategory } from '@/test/fixtures/category';
import { FIXTURE_INSTANT, fixtureId } from '@/test/fixtures/deps';
import { makeFocusSession } from '@/test/fixtures/focus-session';
import { makeSettings } from '@/test/fixtures/settings';
import { makeTodo, makeTodos } from '@/test/fixtures/todo';

const NOW = '2026-09-15T09:00:00.000Z';
const LATER = '2026-10-01T00:00:00.000Z';
const EARLIER = '2026-01-01T00:00:00.000Z';

/** 테스트 계층은 `as Persistable` 이 허용된다(ADR-0007 '감수하는 점 2') — 픽스처를 저장소에 넣는 통로. */
const persist = <T extends Meta>(entity: T): Persistable<T> => entity as unknown as Persistable<T>;

const deps: BackupDeps = {
  now: () => NOW,
  id: () => fixtureId('generated'),
  today: () => '2026-09-15',
};

const baseSnapshot = (over: Partial<DatasetSnapshot> = {}): DatasetSnapshot => ({
  categories: [makeCategory()],
  todos: makeTodos(3),
  focusSessions: [makeFocusSession({ status: 'completed' })],
  settings: makeSettings(),
  ...over,
});

/** 파일 대역. 크기를 따로 줄 수 있어 20MB 초과를 20MB 를 만들지 않고 시험한다. */
function fakeFile(name: string, text: string, size = text.length): File {
  return { name, size, text: () => Promise.resolve(text) } as unknown as File;
}

/** 읽기가 실패하는 파일(디스크 오류·권한). */
function unreadableFile(name: string): File {
  return { name, size: 10, text: () => Promise.reject(new Error('boom')) } as unknown as File;
}

let tables: MemoryTables;
let repositories: Repositories;
let downloads: { fileName: string; text: string }[];
let store: ReturnType<typeof createBackupStore>;

/** 저장 완료를 **관측할 수 있는** 자리(파일 피커가 있는 브라우저). 기본 대역이다. */
function confirmedTarget(fileName: string): BackupTarget {
  return {
    confirmable: true,
    save: (text) => {
      downloads.push({ fileName, text });
      return Promise.resolve();
    },
  };
}

/** 저장 완료를 확인할 수 없는 자리(앵커 내려받기). 파일은 나가지만 결과를 모른다. */
function unconfirmedTarget(fileName: string): BackupTarget {
  return { ...confirmedTarget(fileName), confirmable: false };
}

const io: BackupIo = {
  openTarget: (fileName) => Promise.resolve(confirmedTarget(fileName)),
  read: (file) => file.text(),
};

/** 파일 입출력만 바꾼 스토어. 나머지 배선은 같다. */
function storeWith(over: Partial<BackupIo>): ReturnType<typeof createBackupStore> {
  return createBackupStore(deps, { ...io, ...over });
}

async function seed(snapshot: DatasetSnapshot): Promise<void> {
  await repositories.dataset.restore({
    categories: snapshot.categories.map(persist),
    todos: snapshot.todos.map(persist),
    focusSessions: snapshot.focusSessions.map(persist),
    settings: persist(snapshot.settings),
  });
}

/** 파일 본문 한 줄 만들기 — 내보내기 경로를 그대로 써서 "자기가 만든 파일" 을 재현한다. */
function fileTextOf(snapshot: DatasetSnapshot): string {
  return serializeBackup({
    app: 'tasky',
    schemaVersion: 2,
    exportedAt: FIXTURE_INSTANT,
    categories: snapshot.categories,
    todos: snapshot.todos,
    focusSessions: snapshot.focusSessions,
    settings: snapshot.settings,
  });
}

beforeEach(async () => {
  localStorage.clear();
  tables = createMemoryTables();
  repositories = createMemoryRepositories(tables);
  setRepositories(repositories);
  await seed(baseSnapshot());
  downloads = [];
  store = createBackupStore(deps, io);
  await store.getState().refresh();
});

describe('refresh — 현재 상태 읽기 (§2·R10·R14)', () => {
  it('개수와 마지막 백업 시각을 읽는다', () => {
    expect(store.getState().current).toEqual({ categories: 1, todos: 3 });
    expect(store.getState().lastBackupAt).toBeUndefined();
  });

  it('투두가 20개 미만이면 경고 점을 켜지 않는다', () => {
    expect(store.getState().warnStale).toBe(false);
  });

  it('백업이 없고 투두가 20개 이상이면 경고 점을 켠다 (R14)', async () => {
    const category = makeCategory();
    await seed(
      baseSnapshot({
        categories: [category],
        todos: makeTodos(20, () => ({ categoryId: category.id })),
      }),
    );
    await store.getState().refresh();
    expect(store.getState().warnStale).toBe(true);
  });
});

describe('exportBackup (R1·R2·R10)', () => {
  it('파일명·본문을 만들고 lastBackupAt 을 갱신한다', async () => {
    expect(await store.getState().exportBackup()).toBe(true);
    expect(downloads).toHaveLength(1);
    expect(downloads[0].fileName).toBe('tasky-backup-2026-09-15.json');

    const parsed: unknown = JSON.parse(downloads[0].text);
    expect(parsed).toMatchObject({ app: 'tasky', schemaVersion: 2, exportedAt: NOW });

    const settings = await repositories.settings.get();
    expect(settings?.lastBackupAt).toBe(NOW);
    expect(store.getState().lastBackupAt).toBe(NOW);
  });

  it('내보내면 경고 점이 꺼진다 — 그것이 점을 없애는 유일한 경로다 (R14)', async () => {
    const category = makeCategory();
    await seed(
      baseSnapshot({
        categories: [category],
        todos: makeTodos(20, () => ({ categoryId: category.id })),
      }),
    );
    await store.getState().refresh();
    expect(store.getState().warnStale).toBe(true);

    await store.getState().exportBackup();
    expect(store.getState().warnStale).toBe(false);
  });

  it('데이터가 없으면 내보내지 않는다 (§2 빈 상태)', async () => {
    await seed({ categories: [], todos: [], focusSessions: [], settings: makeSettings() });
    await store.getState().refresh();
    expect(await store.getState().exportBackup()).toBe(false);
    expect(downloads).toHaveLength(0);
  });

  it('내려받기가 실패하면 lastBackupAt 을 갱신하지 않는다 (R10)', async () => {
    const failing = storeWith({
      openTarget: (fileName) =>
        Promise.resolve({
          ...confirmedTarget(fileName),
          save: () => Promise.reject(new Error('디스크가 가득 찼다')),
        }),
    });
    await failing.getState().refresh();
    expect(await failing.getState().exportBackup()).toBe(false);
    expect(failing.getState().error).toBe(EXPORT_FAILED);
    expect((await repositories.settings.get())?.lastBackupAt).toBeUndefined();
  });

  it('직렬화가 던져도(순환 참조·던지는 toJSON) 아무것도 바뀌지 않는다', async () => {
    const hostile = makeTodo({ seq: 9 });
    // memory 저장소는 쓰기 때 스프레드로 복사하므로 열거 가능해야 살아남는다.
    Object.defineProperty(hostile, 'toJSON', {
      enumerable: true,
      value: () => {
        throw new Error('boom');
      },
    });
    await seed(baseSnapshot({ todos: [...makeTodos(3), hostile] }));
    const before = await repositories.dataset.readAll();
    await store.getState().refresh();

    expect(await store.getState().exportBackup()).toBe(false);
    expect(downloads).toHaveLength(0);
    expect(await repositories.dataset.readAll()).toEqual(before);
  });
});

describe('selectFile — 손상된 파일 주입 (R4·R8·R9)', () => {
  const cases: readonly { label: string; file: () => File; code: string }[] = [
    { label: '빈 파일', file: () => fakeFile('empty.json', ''), code: 'NOT_JSON' },
    {
      label: '잘린 JSON',
      file: () => fakeFile('cut.json', '{"app":"tasky","schemaVersion":2,'),
      code: 'NOT_JSON',
    },
    {
      label: 'JSON 이지만 스키마가 아님',
      file: () => fakeFile('other.json', '{"hello":"world"}'),
      code: 'NOT_TASKY_FILE',
    },
    {
      label: '필드 타입이 틀림',
      file: () =>
        fakeFile(
          'bad-type.json',
          fileTextOf(baseSnapshot({ todos: [{ ...makeTodo(), done: 'yes' } as never] })),
        ),
      code: 'SHAPE_INVALID',
    },
    {
      label: 'id 가 없음',
      file: () => {
        const { id: _dropped, ...rest } = makeTodo();
        return fakeFile('no-id.json', fileTextOf(baseSnapshot({ todos: [rest as never] })));
      },
      code: 'SHAPE_INVALID',
    },
    {
      label: '미래 스키마 버전',
      file: () =>
        fakeFile(
          'future.json',
          fileTextOf(baseSnapshot()).replace('"schemaVersion": 2', '"schemaVersion": 99'),
        ),
      code: 'FUTURE_VERSION',
    },
    {
      label: '20MB 초과',
      file: () => fakeFile('huge.json', '{}', BACKUP_MAX_BYTES + 1),
      code: 'TOO_LARGE',
    },
  ];

  it.each(cases)('$label → $code 이고 저장소는 변하지 않는다', async ({ file, code }) => {
    const before = await repositories.dataset.readAll();
    await store.getState().selectFile(file());

    expect(store.getState().issue?.code).toBe(code);
    expect(store.getState().selection).toBeNull();
    expect(await store.getState().runImport()).toBe(false);
    expect(await repositories.dataset.readAll()).toEqual(before);
  });

  it('20MB 를 넘으면 본문을 읽지 않는다 (R9)', async () => {
    const read = vi.fn(() => Promise.resolve('{}'));
    const guarded = storeWith({ read });
    await guarded.getState().selectFile(fakeFile('huge.json', '{}', BACKUP_MAX_BYTES + 1));
    expect(read).not.toHaveBeenCalled();
  });

  it('파일 읽기 자체가 실패해도 저장소는 변하지 않는다', async () => {
    const before = await repositories.dataset.readAll();
    await store.getState().selectFile(unreadableFile('locked.json'));
    expect(store.getState().error).toBe(IMPORT_FAILED);
    expect(await repositories.dataset.readAll()).toEqual(before);
  });

  it('고른 파일 이름은 검증에 실패해도 보여준다', async () => {
    await store.getState().selectFile(fakeFile('broken.json', 'nope'));
    expect(store.getState().fileName).toBe('broken.json');
  });

  it('파일 선택을 지우면 오류도 지워진다', async () => {
    await store.getState().selectFile(fakeFile('broken.json', 'nope'));
    await store.getState().selectFile(null);
    expect(store.getState().issue).toBeNull();
    expect(store.getState().fileName).toBeNull();
  });

  it('정상 파일은 담고 있는 개수를 미리 보여준다', async () => {
    await store.getState().selectFile(fakeFile('ok.json', fileTextOf(baseSnapshot())));
    expect(store.getState().selection?.counts).toEqual({ categories: 1, todos: 3 });
  });
});

describe('runImport — 병합 (R6·R11·R12)', () => {
  it('파일이 더 최근이면 갱신하고 결과 개수를 남긴다', async () => {
    const category = makeCategory();
    const updated = makeTodo({ seq: 1, title: '파일이 최신', updatedAt: LATER });
    const fresh = makeTodo({ seq: 9, categoryId: category.id });
    await store
      .getState()
      .selectFile(
        fakeFile(
          'merge.json',
          fileTextOf(baseSnapshot({ categories: [category], todos: [updated, fresh] })),
        ),
      );

    expect(await store.getState().runImport()).toBe(true);
    const after = await repositories.dataset.readAll();
    expect(after.todos).toHaveLength(4);
    expect(after.todos.find((todo) => todo.id === updated.id)?.title).toBe('파일이 최신');
    // 개수는 **파일**을 분해한다: 카테고리 1(로컬과 동시각 → 유지) · 투두 2(갱신 1 · 추가 1).
    expect(store.getState().result?.counts).toEqual({ added: 1, updated: 1, kept: 1 });
  });

  it('로컬 툼스톤은 파일의 옛 비삭제 버전으로 부활하지 않는다 (ADR-0009 규칙 3)', async () => {
    const deleted = makeCategory({ deletedAt: LATER, updatedAt: LATER });
    const doneTodo = makeTodo({ categoryId: deleted.id, done: true });
    await seed(baseSnapshot({ categories: [deleted], todos: [doneTodo] }));
    await store.getState().refresh();

    const older = makeCategory({ name: '부활 시도', updatedAt: EARLIER });
    await store
      .getState()
      .selectFile(
        fakeFile('old.json', fileTextOf(baseSnapshot({ categories: [older], todos: [doneTodo] }))),
      );
    expect(await store.getState().runImport()).toBe(true);

    const after = await repositories.dataset.readAll();
    expect(after.categories).toHaveLength(1);
    expect(after.categories[0].deletedAt).toBe(LATER);
    // 그 카테고리를 가리키던 완료 투두가 그대로 남는다 (category R17 "삭제됨" 그룹).
    expect(after.todos.map((todo) => todo.categoryId)).toEqual([deleted.id]);
  });

  it('결과 토스트 문구에 추가·갱신·유지 개수가 들어간다 — 합계가 앞머리와 같다 (R12)', async () => {
    await store.getState().selectFile(fakeFile('same.json', fileTextOf(baseSnapshot())));
    await store.getState().runImport();
    const result = store.getState().result;
    expect(result).not.toBeNull();
    if (result !== null) {
      expect(importResultMessage(result)).toBe(
        '카테고리 1개, 할 일 3개를 가져왔어요 (추가 0 · 갱신 0 · 유지 4)',
      );
    }
  });

  it('가져오기가 끝나면 다이얼로그가 닫히고 선택이 비워진다', async () => {
    store.getState().openDialog();
    await store.getState().selectFile(fakeFile('same.json', fileTextOf(baseSnapshot())));
    await store.getState().runImport();
    expect(store.getState().open).toBe(false);
    expect(store.getState().selection).toBeNull();
  });
});

describe('runImport — 가져온 뒤 다시 읽기 (R11)', () => {
  it('메모리에 올라온 날짜의 투두 목록을 다시 조회한다', async () => {
    const category = makeCategory();
    const sameDay = makeTodo({ seq: 7, categoryId: category.id, title: '파일에서 온 할 일' });
    await useTodoStore.getState().loadDate(sameDay.date);
    expect(useTodoStore.getState().byId[sameDay.id]).toBeUndefined();

    await store
      .getState()
      .selectFile(
        fakeFile(
          'add.json',
          fileTextOf(baseSnapshot({ categories: [category], todos: [sameDay] })),
        ),
      );
    expect(await store.getState().runImport()).toBe(true);

    // 페이지 새로고침 없이 목록에 나타난다.
    expect(useTodoStore.getState().byId[sameDay.id]?.title).toBe('파일에서 온 할 일');
  });
});

describe('왕복 — 내보낸 파일을 그대로 교체 가져오기', () => {
  it('내보내기 → 교체 가져오기 뒤 저장소가 원본과 같다 (툼스톤 포함)', async () => {
    const deleted = makeCategory({ seq: 2, deletedAt: EARLIER, updatedAt: EARLIER });
    await seed(
      baseSnapshot({
        categories: [makeCategory({ seq: 1 }), deleted],
        todos: [...makeTodos(2), makeTodo({ seq: 3, categoryId: deleted.id, done: true })],
      }),
    );
    await store.getState().refresh();
    // 내보내기는 `lastBackupAt` 을 찍으므로(R10) 파일은 **그 직전** 상태를 담는다 — 왕복의 기준도 그쪽이다.
    const before = await repositories.dataset.readAll();
    await store.getState().exportBackup();
    const exported = downloads[0].text;

    // 빈 브라우저 프로필: 설정 행만 있는 저장소에 같은 파일을 교체로 넣는다.
    await seed({ categories: [], todos: [], focusSessions: [], settings: before.settings });
    await store.getState().refresh();
    await store.getState().selectFile(fakeFile('roundtrip.json', exported));
    store.getState().setMode('replace');
    store.getState().setAcknowledged(true);
    expect(await store.getState().runImport()).toBe(true);

    expect(await repositories.dataset.readAll()).toEqual(before);
  });
});

describe('runImport — 교체 (R7)', () => {
  const replaceFile = (): File =>
    fakeFile(
      'replace.json',
      fileTextOf({
        categories: [makeCategory({ seq: 9 })],
        todos: [],
        focusSessions: [],
        settings: makeSettings({ accentColor: '#123456' }),
      }),
    );

  it('확인 체크 없이는 실행되지 않고 저장소도 변하지 않는다', async () => {
    const before = await repositories.dataset.readAll();
    await store.getState().selectFile(replaceFile());
    store.getState().setMode('replace');

    expect(await store.getState().runImport()).toBe(false);
    expect(await repositories.dataset.readAll()).toEqual(before);
  });

  it('확인 체크를 하면 현재 데이터를 파일로 바꾼다', async () => {
    await store.getState().selectFile(replaceFile());
    store.getState().setMode('replace');
    store.getState().setAcknowledged(true);

    expect(await store.getState().runImport()).toBe(true);
    const after = await repositories.dataset.readAll();
    expect(after.todos).toHaveLength(0);
    expect(after.categories).toHaveLength(1);
    expect(after.settings.accentColor).toBe('#123456');
  });

  it('모드를 바꾸면 확인 체크가 풀린다', async () => {
    store.getState().setMode('replace');
    store.getState().setAcknowledged(true);
    store.getState().setMode('merge');
    store.getState().setMode('replace');
    expect(store.getState().acknowledged).toBe(false);
  });
});

describe('runImport — 예상 밖의 실패에도 변화 0', () => {
  /** `readAll` 만 적대적으로 바꾸고 쓰기는 진짜 저장소로 보낸다. */
  function withHostileReadAll(makeSnapshot: (real: DatasetSnapshot) => DatasetSnapshot): void {
    const real = repositories.dataset;
    setRepositories({
      ...repositories,
      dataset: {
        readAll: async () => makeSnapshot(await real.readAll()),
        write: (writes) => real.write(writes),
        restore: (snapshot) => real.restore(snapshot),
      },
    });
  }

  it('현재 스냅샷에 던지는 getter 가 있으면 아무것도 쓰지 않는다', async () => {
    const before = await repositories.dataset.readAll();
    await store.getState().selectFile(fakeFile('ok.json', fileTextOf(baseSnapshot())));

    withHostileReadAll((real) => {
      const hostile = { ...real.todos[0] };
      Object.defineProperty(hostile, 'updatedAt', {
        enumerable: true,
        get: () => {
          throw new Error('boom');
        },
      });
      return { ...real, todos: [hostile, ...real.todos.slice(1)] };
    });

    expect(await store.getState().runImport()).toBe(false);
    expect(store.getState().error).toBe(IMPORT_FAILED);
    setRepositories(repositories);
    expect(await repositories.dataset.readAll()).toEqual(before);
  });

  it('현재 스냅샷의 로우가 Meta 형식을 어겨도 **파일 탓을 하지 않는다** (adopt)', async () => {
    const before = await repositories.dataset.readAll();
    await store.getState().selectFile(fakeFile('ok.json', fileTextOf(baseSnapshot())));

    withHostileReadAll((real) => ({
      ...real,
      categories: [{ ...real.categories[0], rev: 0 }],
    }));

    expect(await store.getState().runImport()).toBe(false);
    // 파일은 멀쩡하다 — "파일 형식이 올바르지 않아요" 가 아니라 저장 실패 문구를 쓴다(§2).
    expect(store.getState().error).toBe(IMPORT_FAILED);
    setRepositories(repositories);
    expect(await repositories.dataset.readAll()).toEqual(before);
  });

  it('읽기 자체가 실패하면 아무것도 쓰지 않는다', async () => {
    const before = await repositories.dataset.readAll();
    await store.getState().selectFile(fakeFile('ok.json', fileTextOf(baseSnapshot())));

    const real = repositories.dataset;
    setRepositories({
      ...repositories,
      dataset: {
        readAll: () => Promise.reject(new Error('boom')),
        write: (writes) => real.write(writes),
        restore: (snapshot) => real.restore(snapshot),
      },
    });

    expect(await store.getState().runImport()).toBe(false);
    setRepositories(repositories);
    expect(await repositories.dataset.readAll()).toEqual(before);
  });
});

describe('다이얼로그 상태 (§2 로딩)', () => {
  it('가져오기 진행 중에는 닫히지 않는다', async () => {
    let release: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const real = repositories.dataset;
    setRepositories({
      ...repositories,
      dataset: {
        readAll: () => real.readAll(),
        write: (writes) => real.write(writes),
        restore: async (snapshot) => {
          await pending;
          await real.restore(snapshot);
        },
      },
    });

    store.getState().openDialog();
    await store.getState().selectFile(fakeFile('ok.json', fileTextOf(baseSnapshot())));
    const running = store.getState().runImport();

    store.getState().closeDialog();
    expect(store.getState().open).toBe(true);
    expect(store.getState().phase).toBe('importing');

    release();
    await running;
    setRepositories(repositories);
  });

  it('진행 중이 아니면 닫힌다', () => {
    store.getState().openDialog();
    store.getState().closeDialog();
    expect(store.getState().open).toBe(false);
  });
});

/** 백업이 오래된 상태(투두 20개 + lastBackupAt 없음)를 만든다 — 경고 점이 켜지는 조건이다. */
async function seedStale(): Promise<void> {
  const category = makeCategory();
  await seed(
    baseSnapshot({
      categories: [category],
      todos: makeTodos(BACKUP_WARN_MIN_TODOS, () => ({ categoryId: category.id })),
    }),
  );
}

describe('exportBackup — 저장을 확인할 수 없을 때 (R10·R14)', () => {
  it('사용자가 저장을 취소하면 경고 점이 그대로 남는다', async () => {
    await seedStale();
    const canceled = storeWith({ openTarget: () => Promise.resolve(null) });
    await canceled.getState().refresh();
    expect(canceled.getState().warnStale).toBe(true);

    expect(await canceled.getState().exportBackup()).toBe(false);

    // 백업하지 않았으므로 점이 꺼지면 안 된다 — 저장 대화상자 Esc 한 번이 30일치 경고를 끄는 경로다.
    expect(canceled.getState().warnStale).toBe(true);
    expect(canceled.getState().lastBackupAt).toBeUndefined();
    expect((await repositories.settings.get())?.lastBackupAt).toBeUndefined();
    expect(downloads).toHaveLength(0);
    // 취소는 실패가 아니다.
    expect(canceled.getState().error).toBeNull();
  });

  // 사용자 결정(R14): 확인 못 한 내보내기도 **일단 점을 끈다**. 영구 잔소리는 표시 자체를 무시하게
  // 만들기 때문이다. 대신 "확인 못 함" 으로 기록해 **절반 기간**만 지나면 다시 켠다.
  it('저장 완료를 관측할 수 없으면 점은 끄되 "확인 못 함" 으로 기록한다 (R14)', async () => {
    await seedStale();
    const anchor = storeWith({
      openTarget: (fileName) => Promise.resolve(unconfirmedTarget(fileName)),
    });
    await anchor.getState().refresh();
    expect(anchor.getState().warnStale).toBe(true);

    expect(await anchor.getState().exportBackup()).toBe(true);

    expect(downloads).toHaveLength(1);
    expect((await repositories.settings.get())?.lastBackupAt).toBe(NOW);
    expect(anchor.getState().warnStale).toBe(false);
    expect(anchor.getState().confirmation).toBe('unconfirmed');
    expect(anchor.getState().exportNote).toBe(EXPORT_UNCONFIRMED);
    expect(anchor.getState().exportNote).toContain('15일');
  });

  it('확인된 내보내기는 "확인함" 으로 기록한다 (R14)', async () => {
    await seedStale();
    await store.getState().refresh();

    expect(await store.getState().exportBackup()).toBe(true);

    expect((await repositories.settings.get())?.lastBackupAt).toBe(NOW);
    expect(store.getState().confirmation).toBe('confirmed');
    expect(store.getState().warnStale).toBe(false);
    expect(store.getState().exportNote).toBeNull();
  });

  // 두 경로를 **같은 테스트에서** 대조한다 — 갈리는 지점은 `showSaveFilePicker` 의 존재뿐이다.
  it('showSaveFilePicker 가 없는 브라우저는 확인 못 함, 있는 브라우저는 확인함이 된다', async () => {
    await seedStale();
    const seen: Record<string, boolean> = {};

    for (const hasPicker of [false, true]) {
      localStorage.clear();
      await seed(baseSnapshot({ settings: makeSettings() }));
      const live = createBackupStore(deps, {
        ...io,
        openTarget: (fileName) =>
          Promise.resolve(hasPicker ? confirmedTarget(fileName) : unconfirmedTarget(fileName)),
      });
      await live.getState().refresh();
      await live.getState().exportBackup();
      seen[String(hasPicker)] = live.getState().confirmation === 'confirmed';
    }

    expect(seen).toEqual({ false: false, true: true });
  });

  it('확인 못 한 백업은 절반 기간이 지나면 점이 다시 켜진다 (R14)', async () => {
    const category = makeCategory();
    const todos = makeTodos(BACKUP_WARN_MIN_TODOS, () => ({ categoryId: category.id }));
    const backupAt = '2026-09-01T00:00:00.000Z';
    await seed(
      baseSnapshot({
        categories: [category],
        todos,
        settings: makeSettings({ lastBackupAt: backupAt }),
      }),
    );

    // 16일 뒤: 확인된 백업이면 아직 조용하고(30일 기준), 확인 못 한 백업이면 다시 켜진다(15일 기준).
    const at = (now: string) => createBackupStore({ ...deps, now: () => now }, io);
    localStorage.setItem('tasky.backup.confirmed-at', backupAt);
    const confirmed = at('2026-09-17T00:00:00.000Z');
    await confirmed.getState().refresh();
    expect(confirmed.getState().confirmation).toBe('confirmed');
    expect(confirmed.getState().warnStale).toBe(false);

    localStorage.clear();
    const unconfirmed = at('2026-09-17T00:00:00.000Z');
    await unconfirmed.getState().refresh();
    expect(unconfirmed.getState().confirmation).toBe('unconfirmed');
    expect(unconfirmed.getState().warnStale).toBe(true);
  });

  it('저장할 자리를 본문보다 **먼저** 잡는다 (파일 피커는 사용자 제스처 안에서만 열린다)', async () => {
    const order: string[] = [];
    const real = repositories.dataset;
    setRepositories({
      ...repositories,
      dataset: {
        readAll: async () => {
          order.push('read');
          return real.readAll();
        },
        write: (writes) => real.write(writes),
        restore: (snapshot) => real.restore(snapshot),
      },
    });
    const ordered = storeWith({
      openTarget: (fileName) => {
        order.push('open');
        return Promise.resolve(confirmedTarget(fileName));
      },
    });
    await ordered.getState().refresh();

    expect(await ordered.getState().exportBackup()).toBe(true);
    expect(order).toEqual(['open', 'read']);
    setRepositories(repositories);
  });
});

describe('refreshWarning — 앱 시작 경로 (ADR-0009 규칙 4, R14)', () => {
  it('전량 읽기(dataset.readAll)를 부르지 않는다', async () => {
    const readAll = vi.spyOn(repositories.dataset, 'readAll');
    await store.getState().refreshWarning();
    expect(readAll).not.toHaveBeenCalled();
    readAll.mockRestore();
  });

  it('마지막 백업이 최신이면 투두를 한 건도 읽지 않는다', async () => {
    await seed(baseSnapshot({ settings: makeSettings({ lastBackupAt: NOW }) }));
    const search = vi.spyOn(repositories.todos, 'search');
    const listAll = vi.spyOn(repositories.todos, 'listAll');

    await store.getState().refreshWarning();

    expect(store.getState().warnStale).toBe(false);
    expect(search).not.toHaveBeenCalled();
    expect(listAll).not.toHaveBeenCalled();
    search.mockRestore();
    listAll.mockRestore();
  });

  it('오래됐으면 개수를 보되 임계값까지만 받는다', async () => {
    const category = makeCategory();
    await seed(
      baseSnapshot({
        categories: [category],
        todos: makeTodos(50, () => ({ categoryId: category.id })),
      }),
    );
    const search = vi.spyOn(repositories.todos, 'search');

    await store.getState().refreshWarning();

    expect(store.getState().warnStale).toBe(true);
    expect(search).toHaveBeenCalledWith('', BACKUP_WARN_MIN_TODOS);
    expect(await search.mock.results[0]?.value).toHaveLength(BACKUP_WARN_MIN_TODOS);
    search.mockRestore();
  });

  it('개수를 읽지 못해도 내보내기 문구를 쓰지 않는다 (refresh)', async () => {
    setRepositories({
      ...repositories,
      todos: { ...repositories.todos, listAll: () => Promise.reject(new Error('boom')) },
    });
    await store.getState().refresh();
    // 사용자는 아무것도 누르지 않았다 — "내보내지 못했어요" 는 틀린 말이다.
    expect(store.getState().error).toBe(LOAD_FAILED);
    expect(store.getState().error).not.toBe(EXPORT_FAILED);
    setRepositories(repositories);
  });

  it('개수를 읽지 못해도 내보내기 문구를 쓰지 않는다 (refreshWarning)', async () => {
    setRepositories({
      ...repositories,
      settings: {
        get: () => Promise.reject(new Error('boom')),
        upsert: (settings) => repositories.settings.upsert(settings),
      },
    });
    await store.getState().refreshWarning();
    expect(store.getState().error).toBe(LOAD_FAILED);
    expect(store.getState().error).not.toBe(EXPORT_FAILED);
    setRepositories(repositories);
  });
});

describe('runImport — 파일은 신뢰하지 않는다', () => {
  it('교체 모드에서도 실행 중 세션은 하나만 남는다 (timer R5)', async () => {
    const older = makeFocusSession({ seq: 1, status: 'running', updatedAt: EARLIER });
    const newer = makeFocusSession({ seq: 2, status: 'paused', updatedAt: LATER });
    await store.getState().selectFile(
      fakeFile(
        'two-active.json',
        fileTextOf({
          categories: [],
          todos: [],
          focusSessions: [older, newer],
          settings: makeSettings(),
        }),
      ),
    );
    store.getState().setMode('replace');
    store.getState().setAcknowledged(true);
    expect(await store.getState().runImport()).toBe(true);

    const after = await repositories.dataset.readAll();
    const active = after.focusSessions.filter(
      (session) => session.status === 'running' || session.status === 'paused',
    );
    expect(active).toHaveLength(1);
    // 남는 것은 더 최근 쪽이고, 나머지는 취소된다.
    expect(active[0]?.id).toBe(newer.id);
    expect(after.focusSessions.find((session) => session.id === older.id)?.status).toBe('canceled');
  });

  it('파일을 다시 고르면 교체 확인 체크가 풀린다', async () => {
    store.getState().setMode('replace');
    store.getState().setAcknowledged(true);
    await store.getState().selectFile(fakeFile('ok.json', fileTextOf(baseSnapshot())));
    expect(store.getState().acknowledged).toBe(false);
  });

  it('성공하면 dataRevision 이 오른다 — 캐시를 가진 다른 feature 의 재조회 신호다 (R11)', async () => {
    const before = store.getState().dataRevision;
    await store.getState().selectFile(fakeFile('same.json', fileTextOf(baseSnapshot())));
    expect(await store.getState().runImport()).toBe(true);
    expect(store.getState().dataRevision).toBe(before + 1);
  });

  it('실패하면 dataRevision 이 오르지 않는다', async () => {
    const before = store.getState().dataRevision;
    await store.getState().selectFile(fakeFile('broken.json', 'nope'));
    expect(await store.getState().runImport()).toBe(false);
    expect(store.getState().dataRevision).toBe(before);
  });
});
