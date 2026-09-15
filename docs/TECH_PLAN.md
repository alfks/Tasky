<!-- 읽기 조건: 오케스트레이터가 티켓을 발행할 때(§3·§4), 구현 에이전트가 레포지토리 시그니처·스키마·성능/접근성 예산을 확인할 때(§5~§9). 아키텍처 "왜"는 ARCHITECTURE.md와 ADR — 여기서는 반복하지 않는다. -->

# Tasky 기술 계획서 (MVP)

레이어·의존 방향·조립 지점은 [ARCHITECTURE.md](./ARCHITECTURE.md), 결정 근거는 [DECISIONS.md](./DECISIONS.md), 요구사항은 [specs/](./specs/AGENTS.md). 이 문서는 **무엇을 어떤 순서로 누가 만드는가**와 **수치 예산**만 다룬다.

## 1. 기술 스택 확정표와 버전 정책

| 영역 | 선택 | 메이저 고정 | 근거 |
|------|------|-----------|------|
| 런타임 / 패키지 | Node 22, pnpm 10 (`packageManager` 필드) | 22.x / 10.x | CLAUDE.md §9 |
| 프레임워크 | Next.js 15 App Router, React 19, TypeScript 5 strict | 15 / 19 / 5 | ADR-0001 |
| 스타일 | Tailwind CSS 4 + `src/styles/tokens.css` CSS 변수 | 4 | ADR-0003, specs/theme.md |
| 상태 | Zustand 5 (feature별 스토어) | 5 | ADR-0003 |
| 저장 | Dexie 4 (IndexedDB), nanoid 5 | 4 / 5 | ADR-0002 |
| PWA | `@serwist/next` 9 + `serwist` 9 | 9 | ADR-0001, specs/pwa.md |
| 테스트 | Vitest 3 + jsdom + Testing Library, `fake-indexeddb` 6, Playwright 1.x(스모크) | 3 / 6 / 1 | code-style §11 |
| 유틸 | clsx 2 + tailwind-merge 3 (`cn`) | — | code-style §3 |
| 폰트 | **Pretendard 가변 폰트 셀프 호스팅**(woff2 서브셋 1파일, `next/font/local`로 로드). npm 패키지 없음 — 공식 릴리스에서 받아 `scripts/subset-font.sh`(fonttools `pyftsubset`, 로컬 1회)로 서브셋한 파일을 레포에 커밋 | 폰트 v1.3.x | 사용자 결정(theme.md §3-F): 외부 요청 0·오프라인 동일 룩·OS별 생김새 일치 |
| 쓰지 않음 | 아이콘 라이브러리(인라인 SVG ≤ 24개), 날짜 라이브러리(`Intl` + `lib/date.ts`), DnD 라이브러리(포인터 이벤트 직접), 서버 상태 라이브러리, UI 키트 | — | 번들 예산 §8, ADR-0003 |

버전 정책: `package.json`은 캐럿(`^`)으로 메이저 고정, 실제 버전은 `pnpm-lock.yaml`이 고정. 메이저 업그레이드는 `chore/deps-*` 티켓 + `pnpm check` + 라이트/다크 스크린샷. Next/React 메이저 변경은 ADR. 의존성 추가는 사용자 확인 필수(CLAUDE.md §7-9) — 위 표에 없는 패키지는 없는 것으로 간주한다.

## 2. 마일스톤

| M | 이름 | 포함 티켓 | 완료 판정(데모 가능한 것) |
|---|------|----------|------------------------|
| M0 | 골격 | T-01 | `pnpm check`·`pnpm build` 녹색, 빈 홈 화면, 모든 `src/*/AGENTS.md` 존재 |
| M1 | 기반 | T-02~T-08, T-22 | 도메인·저장소 계약 테스트 통과(memory), 토큰 파일 = theme.md, 프리미티브 스토리 없이 테스트 통과 |
| M2 | 기능 슬라이스 | T-09~T-11, T-12a, T-13, T-14 | IndexedDB에 저장되는 카테고리·테마, 날짜 스트립 단독 동작, 백업 왕복 테스트 통과 |
| M3 | 핵심 루프 + 타이머 | T-12b, T-15~T-18, T-23 | 날짜 → 카테고리 → 투두 → 체크(하단 이동) → 달성률 + 카테고리 삭제 3경로 + 타이머 새로고침 연속이 개발 서버에서 동작(셸은 임시 배치) |
| M4 | 데스크탑 완성 | T-19~T-21 | 3컬럼 셸·반응형·팔레트·E2E 스모크, Lighthouse installable, 성능·접근성 예산 충족 |

컷 라인: M4의 T-19(팔레트)만 M3가 늦어지면 Phase 1.5로 이동(specs/shortcuts.md §1). **타이머(T-23)는 사용자 명시 요구이므로 컷 라인이 아니다.** 일정 영향: 사용자 결정(시드·종료·삭제 대화상자·하단 이동·타이머)으로 M1 +S×3(T-05·T-08·T-10), M3 +M×2(T-12b·T-23) — 임계 경로 길이는 같고 W5 동시 수가 4→6이라 병렬 에이전트가 6명 미만이면 W5가 두 턴으로 늘어난다.

