<!-- 읽기 조건: src/ 스캐폴딩 티켓(chore/scaffold-nextjs)을 수행할 때만 읽는다. -->

# src/** AGENTS.md 초안 모음

#### 3.12-h `src/**` AGENTS.md 초안 (스캐폴딩 티켓에서 디렉토리 생성과 동시에 작성)

아래 초안은 스캐폴딩 티켓의 `owns:`에 포함시켜 함께 생성한다. 각 60줄 이하. **전역 규칙은 여기 다시 쓰지 않는다** — 의존 방향은 `docs/ARCHITECTURE.md` §1, 코드·import·테스트 규칙은 `docs/conventions/code-style.md`(위반은 `pnpm lint`·`pnpm typecheck`가 잡는다). 각 초안의 "## 규칙"에는 **그 디렉토리에만 해당하는 것**만 적고 마지막 항목으로 출처를 링크한다. 이 파일은 11개 `AGENTS.md`로 복사되므로 여기 적힌 문장은 사본 11벌이 된다.

##### 파일: `/home/user/Tasky/src/AGENTS.md`
````markdown
<!-- 읽기 조건: src/ 바로 아래에 새 최상위 디렉토리를 만들 때만. 기존 디렉토리 작업은 그 디렉토리 AGENTS.md로 바로 간다. -->

# src/ — AGENTS

## 목적
앱 소스 루트. 레이어 = 디렉토리: `app`(UI 셸) `components`(공용 UI) `features`(기능+상태) `domain`(규칙) `repositories`(계약) `infra`(구현) `lib`(유틸) `styles`(토큰) `test`(테스트 지원).

## 규칙
1. 새 최상위 디렉토리·직속 파일·확장자는 ADR + `scripts/arch-layers.mjs` 수정. 목록 밖이면 파일 자체가 린트 에러다(ADR-0006).
2. `__arch__/`는 `scripts/check-arch.sh`의 임시 픽스처 이름 — 직접 만들지 않는다.
3. 의존 방향 `docs/ARCHITECTURE.md` §1 · 코드/import 표기 `docs/conventions/code-style.md` §2·§7.

## 검증
```bash
pnpm check
```
````

##### 파일: `/home/user/Tasky/src/app/AGENTS.md`
````markdown
<!-- 읽기 조건: 라우트·레이아웃·메타데이터·providers·PWA manifest를 수정할 때. -->

# src/app/ — AGENTS

## 목적
Next.js App Router 셸. `layout.tsx`(서버, 폰트·테마 속성), `page.tsx`(서버, `<HomeScreen/>` 렌더만), `providers.tsx`(client, `setRepositories` — 조립 지점), `manifest.ts`, `error.tsx`. 비즈니스 로직·상태·컴포넌트 구현은 `features`.

## 규칙
1. `page.tsx`는 10줄 이내: feature 화면 컴포넌트 1개를 `@/features/<f>`(index.ts)에서 가져와 렌더.
2. `'use client'`는 `providers.tsx`, `error.tsx`에만.
3. 라우트 추가는 스펙 + 오케스트레이터 승인(MVP는 `/` 단일 페이지).
4. 서비스워커 설정(`@serwist/next`)은 `next.config.ts`에, 여기서는 `manifest.ts`만. 아이콘은 `public/`(`src/app`에 이미지 파일 금지).
5. 출처: `docs/ARCHITECTURE.md` §1·§6, `docs/conventions/code-style.md` §3.

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
1. props로만 동작. 카테고리 색은 `--cat-color` CSS 변수를 props로 받아 적용.
2. 접근성 기본 내장: 포커스 링, `aria-*`, 키보드. 프리미티브가 접근성을 책임지면 feature는 신경 덜 쓴다.
3. 파일 1개 = 컴포넌트 1개 + 테스트 1개(`Button.test.tsx`, 행동 1~2개).
4. 세 번째 사용처가 생길 때 여기로 승격. 그 전엔 feature 안에 둔다.
5. 출처: `docs/ARCHITECTURE.md` §1, `docs/conventions/code-style.md` §3·§6·§10.

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
1. `index.ts`는 `src/`에서 유일한 배럴 위치. 밖으로 보여줄 것만 명시 export(`HomeScreen`, 스토어 훅). 새 feature 디렉토리는 `eslint.config.mjs`가 자동 인식하지만 `index.ts`가 없으면 `check-arch.sh`가 실패한다.
2. feature 간 통신은 상대 feature 의 `index.ts`가 export 한 스토어 훅 구독으로. 이벤트 버스 금지.
3. `src/features/` 직속 파일 금지 — 공용 코드는 `components` 또는 `lib`로.
4. 출처: `docs/ARCHITECTURE.md` §1, `docs/conventions/code-style.md` §2·§4·§7(같은 feature 안도 `@/features/<f>/…`).

## 검증
```bash
pnpm test -- src/features/<f> --reporter=dot 2>&1 | tail -20 && pnpm lint
```

## 자주 하는 실수
- 스토어 전체 구독(`useTodoStore()`) → 리렌더 폭증, selector 사용.
- `repo.upsert({ ...todo, done: true })` → 컴파일 에러. 도메인 함수(`toggleDone`)의 반환값을 저장한다.
````

##### 파일: `/home/user/Tasky/src/domain/AGENTS.md`
````markdown
<!-- 읽기 조건: 엔티티 타입·검증·계산 규칙을 추가·수정할 때. -->

# src/domain/ — AGENTS

