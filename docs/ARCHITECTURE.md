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
  subgraph DOMAIN["도메인 레이어  (src/domain)  — 외부 패키지 0"]
    EN["엔티티 · 값 객체 (Todo, Category, DateKey, Theme)"]
    RU["규칙 · 순수 함수 (validate, completionRate, reorder, touch/markDeleted → Persistable)"]
  end
  subgraph PORT["레포지토리 인터페이스  (src/repositories)"]
    RI["TodoRepository · CategoryRepository · SettingsRepository · FocusSessionRepository (upsert(Persistable) + 조회) · DatasetRepository (readAll/write/restore)"]
    RM["memory/* (테스트용 구현)"]
    RC["container.ts — Repositories 컨테이너, get/setRepositories()"]
  end
  subgraph INFRA["인프라 레이어  (src/infra)  — 최하단"]
    IDB["indexeddb/ (Dexie: db.ts ← query.ts ← *-indexeddb-repository.ts)"]
    SYNC["sync/ (Phase 2: SyncAdapter 구현, conflict.ts)"]:::ext
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

**의존 규칙 — 허용 목록(allow-list)이다(ADR-0006).** 아래 표에 적힌 것만 import 할 수 있고 **그 외 `src/**` 는 전부 금지**다. 표의 단일 소스는 `scripts/arch-layers.mjs`(`ALLOW`)이며, `eslint.config.mjs` 가 그 한 목록에서 허용 목록의 **두 표현**을 만든다 — `import/no-restricted-paths`(해석된 실제 경로로 판정하므로 별칭·배럴은 풀어서 본다. 상대 경로는 아예 금지)와, 그 규칙이 보지 못하는 구문에 같은 판정을 거는 문자열 패턴(**표기 정규형 강제**가 전제다 — 확장자·`/index`·`./`·중복 슬래시 같은 다른 표기는 그 자체가 에러). 문자열로 경로를 판정하는 나머지 규칙(조립 지점·`lib/date`·`db.ts`·자기 배럴·패키지 목록)도 같은 전제 위에 있다. **모듈 경로를 문자열로 쓰는 구문은 전수 점검해 각각 어느 규칙이 받는지 고정했다** — 목록과 실측 결과는 ADR-0006 결정 10(라운드 4: `typeof import()`, 라운드 5: `new URL('@/…', import.meta.url)` 이 두 표현을 모두 빠져나가던 구멍을 그때 닫았다). 주석이라 셀렉터가 닿지 않는 구문 둘은 따로 받는다: 삼중슬래시 지시자(`/// <reference path|types|lib>`)는 `@typescript-eslint/triple-slash-reference`(세 옵션 전부 `never` — 기본값은 `types = "…"` 를 통과시킨다) + `scripts/check-arch.sh` 의 grep(`=` 양옆 공백 포함)이 막고, JSDoc `@type {import('@/…')}` 은 `src/` 가 `.ts`/`.tsx` 만 허용하므로 타입이 적용되지 않아(실측) 의존 간선을 만들지 않는다. `src/**` 의 모든 파일은 정확히 하나의 레이어에 속하며, 어느 레이어에도 없는 파일은 파일 자체가 린트 에러다. 규칙이 실제로 잡는지는 `scripts/check-arch.sh`가 위반·허용 픽스처(feature 2개 기준 102건)로 검증한다. **아키텍처 규칙(`arch-layers.mjs` 의 `ARCH_RULES`)은 인라인 지시자로 끌 수 없다** — `check-arch.sh` 가 `eslint --no-inline-config -c eslint.arch.config.mjs src` 2차 패스를 한 번 더 돌리고, 그 모드에서는 ESLint 가 `eslint-disable` 계열·`/* eslint … */`·`/* eslint-env */`·`/* global */` 을 **전부 무시**하므로 문법 변형으로 우회할 자리가 없다(ADR-0008, 라운드 3 우회 39종 + 구조적 우회 9종 실측). 1차 패스(`pnpm lint`)는 스타일 규칙의 정당한 disable 을 그대로 허용한다. 남는 한계: 2차 패스의 범위는 `src/` 이므로 레포 루트나 `src/` 밖에 둔 코드 파일은 이 보장 밖이고(위치 규칙은 DIRECTORY_MAP.md + 리뷰), `eslint.config.mjs`·`eslint.arch.config.mjs`·`arch-layers.mjs` 자체를 고치는 것은 리뷰가 받는다 — 규칙 목록이 갈라지면 설정 로드 시점에 throw 한다(가드 4~6).
**스캐폴딩 전(`package.json` 없음)에는 린트가 존재하지 않는다** — 그때까지 이 표는 문서일 뿐이므로 `src/` 코드 티켓은 스캐폴딩 PR 머지 후에만 발행한다.

