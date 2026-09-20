<!-- 읽기 조건: features/<f>/ 아래 컴포넌트·훅·스토어를 작성·수정할 때. feature별 하위 AGENTS.md는 없다 — 이 파일이 전부 다룬다. -->

# src/features/ — AGENTS

## 목적

기능 슬라이스. 각 feature = `index.ts` + 하위 디렉토리(보통 `components/` `hooks/` `store/`, 필요하면 더 — 아래 '하위 구조'). MVP: `todo`, `category`, `date-strip`, `stats`, `theme`. 화면 조립은 `todo/components/HomeScreen.tsx`.

## 규칙

1. `index.ts`는 `src/`에서 유일한 배럴 위치. 밖으로 보여줄 것만 명시 export(`HomeScreen`, 스토어 훅). 새 feature 디렉토리는 `eslint.config.mjs`가 자동 인식하지만 `index.ts`가 없으면 `check-arch.sh`가 실패한다.
2. feature 간 통신은 상대 feature 의 `index.ts`가 export 한 스토어 훅 구독으로. 이벤트 버스 금지.
3. `src/features/` 직속 파일 금지 — 공용 코드는 `components` 또는 `lib`로.
4. 출처: `docs/ARCHITECTURE.md` §1, `docs/conventions/code-style.md` §2·§4·§7(같은 feature 안도 `@/features/<f>/…`).
5. **feature 간에 공유할 순수 유틸은 `src/lib/` 로 올린다. feature 안에 복제하지 않는다.** 배럴(`index.ts`)은 스토어 훅·컴포넌트를 내보내는 공개 API 통로이지 유틸 통로가 아니다 — 배럴을 import 하면 그 feature 의 컴포넌트 그래프 전체가 내 의존이 되고, 상대가 나를 조립하는 쪽이면(`shell → calendar` 처럼) `import/no-cycle` 이 막는다. 그래서 `import/no-restricted-paths`(다른 feature 는 `index.ts` 만) + `import/no-cycle` 조합 아래에서 **조립되는 feature 는 조립하는 feature 의 유틸을 배럴로도 직접 경로로도 가져올 수 없다.** 그 자리에서 사본을 만들면 안 된다: (1) 그 함수가 `src/` 에서 `lib` 밖을 import 하지 않고 feature 어휘(`Todo`·`Category` 타입, 화면 문구, 스토어)를 모르면 **원본을 `src/lib/<name>.ts` 로 옮기고 양쪽이 그것을 import 한다**(DOM 전역 사용은 lib 에서 허용된다 — `lib/focus-fallback.ts`·`lib/ime.ts` 가 선례). (2) 옮길 파일이 내 티켓의 `owns:` 밖이면 **복제하지 말고 멈춰서 owns 확장을 요청한다**(agent-collaboration.md §1 — 락 위반보다 복제가 더 비싸다: 갈라진 사본은 diff 대조로 드러나지 않는다). (3) feature 어휘를 아는 함수(문구 조립·feature 데이터 계산)는 그 feature 의 `lib/` 에 남긴다. (4) **React 훅·컴포넌트는 `src/lib` 에 갈 수 없다**(lib 은 프레임워크 무관 — `React` import 금지) — `useRemovalReturnFocus` 실측: 배럴 경유 공유는 `import/no-cycle` 2건, 직접 경로는 `import/no-restricted-paths` 1건으로 (1)의 탈출구가 그대로 막힌다. 지금 feature 간 공용 React 훅의 자리는 없다 — **복제하지 말고 멈춰서 에스컬레이션한다**(agent-collaboration.md §7). React 컴포넌트가 세 번째 사용처를 맞으면 `components/AGENTS.md` 규칙 4(승격)를 따른다. 머리주석에 "원본은 …을 그대로 옮겼다" 류의 문장을 쓰게 되는 순간이 이 규칙을 어기는 순간이다 — 리뷰에서 Blocker 다. 예외: lib 이 import 할 수 없는 상수·타입을 **똑같은 모양으로 다시 선언**하는 것은 복제가 아니다 — (1)의 "lib 밖을 import 하지 않는다"는 제약이 그 재선언을 강제한 장본인이다(`lib/date.ts` 의 `DateKey` 재선언, `lib/focus-fallback.ts#toastActionButton` 의 `OVERLAY_ALWAYS_LIVE_ATTR` 리터럴이 선례) — 갈라지면 테스트가 잡게 묶어 둔다.

## 하위 구조

각 feature 는 `index.ts` + 필요한 만큼의 하위 디렉토리를 갖는다. 기본은 `components/` `hooks/` `store/` 셋이고, **여기서 끝나야 한다는 규칙은 없다** — `code-style.md` §2("넘으면 하위 폴더로 분할, feature 안이면 index 에 재export 하지 않아도 된다")가 분할을 명문으로 허용하므로 순수 헬퍼를 모으는 `lib/` 같은 디렉토리를 더 둘 수 있다(예: `date-strip/lib/`). 새 하위 디렉토리에도 `AGENTS.md`가 필요하다(루트 헌법 §1-4) — 아래 관할 선언이 그 부담을 없앤다.

`관할:`은 직계 자식만 면제하므로 여기서 `todo/`를 선언해도 그 아래 `components/`는 면제되지 않는다 — 그래서 `src/features/<f>/AGENTS.md`(5개)를 관할 선언 전용 최소 파일로 둔다. 규칙 본문은 이 문서가 전담(중복 금지).

## 검증

```bash
pnpm test src/features/<f> --reporter=dot 2>&1 | tail -20 && pnpm lint
```

## 자주 하는 실수

- 스토어 전체 구독(`useTodoStore()`) → 리렌더 폭증, selector 사용.
- `repo.upsert({ ...todo, done: true })` → 컴파일 에러. 도메인 함수(`toggleDone`)의 반환값을 저장한다.
