import { describe, expect, it } from 'vitest';

import {
  BACKUP_MAX_BYTES,
  backupIssueMessage,
  checkBackupSize,
  type BackupIssue,
} from '@/domain/backup/backup-document';
import { parseBackup, validateBackup } from '@/domain/backup/validate-backup';

import { makeCategory } from '@/test/fixtures/category';
import { FIXTURE_INSTANT, fixtureId } from '@/test/fixtures/deps';
import { makeFocusSession } from '@/test/fixtures/focus-session';
import { makeSettings } from '@/test/fixtures/settings';
import { makeTodo } from '@/test/fixtures/todo';

/** 통과하는 최소 문서. 각 테스트는 여기서 한 군데만 망가뜨린다. */
function rawDocument(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    app: 'tasky',
    schemaVersion: 2,
    exportedAt: FIXTURE_INSTANT,
    settings: makeSettings(),
    categories: [makeCategory()],
    todos: [makeTodo()],
    focusSessions: [makeFocusSession({ status: 'completed' })],
    ...over,
  };
}

/** 실패 결과에서 `code`·`path` 를 꺼낸다(성공이면 단언이 먼저 깨지도록). */
function issueOf(result: ReturnType<typeof validateBackup>): BackupIssue {
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error('unreachable');
  }
  return result.issue;
}

describe('validateBackup — 봉투 검사 (R2·R3)', () => {
  it('정상 문서를 통과시킨다', () => {
    const result = validateBackup(rawDocument());
    expect(result.ok).toBe(true);
  });

  it.each([
    ['null', null],
    ['숫자', 123],
    ['문자열', 'tasky'],
    ['배열', []],
    ['app 없음', { schemaVersion: 2 }],
    ['다른 앱', { app: 'other', schemaVersion: 2 }],
  ])('%s 는 Tasky 백업 파일이 아니다', (_label, input) => {
    expect(issueOf(validateBackup(input)).code).toBe('NOT_TASKY_FILE');
  });

  it('미래 스키마 버전은 거부한다 (R3)', () => {
    expect(issueOf(validateBackup(rawDocument({ schemaVersion: 99 }))).code).toBe('FUTURE_VERSION');
  });

  it.each([0, -1, 1.5, '2', null])('schemaVersion 이 %s 면 형식 오류다', (version) => {
    expect(issueOf(validateBackup(rawDocument({ schemaVersion: version })))).toEqual({
      code: 'SHAPE_INVALID',
      path: 'schemaVersion',
    });
  });

  it('과거 버전(v1, focusSessions 없음)은 변환해 통과시킨다 (R3)', () => {
    const { focusSessions: _dropped, ...v1 } = rawDocument({ schemaVersion: 1 });
    const result = validateBackup(v1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.schemaVersion).toBe(2);
      expect(result.document.focusSessions).toEqual([]);
    }
  });

  it.each([
    ['exportedAt 없음', { exportedAt: undefined }, 'exportedAt'],
    ['exportedAt 형식 오류', { exportedAt: '2026-09-15' }, 'exportedAt'],
    ['categories 가 배열이 아님', { categories: {} }, 'categories'],
    ['todos 가 배열이 아님', { todos: null }, 'todos'],
    ['focusSessions 가 배열이 아님', { focusSessions: 'x' }, 'focusSessions'],
    ['settings 없음', { settings: undefined }, 'settings'],
  ])('%s → %s', (_label, over, path) => {
    expect(issueOf(validateBackup(rawDocument(over)))).toEqual({ code: 'SHAPE_INVALID', path });
  });
});

