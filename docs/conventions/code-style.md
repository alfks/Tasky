<!-- 읽기 조건: src/ 아래 코드를 새로 쓰거나 수정하기 직전. 리뷰어는 diff에서 위반이 의심되는 절만 찾아 읽는다. 문서/설정만 만질 때는 읽지 않는다. -->

# 코드 컨벤션 (TypeScript / React / Next.js)

ESLint·Prettier가 잡는 것은 여기 적지 않는다(도구가 강제). 여기 적힌 것은 **도구가 못 잡는 규칙**이다. 도구가 잡는 규칙은 "무엇이 잡히는가"만 한 줄로 링크한다.

## 1. 네이밍

| 대상 | 규칙 | 예 |
|------|------|----|
| 컴포넌트 파일/함수 | PascalCase | `TodoItem.tsx`, `function TodoItem()` |
| 훅 | `use` + PascalCase, 파일 camelCase | `useTodosByDate.ts` |
| 그 외 파일(유틸, 스토어, 도메인) | kebab-case | `todo-store.ts`, `completion-rate.ts` |
| 타입/인터페이스 | PascalCase, 접두사 `I` 금지 | `Todo`, `TodoRepository` |
| Props 타입 | `<Component>Props` | `TodoItemProps` |
| 상수 | UPPER_SNAKE | `MAX_TITLE_LENGTH` |
| 불리언 | `is/has/can/should` 접두 | `isDone`, `hasCategory` |
| 이벤트 핸들러 | `handle<Event>` (내부), `on<Event>` (props) | `handleToggle`, `onToggle` |
| 디렉토리 | kebab-case | `date-strip/` |
| 테스트 | 대상 파일명 + `.test.ts(x)` 동일 디렉토리 | `completion-rate.test.ts` |
| 날짜 문자열 | 항상 `YYYY-MM-DD` (`DateKey` 타입) | `'2026-09-15'` |
| ID | `string` (UUID v4, `src/lib/id.ts`의 `newId()`만 사용), 타입 별칭 `TodoId`, `CategoryId` | — |

## 2. 파일/디렉토리 구조

```
src/features/<feature>/
  components/   <Feature>*.tsx        # 이 기능 전용 컴포넌트
  hooks/        use*.ts               # store/repository를 연결하는 훅
  store/        <feature>-store.ts    # Zustand
  index.ts                             # 공개 API만 export (외부는 index로만 import)
src/domain/<entity>/
  <entity>.ts                          # 타입 + 생성 함수
  <entity>.rules.ts                    # 순수 비즈니스 규칙 (validate, 계산)
  <entity>.test.ts
src/domain/meta.ts                     # Meta 타입 + touch() (ADR-0005)
src/repositories/
  <entity>-repository.ts               # interface only
  memory/<entity>-memory-repository.ts # 테스트/스토리용
  index.ts                             # Repositories 컨테이너 타입 + getRepositories()
src/infra/indexeddb/
  db.ts                                # Dexie 스키마·버전
  <entity>-indexeddb-repository.ts
```

- 한 파일 하나의 주요 export(컴포넌트 1개). 작은 헬퍼 컴포넌트는 같은 파일 하단에 비공개로 둘 수 있음(총 200줄 이하).
- 파일 ≤ 300줄(ESLint `max-lines`), 컴포넌트 ≤ 200줄, 일반 함수 ≤ 50줄(컴포넌트 함수 제외, 리뷰 기준), 중첩 깊이 ≤ 3. 넘으면 분할하고 `index.ts`로 재export.
- `src/app/`은 라우팅·레이아웃·메타데이터만. 페이지 컴포넌트는 `features`의 화면 컴포넌트를 렌더할 뿐 로직 없음.
- 배럴(`index.ts`)은 `features/*`와 `domain/*`에만. 배럴에서 `export *` 금지(명시 export). 배럴을 그 디렉토리 안에서 import하지 않는다(순환).
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
- 스토어는 `getRepositories()`로 레포지토리를 얻는다(`src/repositories/index.ts`). 테스트는 `setRepositories(memory)`로 교체.
- 컴포넌트는 selector로 필요한 조각만 구독: `useTodoStore(s => s.todosByDate[dateKey])`.
- 도메인 계산(달성률 등)은 스토어가 아니라 `domain/*/rules.ts`의 순수 함수. 스토어는 호출만. 엔티티 변경도 도메인 함수(`toggleDone(todo, deps)` 등)가 만든 새 값을 저장할 뿐, 스토어가 `updatedAt`·`rev`를 직접 쓰지 않는다.
- URL 상태(선택 날짜 등)는 `searchParams`가 아니라 스토어에 둔다(MVP는 단일 페이지). 변경 시 ADR.
- 서버 상태 라이브러리(TanStack Query 등) 도입 금지(ADR-0003). 동기화 도입 시 재검토.

