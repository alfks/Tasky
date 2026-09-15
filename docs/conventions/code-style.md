<!-- 읽기 조건: src/ 아래 코드를 새로 쓰거나 수정하기 직전. 리뷰어는 diff에서 위반이 의심되는 절만 찾아 읽는다. 문서/설정만 만질 때는 읽지 않는다. -->

# 코드 컨벤션 (TypeScript / React / Next.js)

ESLint·Prettier가 잡는 것은 여기 적지 않는다(도구가 강제). 여기 적힌 것은 **도구가 못 잡는 규칙**이다. 도구가 잡는 규칙은 "무엇이 잡히는가"만 한 줄로 링크한다.

## 1. 네이밍

| 대상                             | 규칙                                                                                     | 예                                    |
| -------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------- |
| 컴포넌트 파일/함수               | PascalCase                                                                               | `TodoItem.tsx`, `function TodoItem()` |
| 훅                               | `use` + PascalCase, 파일 camelCase                                                       | `useTodosByDate.ts`                   |
| 그 외 파일(유틸, 스토어, 도메인) | kebab-case                                                                               | `todo-store.ts`, `completion-rate.ts` |
| 타입/인터페이스                  | PascalCase, 접두사 `I` 금지                                                              | `Todo`, `TodoRepository`              |
| Props 타입                       | `<Component>Props`                                                                       | `TodoItemProps`                       |
| 상수                             | UPPER_SNAKE                                                                              | `MAX_TITLE_LENGTH`                    |
| 불리언                           | `is/has/can/should` 접두                                                                 | `isDone`, `hasCategory`               |
| 이벤트 핸들러                    | `handle<Event>` (내부), `on<Event>` (props)                                              | `handleToggle`, `onToggle`            |
| 디렉토리                         | kebab-case                                                                               | `date-strip/`                         |
| 테스트                           | 대상 파일명 + `.test.ts(x)` 동일 디렉토리                                                | `completion-rate.test.ts`             |
| 날짜 문자열                      | 항상 `YYYY-MM-DD` (`DateKey` 타입)                                                       | `'2026-09-15'`                        |
| ID                               | `string` (UUID v4, `src/lib/id.ts`의 `newId()`만 사용), 타입 별칭 `TodoId`, `CategoryId` | —                                     |

## 2. 파일/디렉토리 구조

```
src/features/<feature>/
  components/   <Feature>*.tsx        # 이 기능 전용 컴포넌트 (하위 폴더 자유 — 표기는 §7 표대로)
  hooks/        use*.ts               # store/repository를 연결하는 훅
  store/        <feature>-store.ts    # Zustand
  index.ts                             # 공개 API 배럴 — src/ 에서 유일하게 허용되는 index.ts 위치
src/domain/<entity>/
  <entity>.ts                          # 타입 + 생성 함수 (배럴 없음: '@/domain/todo/todo' 로 직접 import)
  <entity>.rules.ts                    # 순수 비즈니스 규칙 (validate, 계산)
  <entity>.test.ts
src/domain/meta.ts                     # Meta · Persistable · createMeta/touch/markDeleted (ADR-0005·0007)
src/domain/errors.ts
src/repositories/
  <entity>-repository.ts               # interface only
  memory/<entity>-memory-repository.ts # 테스트/스토리용
  container.ts                         # Repositories 타입 + getRepositories()/setRepositories() (index.ts 아님)
src/infra/indexeddb/
  db.ts                                # Dexie 스키마·버전 — 테스트 계층 밖에선 query.ts 만 import(린트)
  query.ts                             # liveAll/liveOne/put — 툼스톤 필터와 쓰기가 있는 유일한 곳
  <entity>-indexeddb-repository.ts     # query.ts 헬퍼만 사용
```