describe('validateBackup — 행 단위 검사 (R4)', () => {
  it.each([
    ['id 없음', { id: undefined }, 'todos[0].id'],
    ['id 형식 오류', { id: 'not-a-uuid' }, 'todos[0].id'],
    ['createdAt 형식 오류', { createdAt: 'yesterday' }, 'todos[0].createdAt'],
    ['rev 0', { rev: 0 }, 'todos[0].rev'],
    ['rev 소수', { rev: 1.5 }, 'todos[0].rev'],
    ['title 타입 오류', { title: 123 }, 'todos[0].title'],
    ['title 빈 문자열', { title: '' }, 'todos[0].title'],
    ['title 101자', { title: 'ㄱ'.repeat(101) }, 'todos[0].title'],
    ['memo 501자', { memo: 'ㄴ'.repeat(501) }, 'todos[0].memo'],
    ['done 타입 오류', { done: 'yes' }, 'todos[0].done'],
    ['order 가 NaN', { order: Number.NaN }, 'todos[0].order'],
    ['date 형식 오류', { date: '2026/01/15' }, 'todos[0].date'],
    ['date 가 실존하지 않음', { date: '2026-02-30' }, 'todos[0].date'],
    ['doneAt 형식 오류', { doneAt: '2026-01-15' }, 'todos[0].doneAt'],
    ['focusSeconds 음수', { focusSeconds: -1 }, 'todos[0].focusSeconds'],
  ])('투두의 %s → %s', (_label, patch, path) => {
    const todo = { ...makeTodo(), ...patch };
    expect(issueOf(validateBackup(rawDocument({ todos: [todo] })))).toEqual({
      code: 'SHAPE_INVALID',
      path,
    });
  });

  it('투두 행이 객체가 아니면 그 인덱스가 경로다', () => {
    expect(issueOf(validateBackup(rawDocument({ todos: [makeTodo(), 42] })))).toEqual({
      code: 'SHAPE_INVALID',
      path: 'todos[1]',
    });
  });

  it.each([
    ['name 없음', { name: undefined }, 'categories[0].name'],
    ['name 21자', { name: 'ㄱ'.repeat(21) }, 'categories[0].name'],
    ['color 형식 오류', { color: 'red' }, 'categories[0].color'],
    ['emoji 2글자', { emoji: '🍎🍏' }, 'categories[0].emoji'],
    ['status 값 오류', { status: 'archived' }, 'categories[0].status'],
    ['order 타입 오류', { order: '1' }, 'categories[0].order'],
    ['closedAt 형식 오류', { closedAt: 'x' }, 'categories[0].closedAt'],
  ])('카테고리의 %s → %s', (_label, patch, path) => {
    const category = { ...makeCategory(), ...patch };
    const todos = [makeTodo({ categoryId: category.id as string })];
    expect(issueOf(validateBackup(rawDocument({ categories: [category], todos })))).toEqual({
      code: 'SHAPE_INVALID',
      path,
    });
  });

  it.each([
    ['status 값 오류', { status: 'zzz' }, 'focusSessions[0].status'],
    ['plannedSeconds 0', { plannedSeconds: 0 }, 'focusSessions[0].plannedSeconds'],
    ['startedAt 없음', { startedAt: undefined }, 'focusSessions[0].startedAt'],
    ['elapsedSeconds 음수', { elapsedSeconds: -5 }, 'focusSessions[0].elapsedSeconds'],
    ['date 형식 오류', { date: 'x' }, 'focusSessions[0].date'],
  ])('세션의 %s → %s', (_label, patch, path) => {
    const session = { ...makeFocusSession(), ...patch };
    expect(issueOf(validateBackup(rawDocument({ focusSessions: [session] })))).toEqual({
      code: 'SHAPE_INVALID',
      path,
    });
  });

  it.each([
    ['id 가 default 가 아님', { id: fixtureId('generated') }, 'settings.id'],
    ['theme 값 오류', { theme: 'sepia' }, 'settings.theme'],
    ['accentColor 형식 오류', { accentColor: 'blue' }, 'settings.accentColor'],
    ['lastBackupAt 형식 오류', { lastBackupAt: '2026-09-01' }, 'settings.lastBackupAt'],
  ])('설정의 %s → %s', (_label, patch, path) => {
    const settings = { ...makeSettings(), ...patch };
    expect(issueOf(validateBackup(rawDocument({ settings })))).toEqual({
      code: 'SHAPE_INVALID',
      path,
    });
  });

  it('투두의 categoryId 가 파일 안 카테고리에 없으면 거부한다 (R4)', () => {
    const todos = [makeTodo({ categoryId: fixtureId('category', 9) })];
    expect(issueOf(validateBackup(rawDocument({ todos })))).toEqual({
      code: 'SHAPE_INVALID',
      path: 'todos[0].categoryId',
    });
  });

  it('삭제된 카테고리(tombstone)를 가리키는 투두는 통과한다 (category R14·R17)', () => {
    const category = makeCategory({ deletedAt: FIXTURE_INSTANT });
    const todos = [makeTodo({ categoryId: category.id, done: true })];
    expect(validateBackup(rawDocument({ categories: [category], todos })).ok).toBe(true);
  });

  it('세션의 todoId 는 파일 안 투두를 가리키지 않아도 된다 (R4)', () => {
    const session = makeFocusSession({ status: 'completed', todoId: fixtureId('todo', 99) });
    expect(validateBackup(rawDocument({ focusSessions: [session] })).ok).toBe(true);
  });

  it('같은 id 가 두 번 나오면 거부한다 (조용한 로우 소실 방지)', () => {
    expect(issueOf(validateBackup(rawDocument({ todos: [makeTodo(), makeTodo()] })))).toEqual({
      code: 'SHAPE_INVALID',
      path: 'todos[1].id',
    });
  });

  it('알 수 없는 필드는 보존하지 않는다 (R5)', () => {
    const todo = { ...makeTodo(), secretNote: '보존되면 안 되는 값' };
    const result = validateBackup(rawDocument({ todos: [todo] }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.todos[0]).not.toHaveProperty('secretNote');
    }
  });

  it('첫 오류 하나만 보고한다 (R8) — 뒤쪽 오류는 경로에 나타나지 않는다', () => {
    const todos = [makeTodo({ seq: 1, title: '' }), { ...makeTodo({ seq: 2 }), done: 'x' }];
    expect(issueOf(validateBackup(rawDocument({ todos })))).toEqual({
      code: 'SHAPE_INVALID',
      path: 'todos[0].title',
    });
  });
});