## 5. 도메인 / 레포지토리 규칙

- `src/domain/**`는 `react`, `next`, `dexie`, `zustand`, 브라우저 전역, `Date`·`crypto`·`Math.random`을 참조하지 않는다(ESLint가 막음). 시간·ID는 `deps = { now: () => string, id: () => string }`로 주입(런타임 구현은 `lib/date.ts#nowIso`, `lib/id.ts#newId`).
- 엔티티는 `type` + 생성 함수 `createTodo(input, deps): Todo`. 클래스 금지. 불변 업데이트는 반드시 `touch()`를 거친다: `touch({ ...todo, done: true }, deps.now())` — `updatedAt`·`rev` 갱신은 이 한 곳에서만.
- 모든 엔티티 공통 필드 `Meta = { id, createdAt, updatedAt, rev, deletedAt? }` — 의미·검증·삭제 규칙은 ADR-0005(예외 없음, `Settings` 포함).
- 레포지토리 인터페이스는 `Promise` 반환, 도메인 타입만 사용(Dexie 타입 노출 금지). 메서드명: `getById / listByDate / upsert / remove / …`. 레포지토리는 받은 엔티티를 그대로 저장한다(시각·`rev`를 만들지 않음).
- 마이그레이션은 `infra/indexeddb/db.ts`의 Dexie `version(n)`으로만. 스키마 변경 = ADR + 마이그레이션 테스트.

## 6. CSS 전략

- Tailwind CSS v4 유틸리티 우선. 전역 CSS는 `src/styles/globals.css`(리셋·폰트), 토큰은 `src/styles/tokens.css`의 CSS 변수(`--color-bg`, `--color-accent`, `--radius-md`, `--space-*`).
- 테마는 `<html data-theme="light|dark">` + 강조색 `--color-accent`. 컴포넌트는 토큰만 참조(`bg-[var(--color-bg)]` 또는 `@theme`로 등록한 `bg-bg`). 하드코딩 색상(`#fff`, `bg-white`) 금지 — 예외: 카테고리 사용자 지정 색.
- 애니메이션은 `prefers-reduced-motion` 존중(`motion-safe:` 접두).
- z-index는 토큰(`--z-modal` 등)만. 임의 숫자 금지.
- 반응형은 데스크탑 우선이되 최소 폭 1024px에서 깨지지 않게. 모바일 최적화는 범위 밖(단, 레이아웃이 터지지 않을 것).

## 7. import 경로 · 순서 · disable 정책

**경로 규칙** — 레이어 경계는 `import/no-restricted-paths`가 **해석된 실제 경로**로 검사하므로 별칭·상대 경로·배럴 어느 쪽으로 써도 판정이 같다. 표기는 다음 하나로 통일한다.
- **경계를 넘는 import는 `@/` 별칭만.** 다른 레이어(`@/domain/...`, `@/components/ui/Button`)와 다른 feature(`@/features/<name>` — index.ts만)가 여기 해당.
- **같은 디렉토리 안(같은 feature, 같은 레이어 최상위 디렉토리)은 상대 경로** `./`, `../`(한 단계). 자기 디렉토리를 `@/features/<self>/...`, `@/domain/...`(domain 안에서)처럼 별칭으로 부르면 린트 에러 — 같은 것을 두 가지로 쓰지 않는다.
- `../../` 두 단계 이상 금지(린트). 두 단계가 필요하면 경계를 넘는 것이므로 `@/`로 쓴다.
- `@/` import는 반드시 해석되어야 한다(`import/no-unresolved`) — 별칭이 깨지면 경계 검사가 조용히 무력화되므로 카나리로 둔다.

