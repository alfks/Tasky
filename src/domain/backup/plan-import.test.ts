import { describe, expect, it } from 'vitest';

import type { BackupDocument } from '@/domain/backup/backup-document';
import { buildBackupDocument, serializeBackup } from '@/domain/backup/export-backup';
import { planImport, planMerge } from '@/domain/backup/plan-import';
import { parseBackup } from '@/domain/backup/validate-backup';
import type { DatasetSnapshot } from '@/domain/dataset';
import type { Todo } from '@/domain/todo/todo';

import { makeCategories, makeCategory } from '@/test/fixtures/category';
import { FIXTURE_INSTANT } from '@/test/fixtures/deps';
import { makeFocusSession } from '@/test/fixtures/focus-session';
import { makeSettings } from '@/test/fixtures/settings';
import { makeTodo, makeTodos } from '@/test/fixtures/todo';

const LATER = '2026-02-01T00:00:00.000Z';
const EARLIER = '2026-01-01T00:00:00.000Z';

const snapshot = (over: Partial<DatasetSnapshot> = {}): DatasetSnapshot => ({
  todos: [],
  categories: [],
  focusSessions: [],
  settings: makeSettings(),
  ...over,
});

const documentOf = (over: Partial<BackupDocument> = {}): BackupDocument => ({
  ...buildBackupDocument(snapshot(), FIXTURE_INSTANT),
  ...over,
});

describe('planMerge (R6)', () => {
  it('파일이 더 최근이면 파일 것을 남긴다', () => {
    const local = [makeTodo({ title: '로컬', updatedAt: EARLIER })];
    const incoming = [makeTodo({ title: '파일', updatedAt: LATER })];
    const result = planMerge<Todo>(local, incoming);
    expect(result.rows[0].title).toBe('파일');
    expect(result.counts).toEqual({ added: 0, updated: 1, kept: 0 });
  });

  it('로컬이 더 최근이면 로컬을 유지한다', () => {
    const local = [makeTodo({ title: '로컬', updatedAt: LATER })];
    const incoming = [makeTodo({ title: '파일', updatedAt: EARLIER })];
    const result = planMerge<Todo>(local, incoming);
    expect(result.rows[0].title).toBe('로컬');
    expect(result.counts).toEqual({ added: 0, updated: 0, kept: 1 });
  });

  it('시각이 같으면 현재 데이터를 유지한다', () => {
    const local = [makeTodo({ title: '로컬' })];
    const incoming = [makeTodo({ title: '파일' })];
    const result = planMerge<Todo>(local, incoming);
    expect(result.rows[0].title).toBe('로컬');
    expect(result.counts).toEqual({ added: 0, updated: 0, kept: 1 });
  });

  it('파일에만 있는 항목은 추가한다', () => {
    const result = planMerge<Todo>([], [makeTodo()]);
    expect(result.rows).toHaveLength(1);
    expect(result.counts).toEqual({ added: 1, updated: 0, kept: 0 });
  });

  it('로컬에만 있는 항목은 그대로 남는다 — 개수에는 세지 않는다 (R12)', () => {
    const result = planMerge<Todo>(makeTodos(3), []);
    expect(result.rows).toHaveLength(3);
    // 개수는 **파일 내용**을 분해한 값이라(§2 예시 `20+3+289 = 312`) 파일에 없는 로컬 행은 0 이다.
    expect(result.counts).toEqual({ added: 0, updated: 0, kept: 0 });
  });

  it('추가+갱신+유지 는 파일의 행 수와 같다 (R12·§2 예시의 셈법)', () => {
    const local = makeTodos(5);
    const incoming = [
      makeTodo({ seq: 1, title: '파일이 최신', updatedAt: LATER }),
      makeTodo({ seq: 2 }),
      makeTodo({ seq: 9 }),
    ];
    const { counts } = planMerge<Todo>(local, incoming);
    expect(counts).toEqual({ added: 1, updated: 1, kept: 1 });
    expect(counts.added + counts.updated + counts.kept).toBe(incoming.length);
  });

  it('로컬 툼스톤이 더 최근이면 삭제가 유지되고 그 툼스톤이 결과에 실린다', () => {
    const local = [makeTodo({ deletedAt: LATER, updatedAt: LATER })];
    const incoming = [makeTodo({ title: '부활 시도', updatedAt: EARLIER })];
    const result = planMerge<Todo>(local, incoming);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].deletedAt).toBe(LATER);
    expect(result.rows[0].title).not.toBe('부활 시도');
  });

  it('결과는 id 오름차순이다 (readAll 과 같은 순서)', () => {
    const rows = makeTodos(4);
    const result = planMerge<Todo>([rows[3], rows[1]], [rows[0], rows[2]]);
    expect(result.rows.map((row) => row.id)).toEqual(
      [...result.rows].map((row) => row.id).sort((a, b) => (a < b ? -1 : 1)),
    );
  });
});

