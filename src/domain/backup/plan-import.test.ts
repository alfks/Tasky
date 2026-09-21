import { describe, expect, it } from 'vitest';

import type { BackupDocument } from '@/domain/backup/backup-document';
import { buildBackupDocument, serializeBackup } from '@/domain/backup/export-backup';
import { planImport, planMerge } from '@/domain/backup/plan-import';
import { parseBackup } from '@/domain/backup/validate-backup';
import type { DatasetSnapshot } from '@/domain/dataset';
import { planRoutineFill } from '@/domain/routine/routine-fill';
import { resumeRoutine } from '@/domain/routine/routine.rules';
import type { Todo } from '@/domain/todo/todo';

import { makeCategories, makeCategory } from '@/test/fixtures/category';
import { makeDday } from '@/test/fixtures/dday';
import { FIXTURE_INSTANT, fixedDeps } from '@/test/fixtures/deps';
import { makeDiaryEntry } from '@/test/fixtures/diary';
import { makeFocusSession } from '@/test/fixtures/focus-session';
import { makeRoutine } from '@/test/fixtures/routine';
import { makeSettings } from '@/test/fixtures/settings';
import { makeTodo, makeTodos } from '@/test/fixtures/todo';

const LATER = '2026-02-01T00:00:00.000Z';
const EARLIER = '2026-01-01T00:00:00.000Z';