**순서** (`import/order`가 정렬, 여기선 그룹 정의)
1. `react`, `next/*` · 2. 외부 패키지 · 3. `@/domain/*` · 4. `@/repositories/*`, `@/infra/*` · 5. `@/features/*` · 6. `@/components/*` · 7. `@/lib/*`, `@/styles/*` · 8. 상대 경로 · 9. `import type`은 각 그룹 마지막.

**`eslint-disable` 정책** (`scripts/check-eslint-disable.sh`가 CI `guard`에서 검사, 규칙 목록의 단일 소스는 그 스크립트 상단)
- 규칙명 없는 disable(`/* eslint-disable */`)과 인라인 설정 주석(`/* eslint … */`, `/* global */`) 금지.
- 아키텍처 규칙(`import/no-restricted-paths`, `no-restricted-imports`, `no-restricted-globals`, `no-restricted-syntax`, `import/no-cycle`, `import/no-unresolved`, `import/no-default-export`, `@typescript-eslint/no-explicit-any`)은 **disable 불가**. 경계가 불편하면 코드를 옮기거나 ADR로 경계를 바꾼다. `domain`·`repositories`·`infra`·`lib`에서는 disable 주석 자체가 무효(`noInlineConfig`).
- 그 외 규칙은 `// eslint-disable-next-line <rule> -- <사유>` 형식으로 사유 필수. 사유 없는 disable은 CI 실패.
- 경계 규칙이 실제로 위반을 잡는지는 `scripts/check-arch.sh`가 위반 픽스처로 확인한다. 경계를 바꾸면 그 케이스도 같은 PR에서 바꾼다.

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
- `any` 금지, `as` 캐스팅은 경계(IndexedDB 역직렬화)에서만 + 주석.

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
- **필수**: `domain/**` 모든 export 함수, `repositories/**` 모든 메서드(memory + indexeddb 구현 둘 다 같은 계약 테스트 공유 `*.contract.test.ts`). 계약 테스트는 `Meta`가 저장 전후 동일함을 포함한다(ADR-0005 규칙 4).
- **권장**: feature 컴포넌트당 핵심 행동 1~3개(체크 토글, 추가, 삭제). 스냅샷 테스트 금지.
- 테스트명은 한국어 문장: `it('완료된 투두 비율을 0~1로 반환한다')`.
- 테스트 데이터는 `src/test/fixtures/*.ts` 팩토리(`makeTodo(overrides)`). 매직 날짜 금지 — 팩토리 기본값 사용.
- 테스트 파일(`*.test.*`)과 `src/test/**`는 레이어 경계 린트에서 제외된다(계약 테스트가 `infra` 구현을 직접 돌린다). 그 외 파일은 `src/test`를 import할 수 없다.
- `pnpm test`는 3초 이내 유지. 느린 테스트는 `*.slow.test.ts`로 분리(CI만).
- E2E(Playwright)는 스모크 1개(앱 로드 → 투두 추가 → 체크)부터. `tests/e2e/`.

## 12. 금지 목록 (요약)

`any` · `React.FC` · index key · `div onClick` · 하드코딩 색상 · `export *` · 빈 catch · 티켓 없는 TODO · 컴포넌트 내 Dexie · `domain`의 프레임워크 import · `domain`의 `Date`/`crypto` 직접 호출 · `touch()` 없는 엔티티 변경 · 아키텍처 규칙 `eslint-disable` · 사유 없는 `eslint-disable` · `useEffect` 상태 동기화 · 스냅샷 테스트 · 300줄 초과 파일 · 레퍼런스 앱 제품명