- `src/**` 의 모든 **코드** 파일은 위 레이어(`app components features domain repositories infra lib styles test`) 중 하나에 속한다. `src/` 직속 코드 파일은 `middleware.ts`·`instrumentation.ts` 만, `src/features/` 직속 파일 없음, `src/styles` 는 `.css` 만. 허용 확장자 `ts tsx css md`(`.js/.jsx` 금지). `.md` 는 레이어가 아니라 디렉토리 규칙 문서라서 어느 디렉토리에나 올 수 있지만 이름은 `AGENTS.md` 만 허용한다(`src/AGENTS.md` 포함 — 루트 헌법 §1-4 가 요구한다). 어긋나면 파일 자체가 린트 에러 또는 `check-arch.sh` 의 전수 분류 FAIL(ADR-0006).
- **배럴 정책**: `index.ts` 는 `src/features/<f>/index.ts` 에만(다른 위치의 `index.*` 는 에러). 명시 export 만, `export *` 금지(린트). feature 밖에서는 그 index 만 import 가능, feature 안에서는 자기 index import 금지(순환) — 둘 다 린트.
- 한 파일 하나의 주요 export(컴포넌트 1개). 작은 헬퍼 컴포넌트는 같은 파일 하단에 비공개로 둘 수 있음(총 200줄 이하).
- 파일 ≤ 300줄(ESLint `max-lines`), 컴포넌트 ≤ 200줄, 일반 함수 ≤ 50줄(컴포넌트 함수 제외, 리뷰 기준), 중첩 깊이 ≤ 3. 넘으면 하위 폴더로 분할(feature 안이면 index 에 재export 하지 않아도 된다 — 내부 파일은 `@/features/<f>/…` 로 직접 import).
- `src/app/`은 라우팅·레이아웃·메타데이터만. 페이지 컴포넌트는 `features`의 화면 컴포넌트를 렌더할 뿐 로직 없음.
- `__arch__/` 디렉토리는 `scripts/check-arch.sh`의 임시 픽스처 이름이다. 직접 만들지 않는다(.gitignore·lint ignore 대상).

## 3. 컴포넌트 작성 규칙

- 함수 선언식 + named export. `default export`는 Next.js가 요구하는 `app/` 파일에만.
- `'use client'`는 상태·이벤트·브라우저 API를 쓰는 **최하위 컴포넌트**에만. `app/layout.tsx`, `app/page.tsx`는 서버 컴포넌트 유지.
- Props는 구조분해로 받고 타입은 파일 상단 `type XProps = {…}`. `React.FC` 금지. children은 `React.ReactNode`.
- 조건부 렌더는 early return 또는 `&&`. 삼항 중첩 금지.
- 리스트 key는 엔티티 id. index key 금지.
- 컴포넌트 안에서 레포지토리/Dexie 직접 호출 금지 → 훅(`features/*/hooks`) 경유.
- 파생 값은 렌더 중 계산(`useMemo`는 프로파일링 근거 있을 때만). `useEffect`로 상태 동기화 금지.
- 스타일: 클래스 조합은 `cn()`(`src/lib/cn.ts`). 동적 색상(카테고리 색)만 `style={{ '--cat-color': color }}` CSS 변수로 전달.
- 텍스트는 한국어 UI 기본. 문자열은 컴포넌트에 직접 쓰되, 3곳 이상 반복되면 `features/<f>/messages.ts`로.

## 4. 상태 관리 규칙

- 라이브러리: **Zustand**. 스토어는 feature별 1개(`features/<f>/store/<f>-store.ts`). 전역 단일 스토어 금지.
- 스토어 구조: `{ state…, actions… }` 평면. 액션은 `async`로 레포지토리를 호출하고 성공 시 상태 갱신(낙관적 업데이트는 토글 등 즉시성 필요한 액션에만, 실패 시 롤백).
- 스토어는 `getRepositories()`로 레포지토리를 얻는다(`@/repositories/container`). 테스트는 `setRepositories(memory)`로 교체.
- 컴포넌트는 selector로 필요한 조각만 구독: `useTodoStore(s => s.todosByDate[dateKey])`.
- 도메인 계산(달성률 등)은 스토어가 아니라 `domain/*/rules.ts`의 순수 함수. 스토어는 호출만. 엔티티 변경은 도메인 함수(`toggleDone(todo, deps)` 등)가 돌려주는 `Persistable<T>` 를 `upsert` 할 뿐 — 스토어가 `Meta` 필드를 쓰면 린트 에러, 도메인 함수 없이 `upsert` 하면 컴파일 에러(§5).
- URL 상태(선택 날짜 등)는 `searchParams`가 아니라 스토어에 둔다(MVP는 단일 페이지). 변경 시 ADR.
- 서버 상태 라이브러리(TanStack Query 등) 도입 금지(ADR-0003). 동기화 도입 시 재검토.

