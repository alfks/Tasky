<!-- 읽기 조건: Phase 2(캘린더 D-day·통계·루틴·다이어리) 구현에 착수하기 전, 또는 다른 세션에서 이 작업을 이어받을 때. -->

# Phase 2 구현 티켓 백로그 (스냅샷)

이 문서는 **기록용 스냅샷**이다. 실제 오케스트레이션의 단일 소스는 언제나 `.worktrees/tickets/T-<n>.md` + `.worktrees/BOARD.md`([.worktrees/AGENTS.md](.worktrees/AGENTS.md), [docs/conventions/agent-collaboration.md](docs/conventions/agent-collaboration.md) §1~§2) — 그 디렉토리는 로컬 전용이라 커밋되지 않는다. 이 파일은 컨테이너 세션이 끝나면 그 로컬 파일들이 사라지는 문제를 메우려고, 2026-09-20에 만들어진 티켓 8개를 그대로 옮겨 적어 git에 남겨 둔다.

**사용법**: 새 세션에서 이 작업을 이어받으면, 아래 각 티켓 블록을 그대로 `.worktrees/tickets/T-<n>.md`로 복사하고 BOARD 표를 `.worktrees/BOARD.md`에 붙여넣은 뒤(`bash scripts/wt.sh init`으로 헤더가 없으면 먼저 만든다) 평소대로 오케스트레이터 역할을 계속한다. 구현이 시작되면 이 스냅샷은 낡아진다 — 그때부터는 `.worktrees/BOARD.md`가 다시 단일 소스다.

**진행 현황(2026-09-20 갱신)**: 아래 보드 표는 최초 스냅샷이 아니라 이 시점까지의 실측이다 — 티켓 원문(체크리스트)은 그대로 두고 status 열과 의존 그래프만 고쳤다. 상세는 각 행 status 열 참고.

**전제**: 관련 스펙 5개(`docs/specs/calendar.md`·`stats.md`·`routine.md`·`diary.md`·`sync.md`)는 전부 `상태: approved`. `docs/decisions/ADR-0016-schema-v3-dday-diary-routine.md`도 `accepted`. `sync.md` 구현만 별도로 구글 OAuth·Cloudflare D1 자격증명 발급이 선행돼야 한다(sync.md §6) — 그래서 아래 티켓에는 sync.md 구현 티켓이 없다.

## 작업 보드 스냅샷

| id   | title                       | branch                     | owner(model) | status                                                                                                                  | owns                                                                                                                                                     | pr  | round |
| ---- | --------------------------- | -------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ----- |
| T-78 | IndexedDB 스키마 v3 ADR     | docs/adr-schema-v3         | opus         | **완료**(ADR-0016 accepted, 리뷰로 `routines: 'id, active'` → `'id'` 정정 — 불리언 색인 불가. db.ts 적용은 T-79 가 함)  | docs/decisions/\*\*, docs/DECISIONS.md, src/infra/indexeddb/db.ts, migration.test.ts                                                                     | #95 | 1     |
| T-79 | D-day 카드(캘린더)          | feature/calendar-dday      | sonnet       | **완료**(db.ts 적용 포함, 라운드1 완료 — 라운드2 반영 중)                                                               | src/features/calendar/\*\*, src/domain/dday/\*\*, dday-repository.\*, memory/repositories.ts, container.ts, indexeddb/repositories.ts, ShellInsights.tsx | #99 | 2     |
| T-80 | 다이어리                    | feature/diary              | sonnet       | todo(착수 전)                                                                                                           | src/features/diary/\*\*, src/domain/diary/\*\*, diary-repository.\*, memory/repositories.ts, container.ts, indexeddb/repositories.ts, ShellMain.tsx      | -   | 0     |
| T-81 | 루틴 도메인+저장소          | feature/routine-domain     | sonnet       | **진행 중**(범위 확장: 관리 액션 pause/resume/remove 를 T-83 에서 이관, ADR-0017 지연 생성 워터마크 추가)               | routine.rules.ts, routine-repository.\*, memory/repositories.ts, container.ts, indexeddb/repositories.ts, todo.ts                                        | -   | 0     |
| T-82 | 루틴 다이얼로그+지연생성    | feature/routine-indefinite | sonnet       | todo(착수 전)                                                                                                           | RoutineDialog.tsx, useRoutineForm.ts, todo-actions.ts, TodoItem.tsx, useWeekSummaries.ts                                                                 | -   | 0     |
| T-83 | 루틴 관리 화면              | feature/routine-manager    | sonnet       | todo(착수 전, 관리 액션이 T-81 로 옮겨가 **이제 순수 UI**)                                                              | RoutineManager.tsx(신규), ShellSidebar.tsx                                                                                                               | -   | 0     |
| T-84 | chore: 히트맵 토큰          | chore/theme-heatmap-tokens | sonnet       | **완료**(라운드1 완료 — 히트맵을 파란 램프에서 무채색 잉크 램프로 교체, 카테고리 `sky` 와 충돌 회피)                    | theme.md, tokens.css                                                                                                                                     | #97 | 1     |
| T-85 | 통계 화면                   | feature/reports            | sonnet       | **완료**(`feature/reports` 푸시됨, PR 대기)                                                                             | src/features/reports/\*\*, streak.ts, focus-summary.ts, focus-session-repository.\*, CommandPaletteCommands.tsx                                          | -   | 0     |
| T-86 | chore: 백업 v3 payload 확장 | chore/backup-v3-payload    | sonnet       | **신규**(미착수, 티켓 미작성) — Dday·DiaryEntry·Routine 세 테이블을 백업에 직렬화. 지금은 D-day 가 백업에 담기지 않는다 | src/domain/backup/\*\*, src/features/backup/\*\*                                                                                                         | -   | -     |