## 3. 작업 분해(WBS) — 병렬 에이전트용 티켓 표

규칙: 같은 **웨이브**의 티켓은 `owns:`가 서로소이므로 동시에 워크트리를 떠도 된다. 선행 티켓은 **머지**가 끝나야 시작한다. 크기 S(<100줄 diff) M(<300) L(300 초과, `size:large` 라벨). 티켓 파일은 `.worktrees/tickets/T-<n>.md`(포맷: agent-collaboration.md §1)로 오케스트레이터가 이 표에서 생성한다.

| ID | 제목 | 브랜치 | spec | 선행 | 크기 | 웨이브 | owns (파일 소유권) |
|----|------|--------|------|------|------|-------|-------------------|
| T-01 | Next.js 스캐폴딩 + src 골격 + AGENTS.md 9개 | `chore/scaffold-nextjs` | TECH_PLAN §2 | — | L | W0 | `package.json` `pnpm-lock.yaml` `next.config.ts` `tsconfig.json` `postcss.config.mjs` `eslint.config.mjs` `.prettierrc` `vitest.config.ts` `.gitignore` `src/AGENTS.md` `src/*/AGENTS.md`(app·components·features·domain·repositories·infra·lib·styles·test) `src/app/{layout,page,providers,error}.tsx` `src/styles/{globals,tokens}.css`(골격) `src/lib/cn.ts`(+test) `src/test/setup.ts` `src/features/shell/**`(플레이스홀더) `docs/ARCHITECTURE.md`(§2 트리) `docs/DIRECTORY_MAP.md` `.github/workflows/ci.yml` |
| T-02 | 날짜·ID 유틸 | `feature/lib-date-id` | date-strip §4 | T-01 | S | W1 | `src/lib/date.ts` `src/lib/date.test.ts` `src/lib/id.ts` `src/lib/id.test.ts` |
| T-03 | 디자인 토큰·전역 CSS | `feature/design-tokens` | theme §3 | T-01 | S | W1 | `src/styles/tokens.css` `src/styles/globals.css` `src/styles/tokens.test.ts` |
| T-04 | PWA 설정(manifest·SW·아이콘) | `chore/pwa-setup` | pwa R1·R2·R3·R5·R10 | T-01 | M | W1 | `next.config.ts` `src/app/manifest.ts` `src/app/sw.ts` `public/**` `src/app/AGENTS.md` |
| T-05 | 도메인 코어(엔티티·규칙·팔레트·에러·집중 세션·삭제 계획) | `feature/domain-core` | todo §4, category §4, completion-rate §4, theme §4, timer §4 | T-02 | M | W2 | `src/domain/**`(단, `src/domain/backup/**` 제외) `src/test/fixtures/**` `docs/ARCHITECTURE.md`(§4 데이터 모델) |
| T-06 | UI 프리미티브 A | `feature/ui-primitives-core` | theme §3-D | T-03 | M | W2 | `src/components/ui/{Button,IconButton,Checkbox,ProgressRing,Kbd,Skeleton}.tsx`(+`.test.tsx`) |
| T-07 | UI 프리미티브 B(오버레이) | `feature/ui-primitives-overlay` | app-shell R7·R8 | T-03 | M | W2 | `src/components/ui/{Popover,Dialog,ConfirmDialog,Menu,Toast,ColorSwatchGroup}.tsx`(+`.test.tsx`) — `ConfirmDialog`는 app-shell R14 단순형 |
| T-08 | 레포지토리 인터페이스(4종, `remove/undoRemove` 포함) + memory + 계약 테스트 | `feature/repositories` | §6 | T-05 | M | W3 | `src/repositories/**` `src/test/setup.ts` |
| T-09 | 날짜 스트립 | `feature/date-strip` | date-strip | T-05, T-06 | M | W3 | `src/features/date-strip/**` |
| T-10 | IndexedDB 구현(4테이블, `remove/undoRemove` 2테이블 트랜잭션) + 조립 | `feature/infra-indexeddb` | §5 | T-08 | L | W4 | `src/infra/**` `src/app/providers.tsx` |
| T-11 | 테마(모드·강조색·첫 페인트 적용·폰트 로드) | `feature/theme` | theme(§3-E·§3-F R10·R11·R13) | T-07, T-08, T-22 | M | W4 | `src/features/theme/**` `src/app/layout.tsx` |
| T-12a | 카테고리(목록·생성/수정 다이얼로그·정렬·종료/재개·시드) | `feature/category` | category R1~R9·R18~R20 | T-06, T-07, T-08 | M | W4 | `src/features/category/**`(단, `components/CategoryRemoveDialog*.tsx`·`hooks/useCategoryRemoval.ts` 제외) |
| T-12b | 카테고리 삭제 대화상자(3선택지·즉석 생성·축약)·되돌리기 | `feature/category-remove` | category R10~R17 | T-12a | M | W5 | `src/features/category/components/CategoryRemoveDialog*.tsx` `src/features/category/hooks/useCategoryRemoval.ts` `src/features/category/store/category-store.ts` `src/features/category/index.ts` |
| T-13 | 투두 스토어·훅(정렬·재매김·하단 이동 상태) | `feature/todo-store` | todo §3 R5~R7·R10~R12·R15·R17·R18 | T-08 | M | W4 | `src/features/todo/store/**` `src/features/todo/hooks/**` `src/features/todo/index.ts` |
| T-14 | 백업/복원 | `feature/backup` | backup | T-07, T-08 | M | W4 | `src/domain/backup/**` `src/features/backup/**` |
| T-15 | 투두 UI(그룹·완료 블록 이동 모션·입력·편집·메뉴·삭제 확인·DnD·삭제됨 그룹) | `feature/todo-ui` | todo | T-06, T-07, T-12a, T-13 | L | W5 | `src/features/todo/components/**` `src/features/todo/messages.ts` `src/features/todo/index.ts` |
| T-16 | 달성률(링·카테고리 막대·인사이트 패널 내용) | `feature/stats` | completion-rate | T-06, T-13 | S | W5 | `src/features/stats/**` |
| T-17 | 단축키 레지스트리·도움말·커맨드 레이어 | `feature/shortcuts` | shortcuts §3-A | T-07, T-09, T-11, T-13 | M | W5 | `src/features/command/**`(단, `components/CommandPalette*.tsx` 제외) |
| T-18 | PWA UX(업데이트 토스트·persist·용량·다중 탭) | `feature/pwa-ux` | pwa R4·R6~R9 | T-04, T-07, T-13 | S | W5 | `src/features/pwa/**` |
| T-19 | 커맨드 팔레트(+ 타이머 명령 등록) | `feature/command-palette` | shortcuts §3-B | T-15, T-17, T-23 | M | W6 | `src/features/command/components/CommandPalette*.tsx` `src/features/command/index.ts` |
| T-20 | 앱 셸(3컬럼·반응형·빈/에러 상태·타이틀·타이머 칩 슬롯) | `feature/app-shell` | app-shell | T-09, T-11, T-12b, T-14, T-15, T-16, T-17, T-18, T-23 | M | W6 | `src/features/shell/**` |
| T-21 | E2E 스모크 + CI e2e 잡 | `test/e2e-smoke` | product-overview §8 | T-19, T-20 | S | W7 | `tests/**` `playwright.config.ts` `package.json` `pnpm-lock.yaml` `.github/workflows/ci.yml` |
| T-22 | Pretendard 서브셋 폰트 파일·라이선스·서브셋 스크립트 | `chore/font-pretendard` | theme §3-F R12·R14·R16 | T-01 | S | W1 | `src/app/fonts/**`(woff2 1개 + `OFL.txt`; 정적 자산만이라 `AGENTS.md` 불필요) `scripts/subset-font.sh` `scripts/AGENTS.md` `README.md` |
| T-23 | 포커스 타이머(패널 슬롯·헤더 칩·세션 영속·완료 신호·소리) | `feature/timer` | timer | T-06, T-07, T-08, T-13 | M | W5 | `src/features/timer/**` |