## 5. 도메인 / 레포지토리 규칙 (ADR-0005 · ADR-0007 · ADR-0009)

- `src/domain/**`(테스트 파일 제외 — §7 의 테스트 계층 단서)는 외부 패키지를 하나도 import 하지 않고(린트 허용 목록 0개) 브라우저 전역·`Date`·`crypto`·`Math.random`도 참조하지 않는다(린트). 시간·ID는 `deps = { now: () => string, id: () => string }`로 주입(런타임 구현은 `lib/date.ts#nowIso`, `lib/id.ts#newId` — domain 에서 이 둘을 **직접 import 하는 것도 금지**). `meta.ts` 예외 블록은 `Meta` 필드 쓰기와 `Persistable` 생성만 풀고 결정성 규칙은 그대로 받는다(`check-arch.sh` 의 `meta-clock`/`meta-write` 픽스처가 고정).
- 엔티티는 `type` + 생성 함수 `createTodo(input, deps): Persistable<Todo>`. 클래스 금지. 모든 변경 함수는 `touch(next, deps.now())` 로 끝나고 `Persistable<T>` 를 반환한다. 삭제는 `markDeleted(e, deps.now())`.
- **쓰기 경로 타입**: `Persistable<T>` 를 만드는 함수는 `src/domain/meta.ts` 의 `createMeta`·`touch`·`markDeleted`·`adopt` **넷**뿐이다(`adopt` 는 백업 가져오기 전용이고 호출처는 `src/domain/backup/**` 하나 — ADR-0009 결정 3). 레포지토리 `upsert` 는 이 타입만 받고 조회는 브랜드 없는 `T` 를 돌려주므로, 읽은 값을 그대로/스프레드해서 저장하면 컴파일 에러. `meta.ts`·테스트 계층(`src/test/**`, `*.test.*`) 밖에서의 `as Persistable` 캐스팅과 `rev/updatedAt/createdAt/deletedAt` 쓰기는 린트 에러(읽기는 허용).
- **엔티티 레포지토리**(`Todo`·`Category`·`Settings`·`FocusSession`)의 인터페이스: `Promise` 반환, 도메인 타입만(Dexie 타입 금지). 쓰기는 `upsert(entity: Persistable<T>)` **하나뿐**이고 `remove`·`delete`·`softDelete`·`restore`·`bulkUpsert`·`replaceAll` 은 없다 — 삭제는 `upsert(markDeleted(e, now))`. 조회는 툼스톤을 반환하지 않는다(`getById` → `undefined`, `list*`/`get`/`search` 는 제외, `includeDeleted` 옵션 없음). **레포지토리는 시각도 `rev` 도 만들지 않는다** — `at: string` 인자를 받는 메서드를 두면 그 자체가 위반이다(TECH_PLAN §6 규칙 2). 확정 시그니처는 TECH_PLAN §6 이 단일 소스다.
- **데이터셋 단위 계약은 별개다**(ADR-0009): `DatasetRepository` 의 `readAll()`(툼스톤 **포함** 전량 — 툼스톤을 읽는 유일한 경로) · `write(writes)`(값 목록의 교차 테이블 단일 트랜잭션, 중간 실패 시 변화 0) · `restore(snapshot)`(백업 가져오기 전용 물리 교체). 위 "엔티티 레포지토리" 규칙의 적용 범위 밖이지만 `restore` 도 `PersistableSnapshot` 만 받아 브랜드 예외는 0 이다. 값 타입(`DatasetWrite`·`DatasetSnapshot`·`PersistableSnapshot`)의 단일 소스는 **`src/domain/dataset.ts`** 다 — `planCategoryRemoval` 이 그 타입을 반환하는데 도메인은 repositories 를 import 할 수 없기 때문이며, `src/repositories/dataset-repository.ts` 는 인터페이스만 두고 그 타입을 import 한다. 콜백을 받는 일반 `transaction(fn)` API 는 두지 않는다.
- 소프트 삭제 필터의 위치는 하나: IndexedDB 는 `infra/indexeddb/query.ts` 의 `liveAll/liveOne/liveBy/liveBetween/liveOrderBy/put`(테스트 계층 밖에서 `db.ts` 를 import 할 수 있는 유일한 파일 — 린트), memory 는 `repositories/memory/live.ts` 의 **같은 이름** 헬퍼다. 레포지토리 구현은 이 헬퍼만 쓴다. 툼스톤을 포함해 읽는 통로(`allRows`·`replaceRows`)는 `DatasetRepository` 구현 전용이며 엔티티 레포지토리 구현은 부르지 않는다.
- **계약 테스트**: 스위트는 `src/repositories/*-repository.contract.ts` 에 `run<X>Contract(target: ContractTarget)` 형태로 두고(테스트 파일이 아니라 vitest 전역을 쓴다), 구현마다 `*.contract.test.ts` 가 자기 대상으로 한 번씩 부른다(memory: `src/repositories/memory.contract.test.ts`). 스위트를 테스트 파일로 두지 않는 이유는 다른 구현이 import 할 때 memory 실행분이 딸려오지 않게 하기 위해서다. 그 대가로 스위트는 `src/test/fixtures` 를 쓸 수 없어(레이어 허용 목록) `src/repositories/contract.ts` 의 팩토리를 쓴다. 필수 케이스는 ADR-0007 규칙 3 의 (a)~(e)이며 `READS` 는 배열이 아니라 `satisfies Record<ReadName, ReadCall>` 매핑 타입이다.
- 마이그레이션은 `infra/indexeddb/db.ts`의 Dexie `version(n)`으로만. 스키마 변경 = ADR + 마이그레이션 테스트.