**의존 관계**:

```
T-78(ADR — accepted, db.ts 적용은 T-79 커밋에서 완료)
 └→ T-79(D-day) → T-80(다이어리) → T-81(루틴 도메인+저장소)
                                       ├→ T-82(루틴 다이얼로그) ─┐ 서로 다른 파일, 병렬 가능
                                       └→ T-83(루틴 관리 화면) ─┘
T-84(chore: 히트맵 토큰, 독립) → T-85(통계 화면)
```

**갱신(2026-09-20)**: 이후 의존 관계 권고가 스키마 → **T-81 먼저** → (T-82 ∥ T-83 ∥ T-79) → T-80 으로 바뀌었다(임계 경로 5→3). T-86(백업 v3 payload 확장, 신규·독립)은 세 테이블이 모두 존재해야 하므로 T-79·T-80·T-81 이후 아무 때나.

T-79·T-80·T-81이 `src/repositories/container.ts`·`src/repositories/memory/repositories.ts`·`src/infra/indexeddb/repositories.ts`(공용 파일)를 같이 건드려서 순서대로 직렬화했다(agent-collaboration.md §1.1 owns 교집합 검사). T-82·T-83은 서로 다른 파일만 건드려 T-81 이후 병렬 가능.

## 티켓 원문

아래 각 블록은 `.worktrees/tickets/T-<n>.md`에 그대로 붙여넣을 수 있는 원문이다(프론트매터 포함).

### T-78

```markdown
---
id: T-78
title: IndexedDB 스키마 v3 ADR — Dday·DiaryEntry·Routine 테이블
type: docs
branch: docs/adr-schema-v3
worktree: .worktrees/adr-schema-v3
spec: none # ADR 자체가 산출물. calendar.md §4·diary.md §4·routine.md §4가 요구사항
owns:
  - docs/decisions/**
  - docs/DECISIONS.md
  - src/infra/indexeddb/db.ts # ADR-0016 규칙 2 — 세 테이블을 한 PR에서 한 번에 선언(순서대로 나눠 열지 않는다)
  - src/infra/indexeddb/migration.test.ts
reads:
  - docs/decisions/ADR-0011-schema-v2-focus-sessions.md # 직전 스키마 버전업 ADR, 같은 모양
  - docs/decisions/ADR-0005-entity-meta-and-sync-readiness.md
  - docs/decisions/AGENTS.md
  - docs/specs/calendar.md
  - docs/specs/diary.md
  - docs/specs/routine.md
depends_on: []
model: opus
size: S
---

## 목표 (1~3줄)

calendar.md·diary.md·routine.md가 각각 새 저장 엔티티(`Dday`·`DiaryEntry`·`Routine`)를 도입한다. 셋 다 IndexedDB 스키마 버전업(신규 테이블)이라 ADR-0011과 같은 이유로 ADR이 필요하다(docs/decisions/AGENTS.md "ADR이 필요한 변경"). 한 번에 세 테이블을 추가하는 스키마 v3로 묶는다 — 세 번 따로 올리면 마이그레이션이 세 스텝으로 쪼개져 테스트 표면만 늘어난다. **`db.ts`도 이 티켓에서 같이 바꾼다** — `version(3)` 블록은 머지되는 순간 불변이 되므로, 세 테이블을 나중 티켓들이 순서대로 나눠 추가할 수 없다(ADR-0016 규칙 2).

## 완료 조건 (체크리스트, 검증 가능한 문장)

- [x] `docs/decisions/ADR-0016-schema-v3-dday-diary-routine.md` 작성(맥락·결정·마이그레이션 전략·대안·재검토 트리거, ADR-0011 형식). 독립 리뷰 1라운드 반영 완료(request-changes → 인덱스 과설계 제거, routineId 동시 생성 경합을 재검토 트리거에 추가, 인용 오류 정정). **상태 accepted, PR #95로 머지 완료.**
- [x] `docs/DECISIONS.md` 인덱스에 행 추가(PR #95).
- [ ] `db.ts`: `STORES_V2` 신설(기존 `STORES` 보존), `db.version(3)`에 `ddays: 'id'`·`diaryEntries: 'id, date'`·`routines: 'id, active'` 동시 선언, `DB_VERSION = 3`. `.upgrade()` 없음. **(보류 — 사용자 요청으로 구현 미착수)**
- [ ] `migration.test.ts`: v2 픽스처 → v3로 열기 → 기존 로우 값 불변 확인(ADR-0011의 v1→v2 케이스와 같은 모양). **(보류)**

## 범위 밖 (명시적으로 하지 않을 것)

- 세 저장소(DdayRepository·DiaryRepository·RoutineRepository) 인터페이스·구현(T-79·T-80·T-81이 한다 — 이 티켓은 빈 테이블만 연다).
- FocusSessionRepository.listByDateRange 추가(신규 테이블이 아니라 기존 인터페이스 확장이라 별개 판단, stats.md §4 참고 — 이 ADR의 범위 밖).

## 참고 (스펙 섹션, 리서치 문서 섹션 헤더만)

- calendar.md §4, diary.md §4, routine.md §4
- ADR-0011(선례), ADR-0005(Meta·소프트 삭제 규약 — 세 테이블 모두 이 규약을 따른다)
```