describe('planImport — 병합 (R6·ADR-0009 결정 4)', () => {
  it('로컬 툼스톤 + 파일의 더 오래된 비삭제 같은 id → 부활 0, 툼스톤이 스냅샷에 실린다', () => {
    const deletedCategory = makeCategory({ deletedAt: LATER, updatedAt: LATER });
    const revived = makeCategory({ name: '부활 시도', updatedAt: EARLIER });
    const doneTodo = makeTodo({ categoryId: deletedCategory.id, done: true, doneAt: EARLIER });

    const plan = planImport({
      mode: 'merge',
      local: snapshot({ categories: [deletedCategory], todos: [doneTodo] }),
      document: documentOf({ categories: [revived], todos: [doneTodo] }),
    });

    expect(plan.snapshot.categories).toHaveLength(1);
    expect(plan.snapshot.categories[0].deletedAt).toBe(LATER);
    expect(plan.snapshot.categories[0].name).not.toBe('부활 시도');
    // 그 카테고리를 가리키던 완료 투두는 그대로 남는다 (category R17 "삭제됨" 그룹).
    expect(plan.snapshot.todos.map((todo) => todo.categoryId)).toEqual([deletedCategory.id]);
  });

  it('가져온 항목의 createdAt·updatedAt·rev·deletedAt 은 파일 값 그대로다 (R6)', () => {
    const incoming = makeTodo({ createdAt: EARLIER, updatedAt: LATER, rev: 7 });
    const plan = planImport({
      mode: 'merge',
      local: snapshot(),
      document: documentOf({ categories: [makeCategory()], todos: [incoming] }),
    });
    expect(plan.snapshot.todos[0]).toEqual(incoming);
  });

  it('설정은 파일 쪽이 더 최근일 때만 갱신한다', () => {
    const local = makeSettings({ accentColor: '#111111', updatedAt: LATER });
    const incoming = makeSettings({ accentColor: '#222222', updatedAt: EARLIER });
    const plan = planImport({
      mode: 'merge',
      local: snapshot({ settings: local }),
      document: documentOf({ settings: incoming }),
    });
    expect(plan.snapshot.settings.accentColor).toBe('#111111');
  });

  it('파일 쪽 설정이 더 최근이면 갱신한다', () => {
    const local = makeSettings({ accentColor: '#111111', updatedAt: EARLIER });
    const incoming = makeSettings({ accentColor: '#222222', updatedAt: LATER });
    const plan = planImport({
      mode: 'merge',
      local: snapshot({ settings: local }),
      document: documentOf({ settings: incoming }),
    });
    expect(plan.snapshot.settings.accentColor).toBe('#222222');
  });

  it.each(['running' as const, 'paused' as const])(
    '파일의 %s 세션은 canceled 로 바꿔 넣는다 (timer R5)',
    (status) => {
      const plan = planImport({
        mode: 'merge',
        local: snapshot(),
        document: documentOf({ focusSessions: [makeFocusSession({ status })] }),
      });
      expect(plan.snapshot.focusSessions[0].status).toBe('canceled');
      expect(plan.snapshot.focusSessions[0].updatedAt).toBe(FIXTURE_INSTANT);
    },
  );

  it('로컬의 실행 중 세션은 건드리지 않는다', () => {
    const running = makeFocusSession({ status: 'running' });
    const plan = planImport({
      mode: 'merge',
      local: snapshot({ focusSessions: [running] }),
      document: documentOf(),
    });
    expect(plan.snapshot.focusSessions[0].status).toBe('running');
  });
});

