<!-- 읽기 조건: 유틸을 추가하기 전(중복 확인), 기존 유틸을 수정할 때. -->

# src/lib/ — AGENTS

## 목적

프레임워크·도메인 무관 순수 유틸. 현재 `cn.ts`(clsx + tailwind-merge), `a11y.ts`(접근 이름 가드 — 공백 리터럴 차단 타입 `NonBlank` + 개발 모드 `assertAccessibleName`), `ime.ts`(`isImeKey` — 조합 중 키 판정, 오버레이와 기능 전용 대화상자가 함께 쓴다), `focus-fallback.ts`(행 삭제 뒤 포커스 착지 R14 순서 — shell·calendar 가 함께 쓴다, T-87), `korean.ts`(`objectParticle` — 을/를 조사, category·todo 문구가 함께 쓴다, T-87), `date.ts`(DateKey ↔ Date, 주 계산, `nowIso()`), `id.ts`(`newId()` = `crypto.randomUUID()` 래퍼).

## 무엇이 여기 올라오는가

세 조건을 전부 만족하면 lib 다: (1) `src/` 안에서 `lib` 밖을 import 하지 않고 패키지도 `PACKAGES.lib` 밖을 쓰지 않는다 — DOM 전역(`document`·`window`·`requestAnimationFrame`)은 써도 된다(`no-restricted-globals` 는 domain 에만 걸린다). (2) feature 어휘를 모른다 — 인자는 DOM 요소·문자열·숫자이고 `Todo`·`Category` 같은 도메인 타입·화면 문구·스토어를 참조하지 않는다. (3) 두 feature 이상이 쓰거나, 조립 방향 때문에 배럴로 공유할 수 없다(`features/AGENTS.md` 규칙 5). React 훅·컴포넌트는 (2)를 만족해도 여기 올 수 없다 — lib 은 `react`를 import 할 수 없다(`features/AGENTS.md` 규칙 5-(4)). 예: `focus-fallback.ts`(행 삭제 뒤 포커스 착지 — shell·calendar 가 쓴다), `korean.ts`(을/를 조사 — category·todo 문구가 쓴다), `ime.ts`. 반례: `features/shell/lib/toast-stack.ts` 는 셸 스토어 타입을 알므로 feature 에 남는다. 예외: lib 이 import 할 수 없는 상수·타입의 **동형 재선언**은 복제로 보지 않는다(테스트로 묶을 것) — 규칙 2 의 `date.ts`/`DateKey`, `focus-fallback.ts#toastActionButton`/`OVERLAY_ALWAYS_LIVE_ATTR` 가 선례다.

## 규칙

1. 추가 전 `Grep`으로 중복 확인. 함수 1개당 테스트 1개. 파일 ≤ 150줄.
2. `DateKey`의 정의는 `src/domain/date/date-key.ts` 하나다. `lib`은 `src/` 안에서 `lib` 밖을 import할 수 없으므로(`ALLOW.lib = ['lib']` — 린트) 그 타입을 가져올 수 없고, 반대로 `domain`이 `@/lib/date`를 import해 재export하는 것도 `NO_LIB_CLOCK`이 막는다. 따라서 `date.ts`는 **같은 모양의 템플릿 리터럴 타입을 자체 선언**한다(구조적 타입이라 호출부에서 그대로 호환된다). **두 선언이 같은 모양인지는 어떤 도구도 검사하지 않는다 — 리뷰 항목이다**: `date-key.ts`를 바꾸면 같은 PR에서 `lib/date.ts`도 바꾼다.
3. 시각·ID 생성 함수(`nowIso()`·`newId()`)는 여기서 구현하고 도메인에는 `deps = { now, id }`로 **주입**한다(ADR-0005 규칙 2). 도메인이 직접 import하면 린트 에러다.
4. 출처: `docs/ARCHITECTURE.md` §1(허용 패키지 `clsx`, `tailwind-merge`).

## 삭제 뒤 포커스 이동 타이밍 (리뷰 #104 라운드2)

행 삭제처럼 **스토어 쓰기 → 화면에서 그 행이 실제로 사라짐** 사이에 포커스를 옮길 때, `requestAnimationFrame`/`queueMicrotask` 로 "이만큼 기다리면 되겠지" 를 복제하지 마라 — React 가 몇 프레임/몇 틱 안에 커밋한다는 계약은 없다(형제 PR #105 의 `queueMicrotask` 는 그 경로가 `useSyncExternalStore` 동기 플러시라는 **우연**으로만 맞았다). 옳은 모양은 **effect 의존성**이다: 지우려는 목록의 길이가 실제로 줄어든 것을 의존성으로 하는 `useEffect` 에서만 포커스를 옮긴다.

```ts
const pending = useRef(false);
const prevLength = useRef(items.length);
useEffect(() => {
  if (pending.current && items.length < prevLength.current) {
    pending.current = false;
    fallback()?.focus();
  }
  prevLength.current = items.length;
}, [items.length, fallback]);

// 삭제 핸들러 — 깃발은 쓰기를 **시작하기 전에** 세운다. `set()`(zustand 등)은 `await` 가
// 반환하기 전에 이미 구독자를 갱신하므로, 끝난 뒤 세우면 그 렌더를 이미 지나쳐 있을 수 있다
// (반대 순서로 적었다가 `RoutineManager.test.tsx` 3건이 실제로 빨간불이었다 — 실측).
async function handleRemove(id: string) {
  pending.current = true;
  const ok = await remove(id);
  if (!ok) pending.current = false; // 실패하면 아무것도 안 줄었으니 내린다
}
```

`handoffFocus`(`focus-fallback.ts`)의 `requestAnimationFrame` 은 **다른 문제**(DOM 에 아직 없는, 지금 막 그려지는 **후임** 요소를 찾는 것)라 이 규칙의 예외다 — effect 로 바꾸지 마라.

**기존에 남아 있는 것(이 규칙 확립 전에 짜여 옮기지 않은 코드, 후속 정리는 `docs/PHASE2_TICKET_BACKLOG.md`)**: `DiaryCard.tsx` 의 `queueMicrotask`, `useTodoItemFocus`·`useFlipRows`·`useFocusStartReset` 의 `requestAnimationFrame` — 새로 짜는 코드가 이들을 보고 그대로 복제하지 말 것.

## 검증

```bash
pnpm test src/lib --reporter=dot 2>&1 | tail -20
```