### T-79

```markdown
---
id: T-79
title: D-day 카드(캘린더 스펙)
type: feature
branch: feature/calendar-dday
worktree: .worktrees/calendar-dday
spec: docs/specs/calendar.md
owns:
  - src/infra/indexeddb/db.ts # 기존 파일 — db.version(3) 추가(ADR-0016), STORES_V2 신설
  - src/infra/indexeddb/migration.test.ts # 기존 파일 — v2→v3 마이그레이션 케이스 추가(ADR-0016 규칙 2·3)
  - src/features/calendar/** # 새 디렉토리
  - src/domain/dday/** # 새 디렉토리 — Dday 타입, D-n 계산, 정렬
  - src/repositories/dday-repository.ts
  - src/repositories/dday-repository.contract.ts
  - src/repositories/memory/dday-repository.ts
  - src/repositories/memory/repositories.ts # 기존 파일 — 신규 필드 배선(마운트 지점)
  - src/repositories/container.ts # 기존 파일 — Repositories 타입에 dday 필드 추가(마운트 지점)
  - src/infra/indexeddb/dday-indexeddb-repository.ts
  - src/infra/indexeddb/repositories.ts # 기존 파일 — 신규 필드 배선(마운트 지점)
  - src/features/shell/components/ShellInsights.tsx # 기존 파일 — D-day 카드 삽입(app-shell.md R6 순서: 집중→달성률→카테고리별→D-day→단축키)
reads:
  - docs/conventions/code-style.md
  - src/features/AGENTS.md
  - src/domain/AGENTS.md
  - src/repositories/AGENTS.md
  - src/features/date-strip/AGENTS.md # onSelect 선택 동작을 그대로 재사용(calendar.md R6) — 새 이동 로직 금지
  - docs/decisions/ADR-0016-schema-v3-dday-diary-routine.md # db.version(3) 배선 지침(인덱스 문자열 단일 소스)
depends_on: [T-78] # 스키마 v3 ADR
model: sonnet
size: M
---

## 목표 (1~3줄)

미리 정해 둔 날짜(생일·발표일 등)까지 며칠 남았는지 인사이트 패널에 항상 보이게 한다(calendar.md). 새 달력 그리드·새 연도 선택기는 만들지 않는다 — date-strip이 이미 가진 날짜 선택 동작만 그대로 부른다.

## 완료 조건 (체크리스트, 검증 가능한 문장)

- [ ] `db.version(3)` 추가, `STORES_V2` 신설(기존 `STORES` 내용 보존), `ddays: 'id'` 인덱스(ADR-0016). v2→v3 마이그레이션 테스트(기존 로우 값 불변 확인).
- [ ] calendar.md R1~R6 전부 테스트로 검증(D-day CRUD, D-n 표기 경계, 정렬, 접근성).
- [ ] `[+ D-day 추가]` 폼으로 제목+날짜 등록, 목록에 임박순으로 뜬다.
- [ ] 항목 클릭 시 날짜 스트립의 선택 날짜가 그 날짜로 바뀐다(기존 date-strip 선택 로직 재사용 — 새 로직 작성 금지, 이것이 확인 포인트).
- [ ] `✕` 버튼으로 삭제 + 6초 되돌리기 토스트.
- [ ] ShellInsights의 카드 순서가 app-shell.md R6과 일치(집중→달성률→카테고리별→**D-day**→단축키).
- [ ] 키보드만으로 추가·삭제·되돌리기.
- [ ] 라이트/다크 스크린샷(D-day 0개/여러 개).

## 범위 밖 (명시적으로 하지 않을 것)

- 달력 그리드, 연도 선택기(calendar.md §6 — date-strip에 이미 있음).
- D-day 반복(매년), 다른 사람과 공유.

## 참고 (스펙 섹션, 리서치 문서 섹션 헤더만)

- calendar.md §1~§7 전체
- app-shell.md R2·R6(인사이트 패널 폭·순서)
- date-strip.md §2-A-2·§3-A(재사용 대상 선택 동작)
```