| 레이어                                                     | import 허용 — **이것만**(자기 레이어 포함)                                                                                                                                                                                                                                      | 외부 패키지                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `src/app`                                                  | `app`, `components`, `lib`, `styles`, `features/<f>/index.ts`(feature 내부 경로 금지). `@/app/providers` 는 `layout.tsx` 만 import(표기 정규형 + 구문 거울로 강제 — ADR-0006 결정 9). 예외 `app/providers.tsx`(조립 지점): + `repositories`, `infra`, `features`, 재export 금지 | `dexie`·`zustand` 금지                                                |
| `src/components`                                           | `components`, `lib`, `styles` (무상태 프리미티브)                                                                                                                                                                                                                               | `dexie`·`zustand` 금지                                                |
| `src/features/<f>`                                         | 자기 feature, `domain`, `repositories`, `components`, `lib`, `styles`, 다른 feature 의 `index.ts` 만                                                                                                                                                                            | `dexie` 금지                                                          |
| `src/domain`                                               | `domain`, `lib`                                                                                                                                                                                                                                                                 | **0개**(허용 목록) + 브라우저 전역·`Date`·`crypto`·`Math.random` 금지 |
| `src/repositories`                                         | `repositories`, `domain`, `lib`                                                                                                                                                                                                                                                 | **0개**                                                               |
| `src/infra`                                                | `infra`, `domain`, `repositories`, `lib`. `indexeddb/db.ts` 는 `query.ts` 만 import(테스트 계층 제외)                                                                                                                                                                           | `dexie` 만                                                            |
| `src/lib`                                                  | `lib`                                                                                                                                                                                                                                                                           | `clsx`, `tailwind-merge` 만                                           |
| `src/styles`                                               | (코드 없음 — `.css` 만)                                                                                                                                                                                                                                                         | —                                                                     |
| `src/test`, `*.test.*`                                     | 전부(계약 테스트가 구현을 직접 돌린다). 역방향: 비테스트 파일은 `src/test`·`*.test.*` import 금지                                                                                                                                                                               | 제한 없음                                                             |
| `src/middleware.ts`, `src/instrumentation.ts`, `src/sw.ts` | `lib` (프레임워크·빌드가 위치를 강제하는 유일한 `src/` 직속 **코드** 파일 — `sw.ts` 는 서비스워커 진입점(ADR-0010). 그 밖에 `src/` 직속에 올 수 있는 것은 `AGENTS.md` 뿐)                                                                                                       | —                                                                     |

원칙: **UI → 상태 → 도메인 → 인터페이스 ← 인프라**. 인프라는 인터페이스를 구현할 뿐이다. 경로 표기는 항상 `@/…`(code-style.md §7 표).

**보장되는 것과 보장되지 않는 것**(린트는 *import 간선*만 본다 — 값의 흐름은 보지 못한다. 실측 근거: ADR-0006):