웨이브별 동시 실행 수: W1 4 · W2 3 · W3 2 · W4 5 · W5 6 · W6 2 · W7 1. 임계 경로(spine): T-01 → T-02 → T-05 → T-08 → T-10/T-13 → T-15 → T-20 → T-21(변경 없음 — T-12b·T-23은 W5에서 T-15와 병렬, 임계 경로 밖).
T-23(타이머)은 T-17(단축키 레지스트리)과 같은 W5라 명령을 직접 등록할 수 없다 → 타이머 명령 3개는 T-19가 `@/features/timer` index를 import해 등록한다(팔레트가 컷되면 타이머 명령도 함께 1.5로; 패널·칩 UI는 영향 없음). T-20은 `<TimerChip/>`·`<TimerPanelSection/>`을 슬롯에 마운트만 한다.
T-17이 만드는 `<CommandLayer/>`(도움말 + 팔레트 슬롯)를 T-20이 1회 마운트하므로, T-19가 뒤에 머지돼도 셸을 다시 건드리지 않는다.
폰트 책임 분담: **T-22** = 파일·라이선스·서브셋 스크립트(W1, 파일만 두고 아무 코드도 참조하지 않음) → **T-11** = `layout.tsx`에서 `next/font/local`로 로드(`@font-face`·preload·`--font-sans` 변수는 next/font가 생성, 수동 `@font-face` 금지) → **T-03** = `tokens.css`가 `var(--font-sans, <R10 폴백 스택>)`만 참조 → **T-04** = 프리캐시 상한 2.5MB 검사. `src/app/fonts/`는 T-22만, `layout.tsx`는 T-11만 만지므로 소유권 교집합 없음.

## 4. 공유 파일 소유권 순서 (동시 소유 금지, 순서대로만)