### T-80

```markdown
---
id: T-80
title: 다이어리(하루 기록)
type: feature
branch: feature/diary
worktree: .worktrees/diary
spec: docs/specs/diary.md
owns:
  - src/features/diary/** # 새 디렉토리
  - src/domain/diary/** # 새 디렉토리 — DiaryEntry, mood-emoji.ts, 검증
  - src/repositories/diary-repository.ts
  - src/repositories/diary-repository.contract.ts
  - src/repositories/memory/diary-repository.ts
  - src/repositories/memory/repositories.ts # 기존 파일 — 신규 필드 배선(마운트 지점, T-79와 같은 파일 — 직렬화)
  - src/repositories/container.ts # 기존 파일 — 마운트 지점(T-79와 같은 파일 — 직렬화)
  - src/infra/indexeddb/diary-indexeddb-repository.ts
  - src/infra/indexeddb/repositories.ts # 기존 파일 — 마운트 지점(T-79와 같은 파일 — 직렬화)
  - src/features/shell/components/ShellMain.tsx # 기존 파일 — 다이어리 카드를 TodoList 아래에 마운트(diary.md §2)
reads:
  - docs/conventions/code-style.md
  - src/features/AGENTS.md
  - src/domain/AGENTS.md
  - src/repositories/AGENTS.md
  - src/features/category/AGENTS.md # R4-a 이모지 라디오그룹 패턴 재사용(diary.md R3)
depends_on: [T-78, T-79] # 스키마 v3 ADR + container.ts/repositories.ts 공유 파일 직렬화(T-79 먼저)
model: sonnet
size: M
---

## 목표 (1~3줄)

하루를 마치며 기분 이모지 하나와 짧은 글(최대 500자)로 남긴다(diary.md). 스티커·AI 자동 생성 없음(product-overview.md §7 비목표).

## 완료 조건 (체크리스트, 검증 가능한 문장)

- [ ] diary.md R1~R6 전부 테스트(하루 1개 유일성, 500자 경계, 이모지+텍스트 둘 다 빈 경우 저장 불가, 삭제+되돌리기).
- [ ] 날짜 화면 하단에 카드(빈 상태 "오늘 하루 어땠나요?" → `[+ 기록하기]`, 작성됨 → 이모지+텍스트+`[수정]`).
- [ ] 작성/수정 모달: 기분 이모지 24개 제공 목록(radiogroup, 방향키), 텍스트 영역, 글자 수 `aria-live`.
- [ ] 모달 Esc 닫기 + 포커스 트랩 + 닫힌 뒤 원래 위치로 포커스 복귀(diary.md §5).
- [ ] 키보드만으로 작성 → 수정 → 삭제 → 되돌리기.
- [ ] 라이트/다크 스크린샷(빈 상태·작성됨·모달).

## 범위 밖 (명시적으로 하지 않을 것)

- 스티커·캐릭터 이미지, AI 자동 일기, 사진 첨부(product-overview.md §7).
- 날짜 스트립 셀에 기분 이모지 표시(diary.md R6, 선택 항목 — 이 티켓은 다루지 않는다).

## 참고 (스펙 섹션, 리서치 문서 섹션 헤더만)

- diary.md §1~§7 전체
- category.md R4-a(이모지 피커 조작 패턴)
```

### T-81