## 6. CSS 전략

- Tailwind CSS v4 유틸리티 우선. 전역 CSS는 `src/styles/globals.css`(리셋·폰트), 토큰은 `src/styles/tokens.css`의 CSS 변수(`--color-bg`, `--color-accent`, `--radius-md`, `--space-*`).
- 테마는 `<html data-theme="light|dark">` + 강조색 `--color-accent`. 컴포넌트는 토큰만 참조(`bg-[var(--color-bg)]` 또는 `@theme`로 등록한 `bg-bg`). 하드코딩 색상(`#fff`, `bg-white`) 금지 — 예외: 카테고리 사용자 지정 색.
- 애니메이션은 `prefers-reduced-motion` 존중(`motion-safe:` 접두).
- z-index는 토큰(`--z-modal` 등)만. 임의 숫자 금지.
- 반응형은 데스크탑 우선이되 최소 폭 1024px에서 깨지지 않게. 모바일 최적화는 범위 밖(단, 레이아웃이 터지지 않을 것).

## 7. import 경로 · 순서 · disable 정책

**경로 규칙 — 표 하나로 판단한다.** `src/` 안의 import 는 **항상 `@/…` 절대 경로**이고 상대 경로(`./`, `../`)는 전부 린트 에러다. 레이어 경계는 `import/no-restricted-paths`(**해석된 실제 경로**)와 같은 허용 목록에서 만든 문자열 패턴(그 규칙이 보지 못하는 `typeof import()`·모킹용)이 함께 검사하므로 표기·구문과 무관하게 판정이 같다(ADR-0006 결정 10·11). 아래 표는 가능한 출발·대상 조합 전부이며, 각 조합의 합법 표기는 정확히 하나다(빈칸 없음). 단, 파일 단위 예외(`domain` → `@/lib/date`·`@/lib/id`, `layout.tsx` 밖의 `@/app/providers`, `query.ts` 밖의 `@/infra/indexeddb/db`)는 표기가 아니라 import 자체가 금지다 — 단일 소스는 ARCHITECTURE.md §1. **표기는 정규형 하나로 강제된다**(`no-restricted-imports` 의 CANONICAL 패턴): 확장자(`.ts`·`.tsx`·`.js`…), `/index`, `./`·`../` 세그먼트, 중복·후행 슬래시, 백슬래시·`%` 인코딩·공백·비ASCII 는 전부 에러다. 같은 파일을 다른 문자열로 가리켜 문자열 기반 규칙(조립 지점·`lib/date`·`db.ts`·자기 배럴·패키지 목록)을 우회하는 길을 막는 전제다.