| 파일 | 소유 순서 | 비고 |
|------|----------|------|
| `package.json`, `pnpm-lock.yaml` | T-01 → T-21 | 그 사이 의존성 추가는 `chore/deps-*` 티켓으로 직렬화 |
| `next.config.ts` | T-01 → T-04 | Serwist 래핑은 T-04 |
| `src/app/layout.tsx` | T-01 → T-11 | 첫 페인트 테마 스크립트·`lang`·`next/font/local` 폰트 로드 |
| `README.md`, `scripts/AGENTS.md` | T-22만 | 서드파티 고지·서브셋 스크립트 설명 |
| `src/app/providers.tsx` | T-01 → T-10 | 조립 지점(ARCHITECTURE §6) |
| `src/styles/tokens.css`, `globals.css` | T-01(골격) → T-03 | 이후 변경은 `docs(specs): theme` 선행 |
| `src/test/setup.ts` | T-01 → T-08 | memory 주입 |
| `src/features/todo/index.ts` | T-13 → T-15 | 배럴에 컴포넌트 export 추가 |
| `src/features/command/index.ts` | T-17 → T-19 | 팔레트 export 추가 |
| `src/features/category/store/category-store.ts`, `src/features/category/index.ts` | T-12a → T-12b | 삭제 액션·대화상자 export 추가 |
| `docs/ARCHITECTURE.md` | T-01(§2) → T-05(§4) | 같은 PR에서 구조 변경과 함께 |
| `src/features/AGENTS.md` | T-01만 | feature 목록 10개(shell·date-strip·category·todo·stats·theme·backup·command·pwa·timer)를 처음부터 기재 |

## 5. 데이터 스키마와 마이그레이션 전략

MVP 스키마 v1 (`src/infra/indexeddb/db.ts`, DB 이름 `tasky`):
```ts
db.version(1).stores({
  todos: 'id, date, categoryId, [date+categoryId], updatedAt',
  categories: 'id, order, status, updatedAt',
  settings: 'id',
  focusSessions: 'id, todoId, date, status, updatedAt',
});
```
ARCHITECTURE §4 대비 **MVP 타입 확정(델타)** — T-05가 §4를 이 표대로 갱신한다:

| 타입 | 추가 필드 | 이유(스펙) |
|------|----------|-----------|
| `Todo` | `memo?: string`, `doneAt?: string`, `focusSeconds?: number` | todo R2, R6, R19. `doneAt`은 Phase 2 통계·피드에서 재구성 불가하므로 MVP부터 기록. `focusSeconds`는 세션 합계 캐시(원천은 `FocusSession`) |
| `Category` | `status: 'active'\|'completed'\|'paused'`, `closedAt?: string` | category R7. 초안의 `archivedAt`(보관)은 폐기 — 종료 상태로 흡수 |
| `FocusSession`(신규) | timer.md §4 전체(`todoId?`, `categoryId?` 스냅샷, `date`, `plannedSeconds`, `startedAt`, `pausedAt?`, `pausedTotalSeconds`, `endedAt?`, `elapsedSeconds`, `status`, 공통 필드) | timer R2~R8. 통계에서 재구성 불가 → MVP부터 기록 |
| `Settings` | `id: 'default'`, `seededAt?: string`, `lastBackupAt?: string` | category R12, backup R10 |

마이그레이션 규칙(ADR-0002 §규칙 3 구체화):
1. 기존 `version(n)` 블록은 절대 수정하지 않는다. 변경은 `version(n+1).stores({...}).upgrade(tx => …)` 추가로만.
2. 삭제된 카테고리는 tombstone(`deletedAt`)으로 남아 완료 투두가 계속 가리킨다(category R14·R17). 이는 ADR-0002 소프트 삭제 결정과 **충돌하지 않고 그것에 의존한다** — 다만 "목록 조회는 기본적으로 제외" 규칙 때문에 tombstone 색·이름을 그리려면 `list({ includeDeleted: true })`를 명시해야 한다.
3. **인덱스가 바뀌지 않는 선택 필드 추가**는 버전업 없이 허용하되, 읽기 경계의 정규화 함수(`normalizeTodo` 등)가 기본값을 채운다. 인덱스 추가/삭제·필수 필드 추가·타입 변경은 버전업.
4. `upgrade`는 멱등·순수(외부 I/O 없음). 실패 시 `RepositoryError('SCHEMA_UPGRADE_FAILED')` → 앱 셸이 "백업 내보내기만 가능한 모드" 안내(app-shell §2-C 에러 카드 재사용).
5. 버전업 PR = ADR + `db.ts` + 마이그레이션 테스트(`fake-indexeddb`로 v_n 픽스처 생성 → v_{n+1} 열기 → 단언) + `specs/backup.md` R3의 변환 함수 추가. 넷이 한 PR.
6. 백업 파일 `schemaVersion` = `DB_VERSION` 상수 하나에서 파생. 가져오기는 `migrateBackup(v_k → v_{k+1})` 체인을 도메인에서 순수 함수로 유지.
7. 물리 삭제는 `replaceAll`(백업 교체)에서만. 그 외 전부 `deletedAt`.

## 6. 레포지토리 인터페이스 확정 (병렬 티켓이 이 시그니처에 맞춰 작성)