describe('planImport — 교체 (R7)', () => {
  it('로컬에만 있던 항목은 사라진다', () => {
    const plan = planImport({
      mode: 'replace',
      local: snapshot({ categories: makeCategories(2), todos: makeTodos(5) }),
      document: documentOf({ categories: [makeCategory({ seq: 9 })] }),
    });
    expect(plan.snapshot.todos).toHaveLength(0);
    expect(plan.snapshot.categories.map((category) => category.id)).toEqual([
      makeCategory({ seq: 9 }).id,
    ]);
  });

  it('개수는 현재 데이터와 대조해 알려준다 (R12)', () => {
    const shared = makeTodos(2);
    const plan = planImport({
      mode: 'replace',
      local: snapshot({ todos: [...shared, makeTodo({ seq: 3 })] }),
      document: documentOf({
        categories: [makeCategory()],
        todos: [...shared, makeTodo({ seq: 4 })],
      }),
    });
    // 카테고리 1건(파일에만 있음) + 투두 1건(파일에만 있음) = 추가 2, 공유 투두 2건 = 갱신 2.
    expect(plan.counts).toEqual({ added: 2, updated: 2, kept: 0 });
  });

  it('파일의 실행 중 세션은 그대로 둔다 (왕복 동일성)', () => {
    const running = makeFocusSession({ status: 'running' });
    const plan = planImport({
      mode: 'replace',
      local: snapshot(),
      document: documentOf({ focusSessions: [running] }),
    });
    expect(plan.snapshot.focusSessions[0]).toEqual(running);
  });

  it('설정은 무조건 파일 쪽이다', () => {
    const plan = planImport({
      mode: 'replace',
      local: snapshot({ settings: makeSettings({ accentColor: '#111111', updatedAt: LATER }) }),
      document: documentOf({
        settings: makeSettings({ accentColor: '#222222', updatedAt: EARLIER }),
      }),
    });
    expect(plan.snapshot.settings.accentColor).toBe('#222222');
  });
});

describe('왕복 — 내보내기 → 파일 → 교체 가져오기 (R2·완료 조건 3)', () => {
  it('원본과 비트 단위로 같다 (세션·카테고리 tombstone·rev·updatedAt 포함)', () => {
    const deleted = makeCategory({ seq: 2, deletedAt: EARLIER, updatedAt: EARLIER, rev: 4 });
    const origin = snapshot({
      settings: makeSettings({ lastBackupAt: EARLIER, rev: 9, updatedAt: LATER }),
      categories: [makeCategory({ seq: 1, rev: 3 }), deleted],
      todos: [
        makeTodo({ seq: 1, rev: 2, memo: '메모', focusSeconds: 300 }),
        makeTodo({ seq: 2, categoryId: deleted.id, done: true, doneAt: LATER, rev: 5 }),
      ],
      focusSessions: [makeFocusSession({ seq: 1, status: 'completed', endedAt: LATER, rev: 2 })],
    });

    const text = serializeBackup(buildBackupDocument(origin, FIXTURE_INSTANT));
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    // 빈 브라우저 프로필: 설정 행만 있는 상태에 교체로 넣는다.
    const plan = planImport({ mode: 'replace', local: snapshot(), document: parsed.document });

    expect([...plan.snapshot.categories]).toEqual(
      [...origin.categories].sort((a, b) => (a.id < b.id ? -1 : 1)),
    );
    expect([...plan.snapshot.todos]).toEqual(
      [...origin.todos].sort((a, b) => (a.id < b.id ? -1 : 1)),
    );
    expect([...plan.snapshot.focusSessions]).toEqual(origin.focusSessions);
    expect(plan.snapshot.settings).toEqual(origin.settings);
  });

  it('왕복한 파일을 다시 내보내면 문자열이 같다', () => {
    const origin = snapshot({
      categories: [makeCategory()],
      todos: makeTodos(3),
      focusSessions: [makeFocusSession({ status: 'canceled' })],
    });
    const first = serializeBackup(buildBackupDocument(origin, FIXTURE_INSTANT));
    const parsed = parseBackup(first);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const plan = planImport({ mode: 'replace', local: snapshot(), document: parsed.document });
    const second = serializeBackup(
      buildBackupDocument(
        {
          todos: [...plan.snapshot.todos],
          categories: [...plan.snapshot.categories],
          focusSessions: [...plan.snapshot.focusSessions],
          settings: plan.snapshot.settings,
        },
        FIXTURE_INSTANT,
      ),
    );
    expect(second).toBe(first);
  });
});

describe('규모 (R13)', () => {
  it('카테고리 1,000개 · 투두 50,000개의 병합 계획이 끝난다', () => {
    const categories = makeCategories(1_000);
    const todos = makeTodos(50_000, (index) => ({
      categoryId: categories[index % categories.length].id,
    }));
    const plan = planImport({
      mode: 'merge',
      local: snapshot(),
      document: documentOf({ categories, todos }),
    });
    expect(plan.snapshot.todos).toHaveLength(50_000);
    expect(plan.counts.added).toBe(51_000);
  });
});
