import { describe, expect, it } from 'vitest';

import {
  backupCounts,
  backupFileName,
  buildBackupDocument,
  serializeBackup,
} from '@/domain/backup/export-backup';
import type { DatasetSnapshot } from '@/domain/dataset';

import { makeCategories, makeCategory } from '@/test/fixtures/category';
import { FIXTURE_INSTANT } from '@/test/fixtures/deps';
import { makeFocusSession } from '@/test/fixtures/focus-session';
import { makeSettings } from '@/test/fixtures/settings';
import { makeTodo, makeTodos } from '@/test/fixtures/todo';

const snapshot = (over: Partial<DatasetSnapshot> = {}): DatasetSnapshot => ({
  todos: [],
  categories: [],
  focusSessions: [],
  settings: makeSettings(),
  ...over,
});

describe('buildBackupDocument (R2)', () => {
  it('봉투 필드를 채운다', () => {
    const document = buildBackupDocument(snapshot(), FIXTURE_INSTANT);
    expect(document.app).toBe('tasky');
    expect(document.schemaVersion).toBe(3);
    expect(document.exportedAt).toBe(FIXTURE_INSTANT);
  });

  it('삭제된 투두는 내보내지 않는다', () => {
    const [alive, deleted] = makeTodos(2);
    const document = buildBackupDocument(
      snapshot({
        categories: [makeCategory()],
        todos: [alive, { ...deleted, deletedAt: FIXTURE_INSTANT }],
      }),
      FIXTURE_INSTANT,
    );
    expect(document.todos.map((todo) => todo.id)).toEqual([alive.id]);
  });

  it('삭제된 카테고리는 남은 투두가 가리킬 때만 내보낸다', () => {
    const [used, unused] = makeCategories(2).map((category) => ({
      ...category,
      deletedAt: FIXTURE_INSTANT,
    }));
    const document = buildBackupDocument(
      snapshot({
        categories: [used, unused],
        todos: [makeTodo({ categoryId: used.id, done: true })],
      }),
      FIXTURE_INSTANT,
    );
    expect(document.categories.map((category) => category.id)).toEqual([used.id]);
  });

  it('삭제된 카테고리를 세션이 가리켜도 내보낸다', () => {
    const category = makeCategory({ deletedAt: FIXTURE_INSTANT });
    const document = buildBackupDocument(
      snapshot({
        categories: [category],
        focusSessions: [makeFocusSession({ categoryId: category.id, status: 'completed' })],
      }),
      FIXTURE_INSTANT,
    );
    expect(document.categories).toHaveLength(1);
  });

  it('살아 있는 카테고리는 가리키는 투두가 없어도 내보낸다', () => {
    const document = buildBackupDocument(
      snapshot({ categories: [makeCategory()] }),
      FIXTURE_INSTANT,
    );
    expect(document.categories).toHaveLength(1);
  });

  it('세션은 그대로 싣는다 (세션은 삭제하지 않는다 — timer R13)', () => {
    const sessions = [makeFocusSession({ seq: 1 }), makeFocusSession({ seq: 2 })];
    const document = buildBackupDocument(snapshot({ focusSessions: sessions }), FIXTURE_INSTANT);
    expect(document.focusSessions).toEqual(sessions);
  });

  it('설정을 Meta 까지 통째로 싣는다 (adopt 가 요구한다)', () => {
    const settings = makeSettings({ lastBackupAt: FIXTURE_INSTANT });
    const document = buildBackupDocument(snapshot({ settings }), FIXTURE_INSTANT);
    expect(document.settings).toEqual(settings);
  });
});

describe('serializeBackup (R1)', () => {
  it('들여쓰기 2칸 JSON 이다', () => {
    const text = serializeBackup(buildBackupDocument(snapshot(), FIXTURE_INSTANT));
    expect(text.split('\n')[1]).toMatch(/^ {2}"/);
    expect(() => JSON.parse(text)).not.toThrow();
  });
});

describe('backupFileName (R1)', () => {
  it('로컬 날짜를 파일명에 넣는다', () => {
    expect(backupFileName('2026-09-15')).toBe('tasky-backup-2026-09-15.json');
  });
});

describe('backupCounts', () => {
  it('툼스톤을 세지 않는다', () => {
    const counts = backupCounts(
      snapshot({
        categories: [
          makeCategory({ seq: 1 }),
          makeCategory({ seq: 2, deletedAt: FIXTURE_INSTANT }),
        ],
        todos: [...makeTodos(3), makeTodo({ seq: 4, deletedAt: FIXTURE_INSTANT })],
      }),
    );
    expect(counts).toEqual({ categories: 1, todos: 3 });
  });

  it('데이터가 없으면 0 이다 (빈 상태 판정)', () => {
    expect(backupCounts(snapshot())).toEqual({ categories: 0, todos: 0 });
  });
});