- 보장: 테스트 계층(`src/test/**`, `*.test.*` — 경계 규칙 면제)과 `infra` 자신을 빼면, `infra` 를 **import** 하는 파일은 `app/providers.tsx` 하나다. 그 파일을 import 할 수 있는 파일도 `layout.tsx` 하나다 — 표기 변형과 ADR-0006 결정 10 이 열거한 모듈 경로 구문 전수(정적·`import type`·동적 `import()`·`typeof import()`·모킹·`require` 계열·`new URL('…', import.meta.url)`)에 대해 실측했고 `check-arch.sh` 픽스처가 고정한다(주석인 삼중슬래시 지시자는 §1 의 규칙 + grep 이 별도로 막는다). 이 판정은 `eslint-disable` 로 끌 수 없다 — 2차 패스가 지시자를 무시하고 다시 본다(ADR-0008). `providers.tsx` 의 재export(`export … from`)는 금지된다 — 재export 한 줄로 조립 지점을 경유지 삼는 2홉은 막힌다.
- 보장 안 됨: `providers.tsx` 가 `export const getDb = () => db` 처럼 **직접 래퍼를 써서** infra 값을 내보내는 것. import 간선 규칙으로는 잡을 수 없다. 이 한 파일(`providers.tsx`)이 그래서 아키텍처 리뷰 대상이고(agent-collaboration.md 페르소나 표), 그 파일이 커지면 레포지토리 주입 외의 일을 하고 있다는 신호다.

## 2. 디렉토리 트리 (각 노드 → 그 디렉토리의 `AGENTS.md`)

```
Tasky/
├── CLAUDE.md · AGENTS.md · README.md
├── .github/            → .github/AGENTS.md
├── .githooks/          → .githooks/AGENTS.md
├── .worktrees/         → .worktrees/AGENTS.md         (gitignore, 로컬 보드/티켓)
├── scripts/            → scripts/AGENTS.md            arch-layers.mjs(레이어·허용 목록 단일 소스)
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
    ├── features/       → src/features/AGENTS.md       (각 feature 에 index.ts — src/ 에서 유일한 배럴)
    │   ├── todo/         투두 목록·아이템·입력, todo-store
    │   ├── category/     카테고리 관리·색상 선택, category-store
    │   ├── date-strip/   날짜 스트립·선택 날짜, date-store
    │   ├── stats/        달성률 표시(도메인 계산 결과 렌더)
    │   └── theme/        테마 토글·강조색, theme-store
    ├── domain/         → src/domain/AGENTS.md         (배럴 없음)
    │   ├── todo/  category/  date/  theme/  focus/  meta.ts(Meta, Persistable, createMeta/touch/markDeleted/adopt)  ids.ts  dataset.ts  errors.ts
    ├── repositories/   → src/repositories/AGENTS.md
    │   ├── todo-repository.ts  category-repository.ts  settings-repository.ts  focus-session-repository.ts  dataset-repository.ts
    │   ├── memory/           in-memory 구현(테스트) + live.ts(툼스톤 필터 헬퍼)
    │   └── container.ts      컨테이너(get/setRepositories)
    ├── infra/          → src/infra/AGENTS.md
    │   ├── indexeddb/        db.ts(Dexie 스키마·버전) · query.ts(조회 liveAll/liveOne/liveBy/liveBetween/liveOrderBy · 쓰기 put · DatasetRepository 전용 allRows/clear/bulkPut/store.transaction · 묶음 Store/tables/createStore) · *-indexeddb-repository.ts · repositories.ts(조립)
    │   └── sync/             (Phase 2 — 지금은 만들지 않음)
    ├── lib/            → src/lib/AGENTS.md            cn.ts, date.ts(nowIso), id.ts(newId)
    ├── styles/         → src/styles/AGENTS.md         tokens.css, globals.css (.css 만)
    └── test/           → src/test/AGENTS.md           setup.ts, fixtures/
```

링크가 있는 표 형태는 [DIRECTORY_MAP.md](./DIRECTORY_MAP.md).

## 3. 레이어별 책임

