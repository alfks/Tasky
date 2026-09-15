<!-- 읽기 조건: 레이어 경계를 넘는 변경(domain/repositories/infra 수정, 새 feature 디렉토리 생성, 스키마 변경)을 하기 전. 단일 컴포넌트 수정에는 불필요. -->

# Tasky 아키텍처 맵

코드가 아직 없으므로 이 문서는 **앞으로 만들 구조**의 단일 소스다. 구현이 이 문서와 달라지면 ADR + 이 문서 갱신이 한 PR에 있어야 한다.
디렉토리별 세부 규칙은 각 노드의 `AGENTS.md`에만 있다(여기에 중복하지 않는다).

## 1. 레이어와 의존 방향

```mermaid
flowchart TB
  subgraph UI["UI 레이어  (src/app, src/components, src/features/*/components)"]
    APP["app/ 라우트 셸"] --> FC["features/*/components"]
    FC --> CU["components/ui (공용 프리미티브)"]
  end
  subgraph STATE["상태 레이어  (src/features/*/store, hooks)"]
    HK["features/*/hooks"] --> ST["features/*/store (Zustand)"]
  end
  subgraph DOMAIN["도메인 레이어  (src/domain)  — 프레임워크 의존 0"]
    EN["엔티티 · 값 객체 (Todo, Category, DateKey, Theme)"]
    RU["규칙 · 순수 함수 (validate, completionRate, reorder)"]
  end
  subgraph PORT["레포지토리 인터페이스  (src/repositories)"]
    RI["TodoRepository · CategoryRepository · SettingsRepository"]
    RM["memory/* (테스트용 구현)"]
    RC["index.ts — Repositories 컨테이너, get/setRepositories()"]
  end
  subgraph INFRA["인프라 레이어  (src/infra)  — 최하단"]
    IDB["indexeddb/ (Dexie: db.ts, *-indexeddb-repository.ts)"]
    SYNC["sync/ (Phase 2: SyncAdapter 구현, 서버 API)"]:::ext
  end
  FC --> HK
  ST --> RU
  ST --> RC
  RC -. 런타임 주입 .-> IDB
  RC -. 테스트 주입 .-> RM
  IDB -- implements --> RI
  RM -- implements --> RI
  RI --> EN
  RU --> EN
  SYNC -. Phase 2 .-> RI
  classDef ext stroke-dasharray: 5 5,stroke:#888;
```

**의존 규칙 (ESLint `no-restricted-imports`가 강제)**

| 레이어 | import 허용 | import 금지 |
|--------|------------|------------|
| `src/app` | `features`, `components`, `styles` | `domain` 직접(훅 경유), `repositories`, `infra` |
| `src/components` | `lib`, `styles` | `features`, `domain`, `repositories`, `infra` (완전 무상태 프리미티브) |
| `src/features` | `domain`, `repositories`(인터페이스·컨테이너), `components`, `lib` | `infra`, 다른 feature의 내부 경로(`features/<other>/index.ts`만 허용) |
| `src/domain` | `lib`(순수 유틸만) | `react`, `next`, `dexie`, `zustand`, `features`, `repositories`, `infra`, `window/document` |
| `src/repositories` | `domain` | `react`, `dexie`, `features`, `infra` |
| `src/infra` | `domain`, `repositories`(인터페이스) | `react`, `next`, `features`, `components` |
| `src/lib` | 외부 순수 패키지 | 그 외 전부 |

원칙: **UI → 상태 → 도메인 → 인터페이스 ← 인프라**. 인프라는 인터페이스를 구현할 뿐, 누구도 인프라를 import하지 않는다. 유일한 예외는 조립 지점(`src/app/providers.tsx`)이 `infra/indexeddb`의 구현을 `setRepositories()`로 주입하는 것.

## 2. 디렉토리 트리 (각 노드 → 그 디렉토리의 `AGENTS.md`)

```
Tasky/
├── CLAUDE.md · AGENTS.md · README.md
├── .github/            → .github/AGENTS.md
├── .githooks/          → .githooks/AGENTS.md
├── .worktrees/         → .worktrees/AGENTS.md         (gitignore, 로컬 보드/티켓)
├── scripts/            → scripts/AGENTS.md
├── docs/               → docs/AGENTS.md
│   ├── conventions/    → docs/conventions/AGENTS.md
│   ├── research/       → docs/research/AGENTS.md
│   ├── specs/          → docs/specs/AGENTS.md
│   └── decisions/      → docs/decisions/AGENTS.md
├── public/             (아이콘, manifest — AGENTS.md 불필요: 정적 자산만)
├── tests/e2e/          → tests/AGENTS.md              (스캐폴딩 후)
└── src/                → src/AGENTS.md                (스캐폴딩 후, 아래 전부 동일)
    ├── app/            → src/app/AGENTS.md            라우트·레이아웃·providers·PWA 메타
    ├── components/     → src/components/AGENTS.md     ui/ 프리미티브(Button, Checkbox, Popover…)
    ├── features/       → src/features/AGENTS.md
    │   ├── todo/         투두 목록·아이템·입력, todo-store
    │   ├── category/     카테고리 관리·색상 선택, category-store
    │   ├── date-strip/   날짜 스트립·선택 날짜, date-store
    │   ├── stats/        달성률 표시(도메인 계산 결과 렌더)
    │   └── theme/        테마 토글·강조색, theme-store
    ├── domain/         → src/domain/AGENTS.md
    │   ├── todo/  category/  date/  theme/  errors.ts
    ├── repositories/   → src/repositories/AGENTS.md
    │   ├── todo-repository.ts  category-repository.ts  settings-repository.ts
    │   ├── memory/           in-memory 구현(테스트)
    │   └── index.ts          컨테이너
    ├── infra/          → src/infra/AGENTS.md
    │   ├── indexeddb/        db.ts(Dexie 스키마·버전), *-indexeddb-repository.ts
    │   └── sync/             (Phase 2 — 지금은 만들지 않음)
    ├── lib/            → src/lib/AGENTS.md            cn.ts, date.ts, id.ts
    ├── styles/         → src/styles/AGENTS.md         tokens.css, globals.css
    └── test/           → src/test/AGENTS.md           setup.ts, fixtures/
```
링크가 있는 표 형태는 [DIRECTORY_MAP.md](./DIRECTORY_MAP.md).

