<!-- 읽기 조건: src/ 스캐폴딩 티켓(chore/scaffold-nextjs)을 수행할 때만 읽는다. -->

# src/** AGENTS.md 초안 모음

#### 3.12-h `src/**` AGENTS.md 초안 (스캐폴딩 티켓에서 디렉토리 생성과 동시에 작성)

아래 초안은 스캐폴딩 티켓의 `owns:`에 포함시켜 함께 생성한다. 각 60줄 이하.

##### 파일: `/home/user/Tasky/src/AGENTS.md`
````markdown
<!-- 읽기 조건: src/ 바로 아래에 새 최상위 디렉토리를 만들 때만. 기존 디렉토리 작업은 그 디렉토리 AGENTS.md로 바로 간다. -->

# src/ — AGENTS

## 목적
앱 소스 루트. 레이어 = 디렉토리: `app`(UI 셸) `components`(공용 UI) `features`(기능+상태) `domain`(규칙) `repositories`(계약) `infra`(구현) `lib`(유틸) `styles`(토큰) `test`(테스트 지원).

## 규칙
1. 새 최상위 디렉토리는 ADR 필수. 위 9개 외에는 만들지 않는다.
2. 의존 방향은 `docs/ARCHITECTURE.md` §1 표. ESLint가 강제하며, 우회(`eslint-disable`)는 리뷰 Blocker.
3. 경로 별칭 `@/` 만 사용.
4. 각 하위 디렉토리 `AGENTS.md`는 자족적이다(이 파일을 다시 읽게 하지 않는다).

## 검증
```bash
pnpm lint && pnpm typecheck
```
````

##### 파일: `/home/user/Tasky/src/app/AGENTS.md`
````markdown
<!-- 읽기 조건: 라우트·레이아웃·메타데이터·providers·PWA manifest를 수정할 때. -->

# src/app/ — AGENTS

## 목적
Next.js App Router 셸. 라우팅, 루트 레이아웃, 메타데이터/manifest, 레포지토리 조립(`providers.tsx`)만.

## 여기 있는 것 / 없는 것
- 있음: `layout.tsx`(서버, 폰트·테마 속성), `page.tsx`(서버, `<HomeScreen/>` 렌더만), `providers.tsx`(client, `setRepositories`), `manifest.ts`, `error.tsx`, `globals import`
- 없음: 비즈니스 로직, 상태, 컴포넌트 구현(→ `features`)

## 규칙
1. `page.tsx`는 10줄 이내: feature 화면 컴포넌트 1개 렌더.
2. `'use client'`는 `providers.tsx`, `error.tsx`에만.
3. `infra`를 import하는 유일한 곳은 `providers.tsx`(조립 지점). 다른 파일에서 import 시 Blocker.
4. 라우트 추가는 스펙 + 오케스트레이터 승인(MVP는 `/` 단일 페이지).
5. 서비스워커 설정(`@serwist/next`)은 `next.config.ts`에, 여기서는 `manifest.ts`만.

## 의존 방향
- 가능: `@/features/*`(index만), `@/components`, `@/styles`, `@/infra`(providers.tsx만)
- 금지: `@/domain` 직접, `@/repositories` 직접(providers 제외)

## 검증
```bash
pnpm build 2>&1 | tail -5
```
````

##### 파일: `/home/user/Tasky/src/components/AGENTS.md`
````markdown
<!-- 읽기 조건: 두 기능 이상에서 쓰는 UI 프리미티브를 추가·수정할 때. -->

# src/components/ — AGENTS

## 목적
무상태·도메인 무관 UI 프리미티브(`ui/`): `Button`, `Checkbox`, `IconButton`, `Popover`, `Dialog`, `ColorSwatch`, `ProgressRing` 등.

## 규칙
1. props로만 동작. 스토어·레포지토리·도메인 타입 import 금지(도메인을 모르는 컴포넌트).
2. 색·간격은 토큰(`src/styles/tokens.css`)만. 카테고리 색은 `--cat-color` CSS 변수를 props로 받아 적용.
3. 접근성 기본 내장: 포커스 링, `aria-*`, 키보드. 프리미티브가 접근성을 책임지면 feature는 신경 덜 쓴다.
4. 파일 1개 = 컴포넌트 1개 + 테스트 1개(`Button.test.tsx`, 행동 1~2개).
5. 세 번째 사용처가 생길 때 여기로 승격. 그 전엔 feature 안에 둔다.

## 의존 방향
- 가능: `@/lib`, `@/styles`
- 금지: `@/features`, `@/domain`, `@/repositories`, `@/infra`

## 검증
```bash
pnpm test -- src/components --reporter=dot 2>&1 | tail -20
```
````

##### 파일: `/home/user/Tasky/src/features/AGENTS.md`
````markdown
<!-- 읽기 조건: features/<f>/ 아래 컴포넌트·훅·스토어를 작성·수정할 때. feature별 하위 AGENTS.md는 없다 — 이 파일이 전부 다룬다. -->

# src/features/ — AGENTS