| 레이어     | 책임                                                                                                                | 하지 않는 것                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| UI         | 렌더, 이벤트 → 훅 호출, 접근성, 토큰 기반 스타일                                                                    | 계산, 저장, 검증                                    |
| 상태       | 화면 상태 보관, 레포지토리 호출 오케스트레이션, 낙관적 갱신·롤백, 에러 → 사용자 문구                                | 비즈니스 규칙 판단(도메인에 위임), `Meta` 필드 쓰기 |
| 도메인     | 엔티티 정의, 검증, 계산(달성률·정렬), 불변 업데이트 함수(`touch`·`markDeleted` — `Persistable` 을 만드는 유일한 곳) | I/O, 프레임워크, 시간/ID 생성(주입받음)             |
| 인터페이스 | 저장소 계약(`Promise` 기반, 도메인 타입만, `upsert(Persistable)` + 툼스톤 없는 조회), 컨테이너                      | 구현 세부, 시각·`rev` 생성, 삭제 메서드             |
| 인프라     | Dexie 스키마·버전·마이그레이션, 직렬화, 인터페이스 구현(`query.ts` 헬퍼 경유)                                       | 도메인 규칙, UI 상태                                |

## 4. 데이터 모델 (MVP)

```ts
type DateKey = `${number}-${number}-${number}`; // 'YYYY-MM-DD'
type Meta = { id: string; createdAt: string; updatedAt: string; rev: number; deletedAt?: string }; // 공통 필드 — 의미·규칙은 ADR-0005
type Persistable<T extends Meta> = T & { readonly [PERSISTABLE]: T }; // 저장 가능 브랜드(값은 true 가 아니라 T — 위조 방지, ADR-0007 결정 1)
type Todo = Meta & {
  categoryId: string;
  date: DateKey;
  title: string;
  memo?: string;
  done: boolean;
  doneAt?: string;
  order: number;
  focusSeconds?: number;
};
type Category = Meta & {
  name: string;
  color: string;
  emoji?: string;
  order: number;
  status: 'active' | 'completed' | 'paused';
  closedAt?: string;
};
type Settings = Meta & {
  id: 'default';
  theme: 'light' | 'dark' | 'system';
  accentColor: string;
  seededAt?: string;
  lastBackupAt?: string;
};
type FocusSession = Meta & {
  todoId?: string;
  categoryId?: string;
  date: DateKey;
  plannedSeconds: number;
  startedAt: string;
  pausedAt?: string;
  pausedTotalSeconds: number;
  endedAt?: string;
  elapsedSeconds: number;
  status: 'running' | 'paused' | 'completed' | 'canceled';
};
```

- `Meta`는 네 엔티티 모두 **예외 없이** 갖는다. `id`는 UUID v4(`lib/id.ts#newId()`), 시각은 ISO 8601 UTC(`toISOString()` 형식), `rev`는 쓰기마다 +1. 모든 변경은 도메인 `touch(entity, now)`를 거치고 그 결과(`Persistable<T>`)만 `upsert` 할 수 있다(타입으로 강제). 근거: ADR-0005 · ADR-0007.
- `Settings`는 단일 행(고정 id `'default'`)이다. 별도 key-value 테이블은 타입 안정성을 잃고, 다른 저장소(localStorage)는 계약 테스트·동기화 경로에서 빠지므로 기각. `Settings`는 삭제되지 않으므로 `deletedAt`이 설정되지 않는다(타입은 공통 유지 — 계약 테스트 단순화).
- 소프트 삭제 필터는 `query.ts`(IndexedDB)·`memory/live.ts` 한 곳씩. 카테고리 삭제 시 투두는 `categoryId`를 유지한다(ADR-0005 삭제 행).
- **툼스톤을 읽는 유일한 경로는 `DatasetRepository.readAll()`**이다(TECH_PLAN §6, ADR-0009 규칙 4 — 호출처 셋: 백업 내보내기, 병합 가져오기의 현재 스냅샷, "삭제됨" 그룹 표시). 엔티티 레포지토리에는 `includeDeleted` 옵션이 없다.
- IndexedDB 인덱스: `todos: id, date, categoryId, [date+categoryId], updatedAt`, `categories: id, order, status, updatedAt`, `settings: id`, `focusSessions: id, todoId, date, status, updatedAt`. 인덱스에 없는 필드(`rev`, `deletedAt`)는 Dexie 버전업 없이 추가·변경 가능.