## 목적
외부 패키지 0의 비즈니스 규칙. `todo/`, `category/`, `date/`, `theme/`, `meta.ts`(`Meta`·`Persistable`·`createMeta`/`touch`/`markDeleted`), `errors.ts`. 배럴 없음.

## 규칙
1. `meta.ts`는 `Persistable`을 만드는 유일한 파일. 다른 도메인 파일도 `Meta` 필드를 직접 쓰지 않고 `touch`/`markDeleted`를 호출한다(린트).
2. 모든 export 함수에 단위 테스트(같은 디렉토리 `*.test.ts`). 커버리지 100% 목표.
3. 출처: `docs/conventions/code-style.md` §5, ADR-0005·0007.

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
저장소 **계약**(인터페이스)과 테스트용 memory 구현, 런타임 주입 컨테이너(`container.ts`: `getRepositories() / setRepositories()`).

## 규칙
1. 시그니처 변경 = ADR + memory·indexeddb 구현 동시 수정 + 계약 테스트(`*.contract.test.ts`)·`READS` 목록 갱신. 한 PR.
2. 계약 테스트는 구현 팩토리를 인자로 받아 memory/indexeddb 둘 다 실행한다.
3. memory 구현의 조회는 `memory/live.ts` 헬퍼만 거친다(툼스톤 필터 한 곳).
4. 컨테이너 기본값 없음: `getRepositories()`는 미설정 시 throw(조립 누락을 조기 발견).
5. `SettingsRepository.get()`은 행이 없으면 `id: 'default'` 기본 행을 만들어 반환(단일 행 보장).
6. 출처: `docs/conventions/code-style.md` §5·§11, ADR-0007.

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
저장소 인터페이스의 실제 구현. `indexeddb/`(Dexie) 현재, `sync/`(어댑터 + `conflict.ts` 충돌 정책) Phase 2.

## 규칙
1. 스키마는 `indexeddb/db.ts` 한 곳. 변경은 `version(n+1).stores({...}).upgrade(...)` 추가로만(기존 버전 수정 금지) + ADR + 마이그레이션 테스트(fake-indexeddb로 n → n+1). 비인덱스 필드 추가는 버전업 불필요.
2. DB 이름 `tasky`. 테이블: `todos`, `categories`, `settings`. 인덱스는 `docs/ARCHITECTURE.md` §4.
3. `db.ts`를 import하는 파일은 `indexeddb/query.ts`뿐(린트). 레포지토리 구현은 `query.ts`의 `liveAll/liveOne/put`만 쓴다 — 툼스톤 필터와 역직렬화 `as`가 그 한 곳에 있다.
4. 각 구현은 계약 테스트를 통과해야 한다(`repositories/*.contract.test.ts` 재사용). 트랜잭션은 다중 테이블 쓰기에만.
5. 출처: `docs/ARCHITECTURE.md` §1·§6, ADR-0002·0007.

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
프레임워크·도메인 무관 순수 유틸. `cn.ts`(clsx+tailwind-merge), `date.ts`(DateKey ↔ Date, 주 계산, `nowIso()`), `id.ts`(`newId()` = `crypto.randomUUID()` 래퍼).

## 규칙
1. 추가 전 `Grep`으로 중복 확인. 함수 1개당 테스트 1개. 파일 ≤ 150줄.
2. `DateKey`는 `date.ts`가 정의하고 domain이 재export. 시간·ID 생성 함수는 `deps`로 도메인에 주입된다.
3. 출처: `docs/ARCHITECTURE.md` §1(허용 패키지 `clsx`, `tailwind-merge`).

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
디자인 토큰(`tokens.css`)과 전역 스타일(`globals.css`). `.css`만 둔다(코드 파일은 린트 에러).

## 규칙
1. 토큰 이름: `--color-{bg|surface|text|muted|accent|border}`, `--space-{1..8}`, `--radius-{sm|md|lg|full}`, `--z-{base|popover|modal|toast}`, `--shadow-{sm|md}`.
2. 테마: `:root[data-theme="light"]`, `:root[data-theme="dark"]` 에서 같은 토큰 재정의. 강조색은 `--color-accent`(사용자 선택, 스토어가 inline style로 주입).
3. Tailwind v4 `@theme`에 토큰을 등록해 `bg-bg`, `text-muted` 등 유틸로 사용. 폰트는 `layout.tsx`의 `next/font`, 여기서는 `--font-sans`만 참조.
4. 토큰 추가/변경은 스크린샷(라이트/다크) 첨부.

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
1. 픽스처는 팩토리 함수만(정적 JSON 금지). 기본값은 결정적(고정 날짜 `2026-01-15`, 고정 id 접두, `rev: 1`, `createdAt = updatedAt = '2026-01-15T00:00:00.000Z'`). `Persistable`이 필요하면 `touch(...)`로 만든다(`as Persistable` 금지는 여기서도 적용).
2. 각 테스트는 독립: `beforeEach`에서 memory 레포지토리 초기화. `vi.useFakeTimers()`는 애니메이션 테스트에만.
3. 출처: `docs/conventions/code-style.md` §11.

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
2. 각 테스트는 새 브라우저 컨텍스트(IndexedDB 격리). CI에서는 chromium만, 로컬은 `pnpm test:e2e --headed`.
3. 실패 시 트레이스 첨부(`--trace on-first-retry`).

## 검증
```bash
pnpm test:e2e 2>&1 | tail -20
```
````