## 목적
기능 슬라이스. 각 feature = `components/` + `hooks/` + `store/` + `index.ts`. MVP: `todo`, `category`, `date-strip`, `stats`, `theme`. 화면 조립은 `todo/components/HomeScreen.tsx`.

## 규칙
1. 외부에서는 `@/features/<f>`(index.ts)만 import. 다른 feature 내부 경로 import 금지.
2. 스토어는 feature당 1개, Zustand, `getRepositories()` 경유. 컴포넌트에서 레포지토리 직접 호출 금지.
3. 도메인 계산은 `@/domain` 순수 함수를 호출만(스토어/컴포넌트에 계산 로직 금지).
4. 컴포넌트 ≤ 200줄, 스토어 ≤ 300줄. 넘으면 분할.
5. 낙관적 갱신은 `toggleDone` 등 즉시성 액션에만, 실패 시 롤백 + `error` 상태.
6. 텍스트는 한국어. 3곳 이상 반복 시 `messages.ts`.
7. feature 간 통신은 스토어 구독(`useTodoStore`)으로. 이벤트 버스 금지.

## 의존 방향
- 가능: `@/domain`, `@/repositories`(인터페이스·`getRepositories`), `@/components`, `@/lib`, `@/styles`
- 금지: `@/infra`, `@/app`

## 검증
```bash
pnpm test -- src/features/<f> --reporter=dot 2>&1 | tail -20 && pnpm lint
```

## 자주 하는 실수
- `useEffect`로 스토어 ↔ 로컬 state 동기화 → selector로 직접 구독.
- 스토어 전체 구독(`useTodoStore()`) → 리렌더 폭증, selector 사용.
````

##### 파일: `/home/user/Tasky/src/domain/AGENTS.md`
````markdown
<!-- 읽기 조건: 엔티티 타입·검증·계산 규칙을 추가·수정할 때. -->

# src/domain/ — AGENTS

## 목적
프레임워크 의존 0의 비즈니스 규칙. `todo/`, `category/`, `date/`, `theme/`, `errors.ts`.

## 규칙
1. import 금지: `react`, `next`, `dexie`, `zustand`, `window`, `document`, `@/features`, `@/repositories`, `@/infra`. ESLint가 막는다.
2. 엔티티는 `type` + `create<Entity>(input, deps)`; `deps = { now: () => string, id: () => string }` 주입(테스트 결정성).
3. 모든 export 함수에 단위 테스트(같은 디렉토리 `*.test.ts`). 커버리지 100% 목표.
4. 불변: 입력을 변경하지 않고 새 객체 반환.
5. 검증 실패는 `DomainError(code, message)` throw. 코드는 `errors.ts`의 union.
6. 공통 필드 `id, createdAt, updatedAt, deletedAt?` 유지(동기화 대비). 삭제는 `deletedAt` 설정.
7. 날짜는 `DateKey`('YYYY-MM-DD') 문자열. `Date` 객체는 `lib/date.ts`에서만 변환.

## 검증
```bash
pnpm test -- src/domain --coverage --reporter=dot 2>&1 | tail -20
```
````

##### 파일: `/home/user/Tasky/src/repositories/AGENTS.md`
````markdown
<!-- 읽기 조건: 저장소 인터페이스를 추가·변경하거나, memory 구현·컨테이너를 수정할 때. -->

# src/repositories/ — AGENTS

## 목적
저장소 **계약**(인터페이스)과 테스트용 memory 구현, 런타임 주입 컨테이너(`index.ts`: `getRepositories() / setRepositories()`).

## 규칙
1. 인터페이스 메서드는 `Promise` 반환, 도메인 타입만 사용. Dexie·IndexedDB 타입 노출 금지.
2. 시그니처 변경 = ADR + memory·indexeddb 구현 동시 수정 + 계약 테스트(`*.contract.test.ts`) 갱신. 한 PR.
3. 계약 테스트는 구현 팩토리를 인자로 받아 memory/indexeddb 둘 다 실행한다.
4. 목록 조회는 `deletedAt`이 없는 것만 반환(`includeDeleted` 옵션으로 확장 가능).
5. 컨테이너 기본값 없음: `getRepositories()`는 미설정 시 throw(조립 누락을 조기 발견).

## 의존 방향
- 가능: `@/domain`
- 금지: `@/infra`, `@/features`, `react`, `dexie`

## 검증
```bash
pnpm test -- src/repositories --reporter=dot 2>&1 | tail -20
```
````

##### 파일: `/home/user/Tasky/src/infra/AGENTS.md`
````markdown
<!-- 읽기 조건: IndexedDB 스키마·마이그레이션·레포지토리 구현을 수정할 때. -->

# src/infra/ — AGENTS

## 목적
저장소 인터페이스의 실제 구현. `indexeddb/`(Dexie) 현재, `sync/` Phase 2.