```markdown
---
id: T-81
title: 루틴 도메인+저장소(Routine 엔티티, 무기한 반복 기반)
type: feature
branch: feature/routine-domain
worktree: .worktrees/routine-domain
spec: docs/specs/routine.md
owns:
  - src/domain/todo/routine.rules.ts # 기존 파일 — endDate 선택형으로, shouldMaterialize 추가
  - src/domain/todo/routine.rules.test.ts
  - src/repositories/routine-repository.ts
  - src/repositories/routine-repository.contract.ts
  - src/repositories/memory/routine-repository.ts
  - src/repositories/memory/repositories.ts # 기존 파일 — 마운트 지점(T-79·T-80과 같은 파일 — 직렬화)
  - src/repositories/container.ts # 기존 파일 — 마운트 지점(T-79·T-80과 같은 파일 — 직렬화)
  - src/infra/indexeddb/routine-indexeddb-repository.ts
  - src/infra/indexeddb/repositories.ts # 기존 파일 — 마운트 지점(T-79·T-80과 같은 파일 — 직렬화)
  - src/domain/todo/todo.ts # 기존 파일 — Todo.routineId? 필드 추가만(다른 필드 변경 금지)
reads:
  - docs/conventions/code-style.md
  - src/domain/AGENTS.md
  - src/repositories/AGENTS.md
  - src/features/todo/hooks/useRoutineForm.ts # 기존 R21 구현 — 반환값(TodoId[]|false) 계약 확인용, 이 티켓에서 수정하지 않음(T-82가 함)
depends_on: [T-78, T-80] # 스키마 v3 ADR + container.ts/repositories.ts 직렬화(T-79·T-80 다음)
model: sonnet
size: M
---

## 목표 (1~3줄)

routine.md의 도메인·저장소 계층만 먼저 놓는다 — 화면(다이얼로그·관리 화면)은 T-82·T-83이 잇는다. 기존 R21(todo.md, `expandRoutineDates`)은 한 글자도 안 바뀐다: `createRoutine`의 입력에서 `endDate`만 선택형으로 바뀌고, 반환(`TodoId[] | false`)은 그대로다.

## 완료 조건 (체크리스트, 검증 가능한 문장)

- [ ] **회귀 없음**: 기존 R21 테스트(`RoutineDialog.test.tsx`, `todo-routine.test.ts`, 22건)가 이 티켓 이후에도 그대로 통과(이 티켓은 그 파일들을 수정하지 않는다 — `owns` 밖).
- [ ] `RoutineRecurrence` 타입 변경 없음(routine.md R1 — daily 유형 추가 안 함).
- [ ] `Routine = Meta & { title, memo?, categoryId?, recurrence, startDate, endDate?, active }` 도메인 타입 + 저장소 CRUD(routine.md §4).
- [ ] `shouldMaterialize(routine, date) → boolean` 순수 함수(routine.md R6, 시각 의존 없음 — `today` 주입 테스트).
- [ ] R3 구간 보정 로직 단위 테스트: 즉시 채우기 결과가 0건이어도(패턴 자체가 유효하면) 등록이 실패하지 않음(routine.md R4·R5, 이번 라운드에서 잡힌 버그 — 반드시 회귀 테스트로 고정). 시작일이 보이는 범위 끝보다 뒤인 경우의 구간 보정(`max`)도 테스트.
- [ ] `(routineId, date)` 중복 생성 방지 계약 테스트(memory·indexeddb 양쪽).

## 범위 밖 (명시적으로 하지 않을 것)

- 다이얼로그 UI("계속 반복" 체크박스), 지연 생성을 date-strip 방문 시점에 실제로 호출하는 배선(T-82).
- 관리 화면(사이드바 진입점, 목록, 중지/재개/삭제 UI)(T-83).

## 참고 (스펙 섹션, 리서치 문서 섹션 헤더만)

- routine.md §3(R1~R12) 전체, §4
- todo.md R21(기존 계약, 회귀 기준선)
```

### T-82