describe('validateBackup — 예상 밖의 값 (주입)', () => {
  it('순환 참조가 있어도 끝나고, 순환은 저장 대상에 실리지 않는다', () => {
    const cyclic: Record<string, unknown> = { ...makeTodo() };
    cyclic['self'] = cyclic;
    const result = validateBackup(rawDocument({ todos: [cyclic] }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.todos[0]).not.toHaveProperty('self');
      expect(() => JSON.stringify(result.document)).not.toThrow();
    }
  });

  it('던지는 getter 는 형식 오류로 바뀐다 (던지지 않는다)', () => {
    const hostile = { ...makeTodo() };
    Object.defineProperty(hostile, 'title', {
      enumerable: true,
      get: () => {
        throw new Error('boom');
      },
    });
    expect(issueOf(validateBackup(rawDocument({ todos: [hostile] }))).code).toBe('SHAPE_INVALID');
  });

  it('값이 매번 바뀌는 getter 라도 검증한 값과 담기는 값이 같다 (키당 1회 읽기)', () => {
    let calls = 0;
    const shifty = { ...makeTodo() };
    Object.defineProperty(shifty, 'title', {
      enumerable: true,
      get: () => {
        calls += 1;
        return calls === 1 ? '첫 번째' : '';
      },
    });
    const result = validateBackup(rawDocument({ todos: [shifty] }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.todos[0].title).toBe('첫 번째');
    }
  });

  it('루트가 통째로 던지면 root 경로의 형식 오류다', () => {
    const hostile: Record<string, unknown> = {
      app: 'tasky',
      schemaVersion: 2,
      exportedAt: FIXTURE_INSTANT,
    };
    Object.defineProperty(hostile, 'categories', {
      enumerable: true,
      get: () => {
        throw new Error('boom');
      },
    });
    expect(issueOf(validateBackup(hostile))).toEqual({ code: 'SHAPE_INVALID', path: 'root' });
  });
});

describe('parseBackup — 파일 본문 (R8)', () => {
  it.each([
    ['빈 파일', ''],
    ['공백만', '   '],
    ['잘린 JSON', '{"app":"tasky","schemaVersion":2,'],
    ['JSON 이 아님', '<html></html>'],
  ])('%s 는 JSON 파일이 아니다', (_label, text) => {
    expect(issueOf(parseBackup(text)).code).toBe('NOT_JSON');
  });

  it('JSON 이지만 다른 앱이면 NOT_TASKY_FILE 이다', () => {
    expect(issueOf(parseBackup('{"app":"other"}')).code).toBe('NOT_TASKY_FILE');
  });

  it('정상 파일 본문을 통과시킨다', () => {
    expect(parseBackup(JSON.stringify(rawDocument())).ok).toBe(true);
  });
});

describe('checkBackupSize (R9)', () => {
  it('20MB 이하는 통과한다', () => {
    expect(checkBackupSize(BACKUP_MAX_BYTES)).toBeNull();
  });

  it('20MB 를 넘으면 읽지 않고 거부한다', () => {
    expect(checkBackupSize(BACKUP_MAX_BYTES + 1)).toEqual({ code: 'TOO_LARGE' });
  });
});

describe('오류 문구에 사용자 데이터가 실리지 않는다', () => {
  const SECRET = '비밀 병원 예약 메모';

  it('제목 길이 위반의 문구에 제목이 없다', () => {
    const todo = makeTodo({ title: `${SECRET}${'가'.repeat(101)}` });
    const message = backupIssueMessage(issueOf(validateBackup(rawDocument({ todos: [todo] }))));
    expect(message).not.toContain(SECRET);
    expect(message).toBe('파일 내용이 올바르지 않아요 (todos[0].title)');
  });

  it('메모 길이 위반의 문구에 메모가 없다', () => {
    const todo = makeTodo({ memo: `${SECRET}${'가'.repeat(501)}` });
    const message = backupIssueMessage(issueOf(validateBackup(rawDocument({ todos: [todo] }))));
    expect(message).not.toContain(SECRET);
  });

  it('id 형식 위반의 문구에 id 값이 없다', () => {
    const todo = makeTodo({ id: SECRET });
    const message = backupIssueMessage(issueOf(validateBackup(rawDocument({ todos: [todo] }))));
    expect(message).not.toContain(SECRET);
    expect(message).toBe('파일 내용이 올바르지 않아요 (todos[0].id)');
  });

  it('카테고리 이름 위반의 문구에 이름이 없다', () => {
    const category = makeCategory({ name: `${SECRET}${'가'.repeat(21)}` });
    const todos = [makeTodo({ categoryId: category.id })];
    const message = backupIssueMessage(
      issueOf(validateBackup(rawDocument({ categories: [category], todos }))),
    );
    expect(message).not.toContain(SECRET);
  });
});