const snapshot = (over: Partial<DatasetSnapshot> = {}): DatasetSnapshot => ({
  todos: [],
  categories: [],
  focusSessions: [],
  settings: makeSettings(),
  ddays: [],
  diaryEntries: [],
  routines: [],
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

// T-86, ADR-0017 §재검토 트리거. 병합에서만 워터마크를 max 로 고르는 안전장치.
// 리뷰 #108 Major 1 은 원래 "위험 없음 증명"이라던 제목을 "중복/영구공백 트레이드오프"로 고쳤으나,
// 그 뒤 재판정으로 "영구공백"(옛 S5) 자체가 오진임이 드러났다 — max 에는 대칭되는 손상이 없고
// min 쪽에만 실제 손상(부활·중복)이 있다(plan-import.ts#planMergeRoutines 문서 참고).
describe('planImport — 루틴 병합의 materializedThrough (max 트레이드오프, ADR-0017)', () => {
  it('파일 쪽 다른 필드가 이겨도(newer updatedAt) 워터마크는 두 값 중 더 늦은 쪽을 쓴다', () => {
    // 로컬이 더 최근(updatedAt)이라 title 등은 로컬이 이기지만, 로컬의 워터마크가 파일보다 이르다.
    const local = makeRoutine({
      title: '로컬 제목',
      updatedAt: LATER,
      materializedThrough: '2026-02-01',
    });
    const incoming = makeRoutine({
      title: '파일 제목',
      updatedAt: EARLIER,
      materializedThrough: '2026-06-01',
    });
    const plan = planImport({
      mode: 'merge',
      local: snapshot({ routines: [local] }),
      document: documentOf({ routines: [incoming] }),
    });
    const [saved] = plan.snapshot.routines;
    expect(saved.title).toBe('로컬 제목');
    // 더 이른 값(로컬)을 그대로 뒀다면 이미 파일 쪽이 만든 구간을 지연 생성이 중복 생성한다.
    expect(saved.materializedThrough).toBe('2026-06-01');
  });

  it('로컬 쪽 워터마크가 더 늦으면 그대로 유지한다(뒤로 가지 않는다)', () => {
    const local = makeRoutine({ updatedAt: EARLIER, materializedThrough: '2026-06-01' });
    const incoming = makeRoutine({ updatedAt: LATER, materializedThrough: '2026-02-01' });
    const plan = planImport({
      mode: 'merge',
      local: snapshot({ routines: [local] }),
      document: documentOf({ routines: [incoming] }),
    });
    expect(plan.snapshot.routines[0].materializedThrough).toBe('2026-06-01');
  });

  it('한쪽에만 있는 루틴은 그 쪽 워터마크를 그대로 쓴다', () => {
    const fileOnly = makeRoutine({ materializedThrough: '2026-04-01' });
    const plan = planImport({
      mode: 'merge',
      local: snapshot(),
      document: documentOf({ routines: [fileOnly] }),
    });
    expect(plan.snapshot.routines[0].materializedThrough).toBe('2026-04-01');
  });

  it('교체(R7)는 파일 쪽 워터마크를 그대로 쓴다 — max 규칙을 적용하지 않는다', () => {
    const local = makeRoutine({ materializedThrough: '2026-06-01' });
    const incoming = makeRoutine({ materializedThrough: '2026-02-01' });
    const plan = planImport({
      mode: 'replace',
      local: snapshot({ routines: [local] }),
      document: documentOf({ routines: [incoming] }),
    });
    expect(plan.snapshot.routines[0].materializedThrough).toBe('2026-02-01');
  });

  /**
   * **정정(재판정, 원래 "반례(S5)"였다 — 리뷰 #108 Major 1 은 오진이었다).** 이 구간이 "영구 소실"
   * 이라는 원래 주장은 실행으로 반증됐다: `planRoutineFill` 은 `!routine.active` 면 계획 자체를
   * `null` 로 낸다(`routine-fill.ts:39`) — 즉 **중지 중엔 애초에 "채웠어야 할" 구간이 없다.**
   * 아래 첫 대조(병합 없음)가 보여주듯, 로컬이 병합을 안 받고 그대로 뒀다면 채워지는 날짜는 `[]`다.
   * 병합은 그 `[]`를 `['2026-03-05']`로 **늘렸을 뿐**, 무엇도 잃지 않는다. 다섯 목요일은 병합
   * 여부와 무관하게 **어떤 경로로도 생기지 않는 날짜**다(R7 "소급 없음" 이 의도한 그대로 — 1/29 에
   * 재개했다면 다섯 다 나온다, 차이는 병합이 아니라 재개일이다).
   */
  it('중지→재개 구간은 R7 대로 채우지 않는다 — 병합이 잃는 것이 아니다(정정, 옛 S5)', () => {
    // 매주 목요일 루틴(기본값). 1/22(목)까지 채운 뒤 중지됐다 — 다음은 1/29 부터였어야 한다.
    const paused = makeRoutine({
      active: false,
      materializedThrough: '2026-01-22',
      updatedAt: EARLIER,
    });

    // 대조군: 병합을 전혀 안 하고 로컬이 중지된 채로 남아 있으면 — 계획은 null, 채울 날짜는 없다.
    // "병합이 이 구간을 없앴다" 가 성립하려면 병합 없이는 이 구간이 채워졌어야 하는데, 그렇지 않다.
    const noMergeFillPlan = planRoutineFill(
      { routine: paused, through: '2026-03-05', existing: [] },
      fixedDeps(),
    );
    expect(noMergeFillPlan).toBeNull();

    // 파일(다른 기기): 같은 루틴을 3/1 에 재개했다 — 그 사이(1/29~2/26) 인스턴스는 하나도 안 만들고
    // 워터마크만 재개일 전날(2/28)로 점프한다(R7 "소급 없음").
    const resumed = resumeRoutine(paused, '2026-03-01', fixedDeps({ now: LATER }));

    const plan = planImport({
      mode: 'merge',
      local: snapshot({ routines: [paused] }),
      document: documentOf({ routines: [resumed] }),
    });
    const merged = plan.snapshot.routines[0];
    expect(merged.materializedThrough).toBe('2026-02-28');

    // 병합 뒤 지연 생성을 계획하면 1/29~2/26 다섯 목요일은 나오지 않는다 — 이것들이 "사라진" 것이
    // 아니라, 병합 없이도(위 대조군) 애초에 생기지 않았을 날짜라는 뜻이다. 실제로 새로 채워지는 것은
    // 병합이 `[]`에서 늘린 `2026-03-05` 하나뿐이다.
    const fillPlan = planRoutineFill(
      { routine: merged, through: '2026-03-05', existing: [] },
      fixedDeps(),
    );
    const filledDates = (fillPlan?.todos ?? []).map((todo) => todo.date);
    expect(filledDates).toEqual(['2026-03-05']);
    for (const neverExisted of [
      '2026-01-29',
      '2026-02-05',
      '2026-02-12',
      '2026-02-19',
      '2026-02-26',
    ]) {
      expect(filledDates).not.toContain(neverExisted);
    }
  });
});

/**
 * **알려진 한계(리뷰 #108 Minor 1) — 고치지 않고 결정만 고정한다.** diary R1("하루 1개")은 `date`
 * 단위 유일성인데 병합은 `id` 단위 newer-wins 라, id 가 다른 두 행이 같은 날짜를 가리키면 병합이
 * 막지 못한다. `plan-import.ts`의 diaryEntries 절 주석에 고치지 않는 이유(소프트 삭제엔 `now` 가
 * 필요한데 `planImport` 가 순수 함수라 그 입력이 없다)를 적었다 — 이 테스트는 그 결정이 실제로
 * 무엇을 허용하는지를 고정한다.
 */
describe('planImport — diaryEntries 병합의 알려진 한계 (diary R1, Minor 1)', () => {
  it('같은 날짜를 가리키는 서로 다른 id 의 다이어리 두 건이 병합 후에도 둘 다 살아남는다', () => {
    const oldEntry = makeDiaryEntry({ seq: 1, content: '옛 기록' });
    // B(로컬)는 옛 기록을 그대로 갖고 있다.
    // A(파일)는 그 날짜 기록을 지우고(export 가 안 실음) 새 id 로 다시 썼다 — 같은 date, 다른 id.
    const newEntry = makeDiaryEntry({ seq: 2, content: '새 기록' });
    expect(newEntry.date).toBe(oldEntry.date);
    expect(newEntry.id).not.toBe(oldEntry.id);

    const plan = planImport({
      mode: 'merge',
      local: snapshot({ diaryEntries: [oldEntry] }),
      document: documentOf({ diaryEntries: [newEntry] }),
    });

    // 두 행 다 살아 있는 채로 남는다 — diary R1 위반이지만, 이번 라운드에서는 고치지 않기로 했다.
    const live = plan.snapshot.diaryEntries.filter((entry) => entry.deletedAt === undefined);
    expect(live.map((entry) => entry.id).sort()).toEqual([oldEntry.id, newEntry.id].sort());
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

  // T-86: ddays·diaryEntries·routines 도 왕복을 거친다. **ddays·diaryEntries 의 툼스톤은 애초에
  // 내보내지 않는다**(export-backup.test.ts "삭제된 D-day·다이어리는 내보내지 않는다") — 아무도 그
  // id 를 참조하지 않아 categories 처럼 남겨 둘 이유가 없다(todos 와 같은 판단). **routines 의
  // 툼스톤은 남은 투두가 routineId 로 가리키면 실린다**(routine.md R10 "기록 보존") — 그래서 셋의
  // 왕복 결과가 다르다(하나라도 빠지면 조용히 사라진다는 원래 취지는 살아 있는 행에 대해서다).
  it('ddays·diaryEntries 는 살아 있는 행만, routines 는 참조되는 툼스톤까지 살아남는다', () => {
    const liveDday = makeDday({ seq: 1 });
    const deletedDday = makeDday({ seq: 2, deletedAt: EARLIER, updatedAt: EARLIER, rev: 4 });
    const liveDiary = makeDiaryEntry({ seq: 1, emoji: '😄' });
    const deletedDiary = makeDiaryEntry({ seq: 2, deletedAt: EARLIER, updatedAt: EARLIER });
    const liveRoutine = makeRoutine({ seq: 1, materializedThrough: '2026-05-01' });
    const deletedRoutine = makeRoutine({
      seq: 2,
      deletedAt: EARLIER,
      updatedAt: EARLIER,
      materializedThrough: '2026-03-01',
    });
    const linkingTodo = makeTodo({ seq: 3, routineId: deletedRoutine.id });

    const origin = snapshot({
      ddays: [liveDday, deletedDday],
      diaryEntries: [liveDiary, deletedDiary],
      routines: [liveRoutine, deletedRoutine],
      categories: [makeCategory()],
      todos: [linkingTodo],
    });

    const text = serializeBackup(buildBackupDocument(origin, FIXTURE_INSTANT));
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const plan = planImport({ mode: 'replace', local: snapshot(), document: parsed.document });

    // ddays·diaryEntries 는 살아 있는 행만 왕복한다 — 툼스톤은 export 단계에서 이미 빠졌다.
    expect(plan.snapshot.ddays).toEqual([liveDday]);
    expect(plan.snapshot.diaryEntries).toEqual([liveDiary]);
    // routines 는 살아 있는 것 + 투두가 가리키는 툼스톤까지 왕복한다.
    expect([...plan.snapshot.routines].sort((a, b) => (a.id < b.id ? -1 : 1))).toEqual(
      [liveRoutine, deletedRoutine].sort((a, b) => (a.id < b.id ? -1 : 1)),
    );
    // 삭제된 루틴도 투두가 routineId 로 가리키는 한 실린다(routine.md R10 "기록 보존").
    expect(plan.snapshot.routines.map((routine) => routine.id)).toContain(deletedRoutine.id);
    // 워터마크(materializedThrough)도 한 글자도 안 바뀐다.
    const restoredLive = plan.snapshot.routines.find((routine) => routine.id === liveRoutine.id);
    expect(restoredLive?.materializedThrough).toBe('2026-05-01');
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
          ddays: [...plan.snapshot.ddays],
          diaryEntries: [...plan.snapshot.diaryEntries],
          routines: [...plan.snapshot.routines],
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