```markdown
---
id: T-82
title: 루틴 등록 다이얼로그 확장("계속 반복") + 지연 생성 연동
type: feature
branch: feature/routine-indefinite
worktree: .worktrees/routine-indefinite
spec: docs/specs/routine.md
owns:
  - src/features/todo/components/RoutineDialog.tsx # 기존 파일 — "계속 반복" 체크박스 추가
  - src/features/todo/hooks/useRoutineForm.ts # 기존 파일 — endDate 선택형, R4 0건-비오류 분기
  - src/features/todo/store/todo-actions.ts # 기존 파일 — createRoutine 입력 시그니처(endDate 선택)
  - src/features/todo/components/TodoItem.tsx # 기존 파일 — 🔁 배지(routine.md §2)
  - src/features/date-strip/hooks/useWeekSummaries.ts # 기존 파일(또는 동급 훅) — 보이는 범위 조회 시 지연 생성 호출(routine.md R6) — 정확한 훅 파일명은 src/features/date-strip/AGENTS.md 확인
reads:
  - docs/conventions/code-style.md
  - src/features/todo/AGENTS.md
  - src/features/date-strip/AGENTS.md
  - docs/specs/date-strip.md # §4(listByDateRange 조회 시점 — 지연 생성 배선 지점)
depends_on: [T-81]
model: sonnet
size: M
---

## 목표 (1~3줄)

T-81이 놓은 도메인·저장소 위에 화면을 잇는다: 다이얼로그에 "계속 반복" 체크박스를 더하고, 날짜 스트립이 새 범위를 읽을 때마다 무기한 루틴의 미생성 날짜를 조용히 채운다(routine.md R6).

## 완료 조건 (체크리스트, 검증 가능한 문장)

- [ ] "계속 반복" 체크박스 체크 시 종료일 입력 `disabled`+빈값, 제출 시 `endDate` 없이 `createRoutine` 호출.
- [ ] 종료일 비운 등록: `Routine` 레코드 저장 + 즉시 채우기(보이는 범위, routine.md R3) + 결과 0건이어도 성공 토스트("곧 반복이 시작돼요") — 이 배선이 T-81의 버그 수정을 실제로 화면에서 체감 가능하게 만드는 지점이므로 통합 테스트 필수.
- [ ] 날짜 스트립으로 미래 날짜를 열면(즉시 채우기 밖 범위) 그 방문 시점에 지연 생성이 일어나고(토스트 없음), 새로고침 없이 목록에 뜬다.
- [ ] 루틴에서 나온 투두에 🔁 배지, hover 시 "매주 금·토 반복" 등 텍스트.
- [ ] 키보드만으로 무기한 루틴 등록 → 날짜 이동 → 인스턴스 등장 → 체크.
- [ ] 라이트/다크 스크린샷(다이얼로그 "계속 반복" 체크, 🔁 배지 투두).

## 범위 밖 (명시적으로 하지 않을 것)

- 관리 화면(사이드바 진입점, 목록, 중지/재개/삭제)(T-83).
- 두 번째 진입점("+ 루틴 추가", 항목 없이 생성)(T-83, routine.md R12-b).

## 참고 (스펙 섹션, 리서치 문서 섹션 헤더만)

- routine.md §2(다이얼로그 와이어프레임), R2~R6
- date-strip.md §4(listByDateRange 조회 시점)
```

### T-83

```markdown
---
id: T-83
title: 루틴 관리 화면(사이드바 진입점, 중지/재개/삭제)
type: feature
branch: feature/routine-manager
worktree: .worktrees/routine-manager
spec: docs/specs/routine.md
owns:
  - src/features/todo/components/RoutineManager.tsx # 신규
  - src/features/todo/components/RoutineManager.test.tsx # 신규
  - src/features/shell/components/ShellSidebar.tsx # 기존 파일 — "루틴" 진입점 추가(category.md 목록 아래, 정확한 위치는 category.md §2-A 참고)
reads:
  - docs/conventions/code-style.md
  - src/features/todo/AGENTS.md
  - src/features/shell/AGENTS.md
  - docs/specs/category.md # §2-A 사이드바 구조 재사용 패턴
depends_on: [T-81]
model: sonnet
size: M
---

## 목표 (1~3줄)

무기한 루틴을 보고 멈출 수 있는 화면을 더한다(routine.md R7·R7-a·R10·R12-b). T-81의 저장소 위에서 동작하며 T-82(다이얼로그 확장)와는 독립적으로 병렬 가능하다(둘 다 T-81에만 의존).

## 완료 조건 (체크리스트, 검증 가능한 문장)

- [ ] 사이드바 "루틴" 진입점 → 다이얼로그(category.md 구조 재사용) — 목록에 무기한 루틴("계속") + 종료일 있는 루틴("~10/4", 기록용) 모두 표시.
- [ ] 무기한 루틴 행의 `⋯`: 중지·재개·삭제. 종료일 있는 루틴 행의 `⋯`: **삭제만**(routine.md R7-a — 중지·재개 메뉴 자체가 없음, 비활성화가 아니라 없음).
- [ ] 중지 → 그 루틴의 지연 생성이 멈춤(이미 만든 인스턴스는 유지) → 재개 → 다시 이어짐(소급 없음, 멈춰 있던 구간은 채우지 않음).
- [ ] 삭제 → 과거 인스턴스의 `routineId` 연결 유지(기록 보존, 🔁만 사라짐), 이후 생성 중단.
- [ ] "+ 루틴 추가"(두 번째 진입점, routine.md R12-b): 항목 없이 카테고리부터 골라 새 루틴 생성 — T-82의 다이얼로그를 재사용하되 시작 항목(제목·메모 기본값)이 없는 변형.
- [ ] 빈 상태 "아직 계속 반복되는 루틴이 없어요"(종료일 있는 기록은 여기 안 셈, routine.md §2 상태).
- [ ] 키보드만으로 관리 화면 진입 → 중지 → 재개 → 삭제.
- [ ] 라이트/다크 스크린샷(관리 화면 목록, 빈 상태).

## 범위 밖 (명시적으로 하지 않을 것)

- 다이얼로그 자체의 "계속 반복" 체크박스·지연 생성 배선(T-82가 이미 함 — 이 티켓은 재사용만).
- 인스턴스 일괄 재수정(routine.md §6).

## 참고 (스펙 섹션, 리서치 문서 섹션 헤더만)

- routine.md §2(관리 화면 와이어프레임), R7·R7-a·R10·R12
- category.md §2-A(사이드바 목록 구조 패턴)
```