| #   | 출발 파일                                    | 대상                                                    | 합법 표기(유일)                                                | 예                                                                               |
| --- | -------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | 아무 곳                                      | 같은 디렉토리의 파일                                    | `@/<layer>/<경로>`                                             | `domain/todo/todo.rules.ts` → `'@/domain/todo/todo'`                             |
| 2   | 아무 곳                                      | 같은 레이어·같은 feature 의 형제 디렉토리               | `@/<layer>/<경로>`                                             | `features/todo/components/TodoItem.tsx` → `'@/features/todo/store/todo-store'`   |
| 3   | 아무 곳                                      | 같은 feature 안 2단계·3단계 중첩(상위/하위 어느 쪽이든) | `@/<layer>/<경로>`                                             | `features/todo/components/item/Row.tsx` → `'@/features/todo/store/todo-store'`   |
| 4   | feature 안                                   | 자기 feature 의 `index.ts`                              | **금지**(순환) — 내부 파일을 직접(#1~3)                        | —                                                                                |
| 5   | feature · app                                | 다른 feature                                            | `@/features/<name>` (index.ts 만; 내부 경로는 에러)            | `'@/features/category'`                                                          |
| 6   | 아무 곳                                      | 다른 레이어의 파일(허용 목록 안일 때)                   | `@/<layer>/<경로>` (배럴 없음, 파일까지)                       | `'@/domain/todo/todo'`, `'@/components/ui/Button'`, `'@/repositories/container'` |
| 7   | 아무 곳                                      | 허용 목록 밖 레이어                                     | **금지** — 코드를 옮기거나 ADR (ARCHITECTURE.md §1)            | `features` → `@/infra/…`                                                         |
| 8   | `app`, `features`                            | CSS                                                     | `@/styles/<file>.css` (side-effect import)                     | `import '@/styles/globals.css'`                                                  |
| 9   | 아무 곳                                      | 외부 패키지                                             | 패키지명 (레이어별 허용/금지는 ARCHITECTURE.md §1)             | `import Dexie from 'dexie'` (infra 만)                                           |
| 10  | 비테스트 파일                                | `*.test.*`, `src/test/**`                               | **금지**                                                       | —                                                                                |
| 11  | `*.test.*`, `src/test/**`                    | 무엇이든                                                | `@/<layer>/<경로>` (경계 제한 없음, 상대 경로는 여기서도 금지) | `'@/infra/indexeddb/todo-indexeddb-repository'`                                  |
| 12  | `src/middleware.ts`·`src/instrumentation.ts` | `lib` 만                                                | `@/lib/<경로>`                                                 | `'@/lib/date'`                                                                   |

- **테스트 계층 단서**: 이 문서에서 "린트가 막는다" 는 서술은 전부 **비테스트 파일 기준**이다. 테스트 계층(`src/test/**`, `*.test.*`)은 레이어 경계·브라우저 전역·패키지 허용 목록·`Meta` 쓰기·`as Persistable` 이 면제되고, 표기 규칙(상대 경로 금지 + 정규형)과 공통 문법 규칙(`export *`·`require` 계열·리터럴 아닌 `import()` 금지)은 그대로 받는다(§11, 실측).
- `@/` import는 반드시 해석되어야 한다(`import/no-unresolved`, `caseSensitive`) — 별칭이 깨지면 경계 검사가 조용히 무력화되므로 카나리로 둔다. 대소문자만 다른 표기(`@/app/Providers`)도 여기서 걸린다.
- `export *` 와 `require` 계열(`require()`·`require.resolve()`·`createRequire()`·`import.meta.resolve`·`import x = require()`)은 `src/` 전체에서 금지(린트) — 경로 판정을 받을 수 없는 구문이다. 동적 `import()` 는 **인자가 문자열 리터럴일 때만** 경계 판정을 받으므로, 리터럴이 아닌 인자(변수·템플릿 리터럴)는 그 자체가 린트 에러다. 삼중슬래시 지시자(`/// <reference path|types|lib>`)도 금지(`@typescript-eslint/triple-slash-reference` 의 세 옵션을 전부 `never` 로 고정 + `scripts/check-arch.sh` 의 grep — `=` 양옆 공백 변형 포함).
- 동적 `import()`·`typeof import()`(및 `import('…').Q`)·`vi.mock('…')`/`jest.mock('…')`·`new URL('@/…', import.meta.url)` 의 경로 인자도 위의 문자열 규칙과 **레이어 허용 목록을 똑같이 받는다**(모킹과 `new URL` 은 결정 10 이 열거한 **정적 표기 그대로**일 때 — 모킹을 계산 속성(`vi` + 대괄호 접근)으로 부르거나 `new URL` 의 2번째 인자를 변수로 두면 거울이 보지 않는다. 둘 다 Vitest 의 hoisting·번들러가 정적 표기만 처리하므로 실효 간선이 아니다): `no-restricted-imports` 와 `import/no-restricted-paths` 는 이 구문들을 보지 않으므로 `eslint.config.mjs` 가 같은 패턴을 셀렉터로 복제하고(거울), 복제 누락은 설정 로드 시점에 throw 한다(ADR-0006 결정 9~11). 모듈 경로를 쓰는 구문이 각각 어느 규칙을 받는지는 결정 10 의 전수 목록이 단일 소스다. `typeof import()` 는 이와 별개로 `@typescript-eslint/consistent-type-imports` 가 표기 자체를 막는다(`import type * as X` 를 쓴다) — 그 규칙을 사유와 함께 disable 해도 위 경계 판정은 그대로 남는다.
- `@/app/providers`(조립 지점)를 import 할 수 있는 파일은 `src/app/layout.tsx` 하나이며(결정 10 의 구문 전수에 대해 실측), `providers.tsx` 는 재export(`export … from`)를 할 수 없다 — 조립 지점을 경유지로 쓰지 못하게 한다(ADR-0006 규칙 6, 한계는 ARCHITECTURE.md §1).

**순서** (`import/order`가 정렬, 여기선 그룹 정의)

1. `react`, `next/*` · 2. 외부 패키지 · 3. `@/domain/*` · 4. `@/repositories/*`, `@/infra/*` · 5. `@/features/*` · 6. `@/components/*` · 7. `@/lib/*`, `@/styles/*` · 8. `import type`은 각 그룹 마지막.

**`eslint-disable` 정책** (강제: `scripts/check-arch.sh` 의 2차 패스, 규칙 목록의 단일 소스는 `scripts/arch-layers.mjs` 의 `ARCH_RULES` — ADR-0008)

- 아키텍처 규칙(`import/no-restricted-paths`, `no-restricted-imports`, `no-restricted-globals`, `no-restricted-syntax`, `import/no-cycle`, `import/no-unresolved`, `import/no-default-export`, `@typescript-eslint/no-explicit-any`, `@typescript-eslint/triple-slash-reference`)은 **어떤 문법으로도 끌 수 없다**. `check-arch.sh` 가 `eslint --no-inline-config -c eslint.arch.config.mjs src` 를 한 번 더 돌리는데, 그 모드에서 ESLint 는 파일 안의 모든 인라인 지시자(`eslint-disable` 계열·`/* eslint … */`·`/* eslint-env */`·`/* global */`)를 무시한다 — 빈 규칙 목록(`/* eslint-disable , -- 사유 */`)·NBSP 구분자·BOM 같은 변형도 소용없다(실측). 경계가 불편하면 코드를 옮기거나 ADR로 경계를 바꾼다.
- 그 외(스타일) 규칙은 `// eslint-disable-next-line <rule> -- <사유>` 로 끌 수 있고 **사유를 적는다**(리뷰 항목). 2차 패스는 그 규칙들을 아예 보지 않으므로 정당한 disable 이 막히지 않는다. 미사용 지시자는 1차 패스의 `reportUnusedDisableDirectives` 가 에러로 잡는다.
- 경계 규칙이 실제로 위반을 잡는지(그리고 허용할 것을 허용하는지), 2차 패스가 살아 있는지는 `scripts/check-arch.sh`가 픽스처로 확인한다. 경계를 바꾸면 그 케이스도 같은 PR에서 바꾼다.

## 8. 주석 정책

- "무엇"이 아니라 **"왜"**. 코드로 설명 가능한 주석 금지.
- 공개 도메인 함수·레포지토리 인터페이스 메서드는 한 줄 JSDoc(한국어) 필수. 컴포넌트는 props 타입에 필드별 주석(비자명할 때만).
- `TODO`는 `// TODO(T-<n>): 내용` 형식만. 티켓 없는 TODO 금지. `FIXME`, `HACK` 금지(티켓 만들 것).
- 주석에 레퍼런스 앱 제품명 금지. "레퍼런스 앱 동작 참고" 정도만.
- 주석·문자열에 AI 언급("Claude가 생성" 등) 금지.

## 9. 에러 처리

- 도메인 검증 실패는 `DomainError`(`src/domain/errors.ts`, `code` 필드) throw. 레포지토리 실패는 `RepositoryError`로 감싸서 throw(원인 `cause` 보존).
- 스토어 액션은 try/catch로 받아 `error: string | null` 상태에 사용자 문구를 넣는다. `console.error`는 개발 모드에서만(`if (process.env.NODE_ENV !== 'production')`).
- 에러를 삼키지 않는다(빈 catch 금지). 복구 불가 시 `app/error.tsx` 바운더리로 전파.
- 사용자 문구는 한국어, 원인이 아닌 **다음 행동**을 안내("다시 시도해 주세요").
- `any` 금지, `as` 캐스팅은 경계(IndexedDB 역직렬화, `query.ts`)에서만 + 주석. `as Persistable` 은 `domain/meta.ts` 와 테스트 계층(`src/test/**`, `*.test.*`) 밖에서 금지(린트 — 실측으로 확인한 범위다). 역직렬화 결과는 검증 후 도메인 함수로 되돌린다 — `JSON.parse` 결과를 바로 `upsert` 하지 않는다(타입도 린트도 못 잡는 경로).

## 10. 접근성 최소 기준

- 인터랙션은 `button`, `a`, `input`, `select` 등 시맨틱 요소. `div/span onClick` 금지.
- 아이콘 전용 버튼은 `aria-label` 필수. 장식 이미지는 `alt=""`.
- 투두 체크는 실제 `input[type=checkbox]`(시각적으로 숨김 가능) 또는 `role="checkbox" aria-checked`.
- 포커스 링 제거 금지(`focus-visible` 스타일 토큰 사용). Tab 순서가 시각 순서와 일치.
- 색 대비 텍스트 4.5:1 이상. 카테고리 색은 배경으로만 쓰고 정보 전달은 텍스트/아이콘 병행.
- 모달·팝오버는 Esc 닫기 + 포커스 트랩 + 닫힌 뒤 원래 위치로 포커스 복귀.
- 날짜 스트립은 좌우 화살표 키로 이동 가능(`role="tablist"` 또는 라디오 그룹 패턴).

## 11. 테스트 규칙

- 러너: Vitest(jsdom). 컴포넌트: Testing Library(`getByRole` 우선). IndexedDB: `fake-indexeddb/auto`.
- **필수**: `domain/**` 모든 export 함수, `repositories/**` 모든 메서드(memory + indexeddb 구현 둘 다 같은 계약 테스트 공유 `*.contract.test.ts`).
- **계약 테스트 필수 케이스**(ADR-0007 규칙 3): (a) `Meta` 저장 전후 동일 (b) `upsert(touch(e))` 후 `getById(id)?.rev === e.rev + 1` (c) `upsert(markDeleted(e))` 후 `READS` 의 모든 조회 메서드가 그 id 를 반환하지 않음 (d) `// @ts-expect-error` 로 `upsert(plain)` 컴파일 실패 고정 (e) `READS` 전수 대조 — `type ReadName = Exclude<keyof TodoRepository, 'upsert'>` + `const READS = { getById: (r, id) => r.getById(id), … } satisfies Record<ReadName, ReadCall>`. 조회 메서드를 빼면 `TS1360`(빠진 이름을 지목), 쓰기 메서드를 넣으면 `TS2353` 이다(tsc 5.9 실측). **`satisfies readonly (keyof T)[]` 같은 배열 형태는 전수성을 검사하지 않으므로 쓰지 않는다.** (c) 는 `Object.entries(READS)` 를 순회해 이 맵을 실제로 호출한다.
- **권장**: feature 컴포넌트당 핵심 행동 1~3개(체크 토글, 추가, 삭제). 스냅샷 테스트 금지.
- 테스트명은 한국어 문장: `it('완료된 투두 비율을 0~1로 반환한다')`.
- 테스트 데이터는 `src/test/fixtures/*.ts` 팩토리(`makeTodo(overrides)`). 매직 날짜 금지 — 팩토리 기본값 사용. 픽스처는 `Meta` 리터럴을 써도 된다(테스트 파일 예외).
- 테스트 파일(`*.test.*`)과 `src/test/**`는 레이어 경계 린트에서 제외된다(계약 테스트가 `infra` 구현을 직접 돌린다). 반대로 비테스트 파일은 테스트 파일과 `src/test`를 import할 수 없다(§7 표 #10).
- `pnpm test`는 3초 이내 유지. 느린 테스트는 `*.slow.test.ts`로 분리(CI만).
- E2E(Playwright)는 스모크 1개(앱 로드 → 투두 추가 → 체크)부터. `tests/e2e/`.

## 12. 금지 목록 (요약)

`any` · `React.FC` · index key · `div onClick` · 하드코딩 색상 · `export *` · `require` 계열(`require()`·`createRequire()`·`import x = require()`·`import.meta.resolve`) · 삼중슬래시 지시자 · 상대 경로 import · `features/*` 밖의 `index.ts` · `.js/.jsx` · 빈 catch · 티켓 없는 TODO · 컴포넌트 내 Dexie · `domain`의 외부 패키지 import · `domain`의 `Date`/`crypto` 직접 호출 · `touch()` 없는 엔티티 저장(컴파일 에러) · `meta.ts` 밖 `Meta` 필드 쓰기 · 테스트 계층 밖 `as Persistable` · 비정규형 import 표기(확장자·`/index`·`./`) · 레포지토리 `remove` · 리터럴 아닌 동적 `import()` · `layout.tsx` 밖에서 `@/app/providers` import · `providers.tsx` 의 재export · 아키텍처 규칙 `eslint-disable`(2차 패스가 무시하므로 효과 자체가 없다) · 사유 없는 스타일 규칙 `eslint-disable`(리뷰 항목) · `useEffect` 상태 동기화 · 스냅샷 테스트 · 300줄 초과 파일 · 레퍼런스 앱 제품명