```ts
// src/repositories/todo-repository.ts — 목록 메서드는 deletedAt 없는 것만, order asc(동률 createdAt asc)
export interface TodoRepository {
  getById(id: TodoId): Promise<Todo | null>;
  listByDate(date: DateKey): Promise<Todo[]>;
  listByDateRange(from: DateKey, to: DateKey): Promise<Todo[]>;      // 양끝 포함
  listByCategory(categoryId: CategoryId): Promise<Todo[]>;
  listAll(options?: { includeDeleted?: boolean }): Promise<Todo[]>;  // 백업 전용
  search(query: string, limit: number): Promise<Todo[]>;             // shortcuts R9 정렬
  upsert(todo: Todo): Promise<void>;
  bulkUpsert(todos: Todo[]): Promise<void>;                          // 단일 트랜잭션
  softDelete(id: TodoId, at: string): Promise<void>;                 // deletedAt=at, updatedAt=at
  restore(id: TodoId, at: string): Promise<void>;                    // deletedAt 제거, updatedAt=at
  replaceAll(todos: Todo[]): Promise<void>;                          // 물리 삭제 후 삽입, 단일 트랜잭션
}
// src/repositories/category-repository.ts — order asc
export interface CategoryRepository {
  getById(id: CategoryId): Promise<Category | null>;
  list(options?: { includeClosed?: boolean; includeDeleted?: boolean }): Promise<Category[]>; // 기본: active만
  upsert(category: Category): Promise<void>;
  bulkUpsert(categories: Category[]): Promise<void>;
  softDelete(id: CategoryId, at: string): Promise<void>;
  restore(id: CategoryId, at: string): Promise<void>;
  replaceAll(categories: Category[]): Promise<void>;
  /** 카테고리 삭제 + 미완료 투두 처리(+즉석 생성)를 categories·todos 두 테이블 단일 트랜잭션으로. 실패 시 아무것도 쓰지 않는다. */
  remove(id: CategoryId, at: string, plan: CategoryRemovalPlan): Promise<CategoryRemovalResult>;
  /** remove 결과를 그대로 되감는다(카테고리 복구·삭제 투두 복구·이동 투두 원위치·즉석 카테고리 소프트 삭제). 단일 트랜잭션. */
  undoRemove(result: CategoryRemovalResult, at: string): Promise<void>;
}
// src/domain/category/removal.ts (T-05)
export type CategoryRemovalPlan =
  | { incomplete: 'delete' }
  | { incomplete: 'move'; targetId: CategoryId }
  | { incomplete: 'create'; category: Category };                     // 도메인이 검증·생성한 새 Category
export type CategoryRemovalResult = {
  categoryId: CategoryId; deletedAt: string;
  deletedTodoIds: TodoId[];                                           // incomplete='delete'
  moved: Array<{ todoId: TodoId; prevCategoryId: CategoryId; prevOrder: number }>;
  createdCategoryId?: CategoryId;
};
// src/repositories/focus-session-repository.ts
export interface FocusSessionRepository {
  getActive(): Promise<FocusSession | null>;                          // status ∈ running|paused (최대 1개)
  getById(id: FocusSessionId): Promise<FocusSession | null>;
  listByDate(date: DateKey): Promise<FocusSession[]>;
  listByTodo(todoId: TodoId): Promise<FocusSession[]>;
  listAll(): Promise<FocusSession[]>;
  upsert(session: FocusSession): Promise<void>;
  bulkUpsert(sessions: FocusSession[]): Promise<void>;
  replaceAll(sessions: FocusSession[]): Promise<void>;
}
// src/repositories/settings-repository.ts
export interface SettingsRepository {
  get(): Promise<Settings>;                                          // 없으면 기본값 생성·저장
  update(patch: Partial<Omit<Settings, 'id'>>, at: string): Promise<Settings>;
}
// src/repositories/index.ts
export type Repositories = { todos: TodoRepository; categories: CategoryRepository; settings: SettingsRepository; focusSessions: FocusSessionRepository };
export function getRepositories(): Repositories;   // 미설정 시 throw
export function setRepositories(r: Repositories): void;
```
- 교차 테이블 트랜잭션은 `remove/undoRemove` 두 메서드 안에만 있다(infra AGENTS 규칙 "트랜잭션은 다중 테이블 쓰기에만 명시적으로"와 일치). 일반 `transaction(fn)` API는 두지 않는다 — Dexie 트랜잭션 존 안에서 비-Dexie `await`가 섞이면 조용히 깨지므로 에이전트가 쓰기 위험하다. 타이머의 세션 종료 + `Todo.focusSeconds` 갱신은 두 호출로 하고 실패 시 세션 상태를 원천으로 재계산한다(캐시라 정합 회복 가능).
- 계약 테스트 `src/repositories/*.contract.test.ts`는 팩토리를 인자로 받아 memory(T-08)와 indexeddb(T-10) 둘 다 실행한다.

## 7. 테스트 전략