### T-84

```markdown
---
id: T-84
title: 'chore: 히트맵 진하기 4단계 토큰'
type: chore
branch: chore/theme-heatmap-tokens
worktree: .worktrees/theme-heatmap-tokens
spec: docs/specs/theme.md
owns:
  - docs/specs/theme.md # 기존 파일 — §3-A 또는 신규 §3-D류 절에 토큰 추가(스펙이 단일 소스, 규칙5)
  - src/styles/tokens.css # 기존 파일 — 공용 파일, 이 티켓이 끝나기 전 다른 티켓이 손대면 충돌
reads:
  - docs/specs/theme.md
  - docs/specs/stats.md # R6이 요구하는 4단계(0% / 1~49% / 50~99% / 100%, 투두 0개는 5번째 톤)
depends_on: []
model: sonnet
size: XS
---

## 목표 (1~3줄)

stats.md R6(활동 히트맵)이 쓸 진하기 5단계(0% / 1~~49% / 50~~99% / 100% / 기록 없음) 토큰이 아직 theme.md에 없다. 라이트/다크 각각의 HEX를 theme.md에 먼저 확정한다 — stats.md는 스펙 포맷 규칙5(수치는 theme.md 단일 소스)에 따라 값을 만들지 않았다.

## 완료 조건 (체크리스트, 검증 가능한 문장)

- [ ] theme.md에 5단계 토큰 추가(예: `--heatmap-0`~`--heatmap-4`, 이름은 기존 토큰 명명 규칙을 따른다) — 강조색(§3-B) 계열의 명도 단계로, 카테고리 팔레트(§3-C)와는 겹치지 않는 축.
- [ ] 라이트/다크 각각 대비 확인(WCAG 인접 단계 구분 가능 — 명도차 최소 기준은 theme.md 기존 규칙 참고).
- [ ] `src/styles/tokens.css`에 동일 값 반영.
- [ ] `bash scripts/check.sh` 통과(다른 티켓과 충돌 없이 단독 머지 가능한 크기).

## 범위 밖 (명시적으로 하지 않을 것)

- 히트맵 컴포넌트 자체(T-85가 한다). 이 티켓은 토큰 값만 정한다.

## 참고 (스펙 섹션, 리서치 문서 섹션 헤더만)

- theme.md §3-A~§3-C(기존 토큰 명명 패턴)
- stats.md R6
```

### T-85