## 3. 레이어별 책임

| 레이어 | 책임 | 하지 않는 것 |
|--------|------|------------|
| UI | 렌더, 이벤트 → 훅 호출, 접근성, 토큰 기반 스타일 | 계산, 저장, 검증 |
| 상태 | 화면 상태 보관, 레포지토리 호출 오케스트레이션, 낙관적 갱신·롤백, 에러 → 사용자 문구 | 비즈니스 규칙 판단(도메인에 위임) |
| 도메인 | 엔티티 정의, 검증, 계산(달성률·정렬), 불변 업데이트 함수 | I/O, 프레임워크, 시간/ID 생성(주입받음) |
| 인터페이스 | 저장소 계약(`Promise` 기반, 도메인 타입만), 컨테이너 | 구현 세부 |
| 인프라 | Dexie 스키마·버전·마이그레이션, 직렬화, 인터페이스 구현 | 도메인 규칙, UI 상태 |

## 4. 데이터 모델 (MVP)

```ts
type DateKey = `${number}-${number}-${number}`;           // 'YYYY-MM-DD'
type Todo     = { id; categoryId; date: DateKey; title; done: boolean; order: number; createdAt; updatedAt; deletedAt? };
type Category = { id; name; color: string; emoji?: string; order: number; createdAt; updatedAt; deletedAt? };
type Settings = { theme: 'light' | 'dark' | 'system'; accentColor: string; updatedAt };
```
- `createdAt/updatedAt/deletedAt`는 ISO 문자열, 소프트 삭제. **동기화(Phase 2)의 충돌 해결 키**이므로 MVP에서도 반드시 유지.
- ID는 nanoid(21자). 클라이언트 생성 → 서버 없이도 전역 유일.
- IndexedDB 인덱스: `todos: id, date, categoryId, [date+categoryId], updatedAt`, `categories: id, order`, `settings: id`.

## 5. 확장 지점 (지금 만들지 않되, 막지 않는다)

| 확장 | 예약 위치 | MVP에서 지킬 것 |
|------|---------|---------------|
| 클라우드 동기화 | `src/infra/sync/`, `repositories/sync-adapter.ts`(Phase 2에 추가) | 소프트 삭제·`updatedAt` 유지, 레포지토리 외부에서 Dexie 참조 금지, ID 클라이언트 생성 |
| SNS(친구·피드·반응) | `src/features/social/`, `src/domain/social/` | `Todo`에 `visibility` 같은 필드를 **미리 넣지 않는다**(YAGNI). 스키마 버전업으로 대응 |
| 루틴/반복 투두 | `src/domain/todo/recurrence.ts` | `Todo.date`는 인스턴스 날짜로 유지(템플릿과 분리) |
| 다중 프로필/계정 | `Settings`에 `profileId` | 지금은 단일 프로필 가정, DB 이름 `tasky` 고정 |
| 서버 컴포넌트 활용 | `src/app` | 로컬 우선이므로 데이터는 전부 클라이언트. 서버 컴포넌트는 셸/메타데이터만 |

## 6. 조립 지점

`src/app/providers.tsx`(client): 앱 시작 시 `setRepositories(createIndexedDbRepositories())` → 각 feature store가 `getRepositories()`로 사용. 테스트는 `src/test/setup.ts`에서 `setRepositories(createMemoryRepositories())`. 이 두 파일 외에 `infra`를 import하는 곳이 있으면 리뷰 Blocker.

## 7. 관련 ADR

- [ADR-0001](./decisions/ADR-0001-nextjs-app-router.md) Next.js App Router + PWA
- [ADR-0002](./decisions/ADR-0002-local-first-indexeddb-repository.md) 로컬 우선 + IndexedDB(Dexie) + repository 패턴
- [ADR-0003](./decisions/ADR-0003-state-and-styling.md) Zustand + Tailwind v4 + CSS 변수 토큰
- [ADR-0004](./decisions/ADR-0004-agent-collaboration-rules.md) 멀티 에이전트 협업 규칙