| 층 | 도구 | 범위(필수) | 하지 않는 것 |
|----|------|-----------|-------------|
| 도메인 | Vitest | `src/domain/**` 모든 export 함수, 커버리지 100%(`--coverage` 게이트 95% 미만 실패), 스펙 R-번호 = 테스트명. 타이머 경과·완료 판정은 `now` 주입, 카테고리 전이 표 전수 | 타입만 있는 파일 |
| 저장소 | Vitest + fake-indexeddb | 계약 테스트를 memory·indexeddb 동일 실행, 마이그레이션 테스트(v_n→v_{n+1}), 정렬·소프트 삭제·`updatedAt` 갱신, `remove/undoRemove` 원자성(중간 실패 주입 → 변화 0) | Dexie 내부 동작 |
| 스토어 | Vitest + memory 저장소 | 액션별 성공·실패(롤백)·낙관적 갱신 | 렌더 |
| 컴포넌트 | Testing Library(`getByRole`) | 기능당 핵심 행동 1~3개(추가·토글·삭제·키보드), IME 조합, 포커스 이동, `aria-*` | 스냅샷, 픽셀, 애니메이션 타이밍 |
| 토큰 | Vitest | `tokens.css` 파싱 → theme.md 표와 값 일치, 대비 계산(≥ 4.5:1 / 3:1) | 브라우저 렌더 |
| 성능 | Vitest 벤치(`*.slow.test.ts`, CI만) | 200개/일 토글 50ms, 10,000개 검색 150ms, 50,000개 가져오기 10s | 실기기 프로파일링 |
| E2E | Playwright(chromium, CI: PR 라벨 `e2e` 또는 main push) | 스모크 1개(로드 → 카테고리 → 투두 → 체크 → 달성률 → 새로고침 유지), 키보드 완주 1개, 오프라인 새로고침 1개, 테마 깜빡임 1개 | 크로스 브라우저 매트릭스, 시각 회귀 |

`pnpm test` 3초 이내(느린 것은 `*.slow.test.ts`). 테스트 데이터는 `src/test/fixtures` 팩토리만.

## 8. 성능 예산 (초과 = 리뷰 Major, 20% 초과 = Blocker)

| 항목 | 목표 | 측정 방법 |
|------|------|----------|
| 첫 로드 JS(route `/`, gzip) | ≤ 200KB | `next build` 출력, 의존성 변경 PR에 첨부 |
| 폰트(woff2 1파일, 별도 계상) | ≤ 600KB, 예상 450KB(가변 폰트 2,350자 서브셋; 전체 11,172자 원본 ≈ 2MB의 약 22%) | 파일 크기 검사(T-22 PR·CI `du`), 첫 로드 총 전송량(JS+CSS+폰트) ≤ 900KB |
| LCP / INP / CLS (데스크탑, 로컬, 프로덕션 빌드) | ≤ 1.5s / ≤ 100ms / ≤ 0.05 | Lighthouse, M4 완료 시 리포트 첨부 |
| 첫 입력 가능(로드 → 입력 행 포커스 가능) | ≤ 1s | E2E 타이머 |
| 날짜 변경 → 목록 렌더 | ≤ 100ms(100개/일) | 벤치 테스트 |
| 완료 토글 → 화면 반영 / 완료 블록 이동 시작 | ≤ 50ms(낙관적) / 체크 후 400ms 대기 + 200ms 모션, 그룹 재정렬 계산 ≤ 5ms(200개) | 벤치 테스트 |
| 카테고리 삭제(투두 500개 이동) | ≤ 300ms 단일 트랜잭션, UI 블로킹 없음 | 벤치 테스트 |
| 타이머 | 백그라운드 60분 후 표시 오차 ≤ 1초, 1초 갱신이 칩·링 2개 컴포넌트만 리렌더 | 단위 테스트(`now` 주입) + 프로파일 |
| 1,000개 투두 전체 / 200개 한 날짜 | 스크롤 60fps, 가상화 없이 | 수동 프로파일 + 벤치 |
| 팔레트 검색(10,000개) | ≤ 150ms | 벤치 테스트 |
| 백업 가져오기(50,000개) | ≤ 10s, 메인 스레드 블로킹 ≤ 50ms 단위 | 벤치 테스트(청크 500) |
| 메모리 상주 데이터 | 선택 주 7일 투두 + 카테고리 전체만(전체 투두 로드 금지, 백업·검색 제외) | 코드 리뷰 |
| 프리캐시 | ≤ 2.5MB(폰트 포함) | 빌드 출력 |

## 9. 접근성 목표 (WCAG 2.2 AA 중 지키는 범위)

| 기준 | 적용 |
|------|------|
| 1.4.3 / 1.4.11 대비 | 텍스트 4.5:1, 비텍스트(테두리·아이콘·포커스 링) 3:1 — 토큰 테스트로 자동 검증 |
| 2.1.1 키보드 / 2.1.2 트랩 없음 | 모든 스펙 §5. 드래그는 항상 키보드·메뉴 대안(2.5.7) |
| 2.4.3 포커스 순서 / 2.4.7 포커스 표시 / 2.4.11 포커스 가림 없음 | app-shell R10, theme §5, 고정 헤더가 포커스 요소를 덮지 않음 |
| 2.5.8 타깃 크기 | 클릭 영역 ≥ 24×24(우리 기준 32×32) |
| 3.2.1/3.2.2 예측 가능 | 포커스·입력만으로 문맥 변경 없음(팔레트 Enter 제외) |
| 3.3.1 오류 식별 / 3.3.3 제안 | 검증 문구는 각 스펙 §2-C |
| 4.1.2 이름·역할·값 | 시맨틱 요소 + `aria-*`, axe critical 0 |
| 2.3.3 (AAA) 모션 | `prefers-reduced-motion` 전면 준수 |
| 미적용(기록) | 2.1.4 단일 키 단축키 끄기/재설정(1.5 검토), 1.4.12 텍스트 간격, 다국어 |