## 규칙
1. 스키마는 `indexeddb/db.ts` 한 곳. 변경은 `version(n+1).stores({...}).upgrade(...)` 추가로만(기존 버전 수정 금지) + ADR + 마이그레이션 테스트(fake-indexeddb로 n → n+1).
2. DB 이름 `tasky`. 테이블: `todos`, `categories`, `settings`.
3. 각 구현은 계약 테스트를 통과해야 한다(`repositories/*.contract.test.ts` 재사용).
4. 역직렬화 경계에서만 `as` 허용 + 주석. 스키마 불일치 시 `RepositoryError`.
5. `infra`를 import하는 곳은 `src/app/providers.tsx`, `src/test/setup.ts`뿐. 그 외 발견 시 Blocker.
6. 트랜잭션은 다중 테이블 쓰기에만 명시적으로.

## 의존 방향
- 가능: `@/domain`, `@/repositories`(인터페이스만), `dexie`
- 금지: `@/features`, `@/components`, `@/app`, `react`

## 검증
```bash
pnpm test -- src/infra --reporter=dot 2>&1 | tail -20
```
````

##### 파일: `/home/user/Tasky/src/lib/AGENTS.md`
````markdown
<!-- 읽기 조건: 유틸을 추가하기 전(중복 확인), 기존 유틸을 수정할 때. -->

# src/lib/ — AGENTS

## 목적
프레임워크·도메인 무관 순수 유틸. `cn.ts`(clsx+tailwind-merge), `date.ts`(DateKey ↔ Date, 주 계산), `id.ts`(nanoid 래퍼).

## 규칙
1. 추가 전 `Grep`으로 중복 확인. 함수 1개당 테스트 1개.
2. 도메인 타입 import 금지(도메인이 lib를 쓰지, 반대는 안 됨). `DateKey`만 예외적으로 `date.ts`가 정의하고 domain이 재export.
3. 외부 패키지 래핑은 여기서만(교체 지점).
4. 파일 ≤ 150줄.

## 검증
```bash
pnpm test -- src/lib --reporter=dot 2>&1 | tail -20
```
````

##### 파일: `/home/user/Tasky/src/styles/AGENTS.md`
````markdown
<!-- 읽기 조건: 색·간격·라운드·z-index 토큰이나 테마를 변경할 때. -->

# src/styles/ — AGENTS

## 목적
디자인 토큰(`tokens.css`)과 전역 스타일(`globals.css`). 감성 앱의 "룩"은 여기서 결정된다.

## 규칙
1. 토큰 이름: `--color-{bg|surface|text|muted|accent|border}`, `--space-{1..8}`, `--radius-{sm|md|lg|full}`, `--z-{base|popover|modal|toast}`, `--shadow-{sm|md}`.
2. 테마: `:root[data-theme="light"]`, `:root[data-theme="dark"]` 에서 같은 토큰 재정의. 강조색은 `--color-accent`(사용자 선택, 스토어가 inline style로 주입).
3. Tailwind v4 `@theme`에 토큰을 등록해 `bg-bg`, `text-muted` 등 유틸로 사용. 컴포넌트에서 hex 금지.
4. 폰트는 `layout.tsx`의 `next/font`로 로드, 여기서는 `--font-sans` 변수만 참조.
5. 토큰 추가/변경은 스크린샷(라이트/다크) 첨부.

## 검증
```bash
pnpm build 2>&1 | tail -5
```
````

##### 파일: `/home/user/Tasky/src/test/AGENTS.md`
````markdown
<!-- 읽기 조건: 테스트를 작성할 때 픽스처·셋업을 확인하려고. -->

# src/test/ — AGENTS

## 목적
Vitest 셋업(`setup.ts`: jsdom, `fake-indexeddb/auto`, `setRepositories(memory)`)과 픽스처 팩토리(`fixtures/todo.ts` 등 `makeTodo(overrides)`).

## 규칙
1. 픽스처는 팩토리 함수만(정적 JSON 금지). 기본값은 결정적(고정 날짜 `2026-01-15`, 고정 id 접두).
2. 시간·ID는 `deps` 주입으로 고정. `vi.useFakeTimers()`는 애니메이션 테스트에만.
3. 각 테스트는 독립: `beforeEach`에서 memory 레포지토리 초기화.
4. 스냅샷 금지. `getByRole` 우선.

## 검증
```bash
pnpm test --reporter=dot 2>&1 | tail -20
```
````

##### 파일: `/home/user/Tasky/tests/AGENTS.md` (Playwright 도입 티켓에서 생성)
````markdown
<!-- 읽기 조건: E2E 테스트를 작성·수정할 때. -->

# tests/ — AGENTS

## 목적
Playwright E2E(`tests/e2e/`). 스모크 1개(앱 로드 → 카테고리 추가 → 투두 추가 → 체크 → 달성률 갱신)부터.

## 규칙
1. 셀렉터는 `getByRole`/`getByLabel`. `data-testid`는 최후 수단.
2. 각 테스트는 새 브라우저 컨텍스트(IndexedDB 격리).
3. CI에서는 chromium만. 로컬은 `pnpm test:e2e --headed`.
4. 실패 시 트레이스 첨부(`--trace on-first-retry`).

## 검증
```bash
pnpm test:e2e 2>&1 | tail -20
```
````