## 5. 확장 지점 (지금 만들지 않되, 막지 않는다)

| 확장                | 예약 위치                                                                                                                                 | MVP에서 지킬 것                                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 클라우드 동기화     | `src/infra/sync/`(어댑터 + `conflict.ts` 충돌 정책), `repositories/sync-repository.ts`(Phase 2에 추가 — 툼스톤을 읽는 `listChangedSince`) | `Meta` 유지·`touch` 경유·소프트 삭제(ADR-0005·0007), 레포지토리 외부에서 Dexie 참조 금지, ID 클라이언트 생성            |
| SNS(친구·피드·반응) | `src/features/social/`, `src/domain/social/`                                                                                              | `Todo`에 `visibility` 같은 필드를 **미리 넣지 않는다**(YAGNI). 스키마 버전업으로 대응                                   |
| 루틴/반복 투두      | `src/domain/todo/recurrence.ts`                                                                                                           | `Todo.date`는 인스턴스 날짜로 유지(템플릿과 분리)                                                                       |
| 다중 프로필/계정    | `Settings.id`를 프로필 id로(지금은 `'default'`) + `todos`/`categories`에 프로필 키                                                        | 단일 프로필 가정, DB 이름 `tasky` 고정. 인덱스가 전부 `[date+…]` 접두이므로 도입 시 전 인덱스 재작성 — 착수 전 ADR 필수 |
| 서버 컴포넌트 활용  | `src/app`                                                                                                                                 | 로컬 우선이므로 데이터는 전부 클라이언트. 서버 컴포넌트는 셸/메타데이터만                                               |
| 새 레이어·확장자    | `scripts/arch-layers.mjs`(`LAYERS`·`ALLOW`·`SRC_EXT`)                                                                                     | ADR + 이 표 + `check-arch.sh` 케이스를 같은 PR에서                                                                      |

## 6. 조립 지점

`src/app/providers.tsx`(client): 앱 시작 시 `setRepositories(createIndexedDbRepositories())` → 각 feature store가 `getRepositories()`로 사용. 테스트는 `src/test/setup.ts`에서 `setRepositories(createMemoryRepositories())`. 이 두 파일과 테스트 계층(`src/test/**`, `*.test.*`), `infra` 자신 외에 `infra`를 import하면 `pnpm lint`가 실패한다(§1 허용 목록 — 어느 경유지를 거쳐도, 어떤 경로 표기·import 구문으로 써도, `eslint-disable` 을 어떤 문법으로 붙여도 마찬가지다. 한계는 §1 의 "보장 안 됨" 과 "남는 한계").

## 7. 관련 ADR

- [ADR-0001](./decisions/ADR-0001-nextjs-app-router.md) Next.js App Router + PWA (빌드·PWA 통합 지점은 ADR-0010이 보정)
- [ADR-0002](./decisions/ADR-0002-local-first-indexeddb-repository.md) 로컬 우선 + IndexedDB(Dexie) + repository 패턴
- [ADR-0003](./decisions/ADR-0003-state-and-styling.md) Zustand + Tailwind v4 + CSS 변수 토큰
- [ADR-0004](./decisions/ADR-0004-agent-collaboration-rules.md) 멀티 에이전트 협업 규칙
- [ADR-0005](./decisions/ADR-0005-entity-meta-and-sync-readiness.md) 엔티티 공통 필드와 동기화 대비 규칙
- [ADR-0006](./decisions/ADR-0006-layer-boundary-allow-list.md) 레이어 경계 강제 구조(허용 목록 · 전수 분류 · 절대 경로 · 배럴)
- [ADR-0007](./decisions/ADR-0007-persistable-write-path-and-tombstone-reads.md) 쓰기 경로 브랜드와 툼스톤 조회 규칙
- [ADR-0010](./decisions/ADR-0010-vinext-build-and-cloudflare-workers.md) 빌드 스택 Vinext + 배포 Cloudflare Workers