## 10. PWA / 오프라인 / 폴백 전략

- Serwist: `src/app/sw.ts`가 빌드 산출물 프리캐시(`defaultCache` 중 정적 자산만), 런타임 캐시 규칙 없음(외부 데이터 요청 없음). 개발 모드 비활성(`disable: process.env.NODE_ENV === 'development'`).
- **폰트 프리캐시: 한다.** `next/font/local`이 폰트를 `.next/static/media/<hash>.woff2`로 내보내므로 Serwist 프리캐시 매니페스트에 자동 포함된다(`maximumFileSizeToCacheInBytes` 기본 2MB > 600KB). 근거: 설치 용량 +450KB(1회, 해시 불변)와 맞바꿔 오프라인 첫 실행·재방문에서 폰트 교체(FOUT)가 사라지고 룩이 항상 같다. 폰트 파일 위치는 `public/fonts/`가 아니라 `src/app/fonts/` — `next/font/local`은 import 경로가 필요하고, `public/`에 두면 preload·해시·프리캐시를 손으로 관리해야 한다.
- 데이터는 IndexedDB 단일 원천. 서버·API Route 없음. 오프라인은 "특별한 상태"가 아니다.
- **저장소 폴백**: `db.open()` 거부 시 `providers.tsx`가 `createMemoryRepositories()`를 주입하고 `storageMode: 'memory'`를 셸에 알린다(app-shell §2-C 배너). 메모리 모드에서도 백업 내보내기는 동작.
- **첫 페인트 테마**: `layout.tsx`의 인라인 스크립트가 `localStorage['tasky.theme.v1']`를 읽어 `data-theme`를 설정(theme R6). 저장소 로드 후 값이 다르면 저장소 값으로 덮고 미러 갱신.
- **다중 탭**: MVP는 `visibilitychange` 재조회(pwa R8). 1.5에서 `BroadcastChannel('tasky-db')`로 실시간 반영.
- **지속성**: 첫 투두 저장 후 `navigator.storage.persist()` 1회(pwa R6).

## 11. 위험 요소와 완화책

| # | 위험 | 영향 | 가능성 | 완화책 | 조기 경보 신호 |
|---|------|------|--------|--------|---------------|
| 1 | 리서치가 2차 자료 기반이라 GUI 유사도가 낮게 나옴 | 높음 | 중 | 수치를 `theme.md` 한 곳에 두어 확인 후 토큰만 교체, M2 완료 시 사용자 스크린샷 리뷰 | 사용자 관점 리뷰어가 "레퍼런스 앱 느낌이 아님"을 M2에서 지적 |
| 2 | 기능 과다로 레퍼런스 앱과 같은 "답답함" 재현 | 높음 | 중 | P1(≤160px)·P2(패널 접기) 자동 테스트, 스펙 §6 범위 밖 준수, 새 진입점 금지(app-shell R12) | 고정 영역 높이 테스트 실패, 사이드바 항목 추가 PR |
| 3 | 브라우저가 IndexedDB를 지움(용량 압박·사생활 모드) | 높음 | 낮 | `persist()` 요청, 백업 경고 점(30일), 메모리 폴백 + 배너 | `persist()` false 비율, 폴백 배너 노출 |
| 4 | Dexie 마이그레이션 실수로 데이터 유실 | 높음 | 낮 | §5 규칙 1~4, 마이그레이션 테스트 필수, `SCHEMA_UPGRADE_FAILED` 시 백업 전용 모드 | 버전업 PR에 테스트 없음 |
| 5 | 병렬 티켓의 파일 충돌·리베이스 지옥 | 중 | 중 | §3 웨이브·§4 공유 파일 순서, `owns` 밖 변경은 Blocker, 배럴 파일은 순차 소유 | BOARD.md에 같은 파일이 두 티켓에 |
| 6 | 한글 IME에서 Enter 이중 입력·단일 키 오작동 | 중 | 높 | todo R4, shortcuts R6, `compositionstart/end` 테스트 필수 | 한글 입력 시 투두가 2개 생김 |
| 7 | Next 15 + Tailwind 4 + Serwist 9 조합의 도구 마찰 | 중 | 중 | T-01에서 조합 검증 후 lock 고정, 메이저 업그레이드는 티켓 분리 | T-01 빌드 실패, SW 미등록 |
| 8 | 큰 하루 목록(200+)에서 리렌더 폭증 | 중 | 중 | selector 구독, 항목 메모, 그룹 단위 상태, 벤치 테스트 게이트 | 토글 50ms 초과 |
| 9 | 팔레트가 일정을 잡아먹음 | 중 | 중 | 컷 라인(§2), T-19는 셸과 독립(CommandLayer 슬롯) | M3가 계획 대비 2 웨이브 이상 지연 |
| 12 | 타이머 시각 계산 오류·다중 탭 이중 실행 | 중 | 중 | timer R3~R5(시각 기준, 저장소가 원천, `getActive` 1개), `now` 주입 테스트, `visibilitychange` 재판정 | 백그라운드 복귀 시 남은 시간 점프 |
| 13 | 카테고리 삭제 대화상자 복잡도(3선택지·즉석 생성·원자성)로 T-12b 지연 | 중 | 중 | 도메인이 `CategoryRemovalPlan`을 만들고 저장소가 실행만, 축약형은 공용 ConfirmDialog 재사용, 계약 테스트 선행 | T-12b diff 300줄 초과 |
| 14 | 완료 항목 하단 이동 모션이 빠른 연속 체크에서 어지러움 | 낮 | 중 | todo R8 400ms 대기·병합, reduced-motion 즉시 | 사용자 관점 리뷰어 지적 |
| 10 | 서브셋(2,350자) 밖 글자가 폴백 폰트로 섞여 렌더 | 낮 | 중 | theme R12(허용 명시), 폴백 스택을 Pretendard와 골격이 비슷한 OS 고딕으로 고정, 1.5에서 사용 빈도 보고 범위 확장(재서브셋만, 코드 변경 없음) | 사용자 관점 리뷰어가 혼합 글꼴 지적 |
| 11 | 단일 키 단축키가 보조기기 사용자와 충돌(WCAG 2.1.4) | 중 | 낮 | 포커스 조건 제한(R1), 1.5에서 끄기 설정 | 접근성 리뷰어 지적 |