```markdown
---
id: T-85
title: 통계 화면(기간 달성률·카테고리 비율·스트릭·집중 시간·히트맵)
type: feature
branch: feature/reports
worktree: .worktrees/reports
spec: docs/specs/stats.md
owns:
  - src/features/reports/** # 새 디렉토리 — 이름 주의: src/features/stats/ 는 이미 completion-rate.md(오늘 하루) 구현체라 재사용 불가, 충돌 방지로 다른 이름을 쓴다
  - src/domain/todo/streak.ts # 신규 — computeStreak(isAllDoneByDay, from)
  - src/domain/todo/streak.test.ts
  - src/domain/todo/focus-summary.ts # 신규 — summarizeFocusSeconds(sessions, by)
  - src/domain/todo/focus-summary.test.ts
  - src/repositories/focus-session-repository.ts # 기존 파일 — listByDateRange(from, to) 추가만(다른 메서드 변경 금지)
  - src/repositories/focus-session-repository.contract.ts
  - src/repositories/memory/focus-session-repository.ts
  - src/infra/indexeddb/focus-session-indexeddb-repository.ts
  - src/features/command/components/CommandPaletteCommands.tsx # 기존 파일 — "통계 보기" 명령 추가
reads:
  - docs/conventions/code-style.md
  - src/domain/AGENTS.md
  - src/repositories/AGENTS.md
  - src/features/AGENTS.md
  - src/domain/todo/day-summary.ts # summarizeDays 재사용 대상 — 새로 만들지 않는다(이번 라운드에서 잡힌 중복 버그, 반드시 이 파일을 읽고 시작)
  - docs/specs/completion-rate.md # §4(summarizeByCategory 재사용)
depends_on: [T-84] # 히트맵 토큰 선행
model: sonnet
size: M
---

## 목표 (1~3줄)

completion-rate.md의 "오늘" 한 장을 기간(지난 7일/30일/올해/지정)으로 넓힌다(stats.md). **새 요약 함수를 만들지 않는다** — `day-summary.ts`의 `summarizeDays`와 `completion-rate.ts`의 `summarizeByCategory`를 그대로 쓴다. 신규 로직은 스트릭과 집중 시간 합계 둘뿐이다.

## 완료 조건 (체크리스트, 검증 가능한 문장)

- [ ] stats.md R1~R8 전부 테스트(추이·카테고리 비율은 기존 함수 재사용 확인, 스트릭 경계, 히트맵 4단계, R7 조회 1회씩).
- [ ] **회귀/중복 방지**: `summarizeDays`·`summarizeByCategory`를 그대로 호출하는지 — 새 동명 함수를 만들지 않았는지가 이 티켓의 리뷰 핵심(Blocker 이력 있음, 참고).
- [ ] `FocusSessionRepository.listByDateRange` 추가가 기존 메서드 시그니처를 바꾸지 않았는지 계약 테스트로 확인.
- [ ] 커맨드 팔레트 "통계 보기"로 화면 진입(메인 컬럼 전체 대체).
- [ ] 카테고리 비율 막대는 completion-rate.md R5와 같은 `progressbar` 패턴 재사용(새 패턴 금지).
- [ ] 히트맵은 T-84 토큰만 쓴다(HEX 직접 사용 금지, theme.md R1).
- [ ] 키보드만으로 기간 전환 → 카드 갱신. `role=img`·대체 `table`·`progressbar` 스크린리더 낭독 확인.
- [ ] 라이트/다크 스크린샷(빈 상태·일반·히트맵).

## 범위 밖 (명시적으로 하지 않을 것)

- 엑셀·CSV 내보내기, 다른 사용자와 비교, AI 인사이트(product-overview.md §7).
- 새 차트 라이브러리(stats.md R8 — SVG/CSS로 직접 그린다).

## 참고 (스펙 섹션, 리서치 문서 섹션 헤더만)

- stats.md §1~§7 전체
- completion-rate.md §4, timer.md §4(FocusSession 재구성 원칙)
```

## 후속 백로그 (T-79 리뷰 라운드 2 검증에서 나옴, 아직 티켓 원문 없음)

- **T-87**: `focus-fallback.ts`(`src/features/shell/lib`)와 `calendar/lib/removal-focus.ts` 의 R14 로직
  중복을 `src/lib/`(`FEATURE_ALLOW` 에 이미 있는, 순환 없는 레이어 — `a11y.ts`·`ime.ts` 와 같은 성격)
  로 통합한다. 지금은 `shell` 이 `AppShell`→`ShellInsights` 를 거쳐 `calendar` 를 조립하므로 원본을
  옮기지 않고는(그리고 `useRemovalReturnFocus` 훅도 같이 옮기지 않고는) D-day 삭제가 그 훅을 직접
  재사용할 수 없다(`import/no-cycle` 실측, T-79 리뷰 라운드 1 Major-1) — `shell/lib/focus-fallback.ts`
  수정은 T-79 owns 밖이라 이번 라운드는 이식(`removal-focus.ts`)으로 우회했다. 이식본은 `region`
  (목록이 통째로 사라졌을 때의 `<nav>` 폴백) 이 빠져 원본과 완전히 같지 않다 — 통합하며 그 차이도
  없앤다(리뷰 라운드 2 Minor).
  - 같이 정리: `src/repositories/memory/repositories.ts` 의 `createMemoryRepositories(tables, ddayTable)`
    가 `ddayTable` 을 별도 인자로 받는 것도 임시 우회다(리뷰 라운드 1 Minor-6) — `live.ts` 의
    `MemoryTables` 에 `ddays`·`diaryEntries`·`routines` 를 흡수하면(T-86 과 묶어도 된다) 다른
    다섯 저장소처럼 `tables` 하나만으로 공유되게 정리할 수 있다.