## 12. 확장 지점 체크리스트 — Phase 2(캘린더·통계·루틴·다이어리·동기화)·Phase 3(SNS)를 위해 MVP가 지킬 것

| # | MVP에서 지킬 것 | 나중에 열리는 것 | 확인 방법 |
|---|----------------|-----------------|----------|
| 1 | 모든 엔티티 `id`(nanoid)·`createdAt`·`updatedAt`·`deletedAt?` 유지, 물리 삭제는 `replaceAll`뿐 | 동기화 충돌 해결(LWW), 서버 병합 | 계약 테스트 |
| 2 | `updatedAt` 인덱스 존재 | `listChangedSince(ts)` 추가 시 버전업 불필요 | `db.ts` v1 |
| 3 | `Todo.doneAt` 기록, `FocusSession` 레코드(카테고리 스냅샷 포함) | 통계(시간대별·스트릭·집중 시간·카테고리별), 피드("방금 완료") | todo R6, timer R8·R13 테스트 |
| 4 | `Todo.date`는 인스턴스 날짜, 템플릿 개념 없음 | 루틴: `routineId?` 추가 + `domain/todo/recurrence.ts` | ARCHITECTURE §5 |
| 5 | `Todo`에 `visibility`·`ownerId`를 넣지 않음(YAGNI) | SNS: 버전업으로 추가, 기본값 `private` | 코드 리뷰 |
| 6 | `Category.status/closedAt`, 삭제는 tombstone | 통계에서 종료·삭제 카테고리 별도 집계, 휴지통(삭제 복구) | category R7·R14 |
| 7 | `Settings.id = 'default'` 단일 문서 | 다중 프로필: `profileId` | ARCHITECTURE §5 |
| 8 | `DateKey` 산술은 `lib/date.ts` 한 곳 | 월간 캘린더·주간 뷰가 같은 함수 사용 | Grep `new Date(` 가 lib 밖에 없음 |
| 9 | `summarizeWeek`가 날짜 범위 일반화(`summarizeRange`) 가능한 시그니처 | 월간 점 표시·히트맵 | completion-rate §4 |
| 10 | 인사이트 패널은 "슬롯"(섹션 배열) | 캘린더·통계 위젯을 슬롯에 추가, 메인은 불변(P2) | app-shell §6 |
| 11 | 명령 레지스트리(`registerCommands`) | Phase 2 기능이 메뉴 대신 명령으로 진입 | shortcuts R7 |
| 12 | 백업 `schemaVersion` + 변환 체인 | 새 엔티티(diary·routine) 포함 시 버전 n+1 | backup R3 |
| 13 | `infra`를 import하는 곳은 `providers.tsx`·`test/setup.ts`뿐 | `infra/sync/` 어댑터를 같은 컨테이너로 주입 | ESLint 규칙 + Grep |
| 14 | 레포지토리는 `Promise` + 도메인 타입만 | 원격 구현(REST/WebSocket)으로 교체 가능 | 계약 테스트 재사용 |
| 15 | UI 선호(접힘·최근 명령)는 localStorage, 데이터는 저장소 | 동기화 범위 = 저장소만 | 코드 리뷰 |

## 13. 문서 갱신 의무 (구현과 같은 PR)

- 구조 변경: `ARCHITECTURE.md`(§2 트리·§4 모델·§6 조립) + `DIRECTORY_MAP.md`.
- 스키마 변경: ADR + `DECISIONS.md` 행 + §5 규칙 4.
- 스펙과 다르게 구현: 핸드오프 `decisions:` → 후속 `docs(specs)` PR(스펙 AGENTS.md 규칙 2).
- 이 문서의 티켓 표(§3)는 오케스트레이터가 발행 시점에 BOARD.md로 옮기고, 표 자체는 회고 때만 갱신한다.
