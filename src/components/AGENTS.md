<!-- 읽기 조건: 두 기능 이상에서 쓰는 UI 프리미티브를 추가·수정할 때. -->

# src/components/ — AGENTS

## 목적

무상태·도메인 무관 UI 프리미티브(`ui/`): `Button`, `Checkbox`, `IconButton`, `DragHandle`, `Popover`, `Dialog`, `ColorSwatch`, `ProgressRing` 등.

## 규칙

1. props로만 동작. 카테고리 색은 `--cat-color` CSS 변수를 props로 받아 적용.
   - **예외 하나: `ui/Toast.tsx` 의 토스트 허브**(`pushToast`/`useToasts`). 토스트를 띄우는 곳이
     feature 다섯이라 허브가 어느 feature 안에 있으면 나머지가 그 배럴을 import 해야 하고, 셸이
     이미 그 feature 들을 import 하므로 곧바로 순환이다(T-30 · `import/no-cycle`). 모든 feature 가
     의존해도 되는 아래층은 여기뿐이다. `zustand` 는 이 레이어에서 금지이므로 모듈 스토어 +
     `useSyncExternalStore` 로만 만든다. **다른 프리미티브에 상태를 두는 근거로 쓰지 말 것** —
     "여러 feature 가 공유하는 단일 슬롯" 이라는 같은 조건을 먼저 증명해야 한다.
2. 접근성 기본 내장: 포커스 링, `aria-*`, 키보드. 프리미티브가 접근성을 책임지면 feature는 신경 덜 쓴다.
3. 파일 1개 = 컴포넌트 1개 + 테스트 1개(`Button.test.tsx`, 행동 1~2개). 예외 둘.
   - 여러 오버레이가 공유하는 모듈(`ui/overlay-stack.ts` = 레이어 스택, `ui/overlay-rules.ts` =
     Enter/IME 규칙 + 배경 `inert` 예외 표식, `ui/card-class.ts` = 상시 카드 면 클래스 —
     app-shell R16, 사이드바와 diary 가 공유)은 컴포넌트가 아니지만 같은 이름의 테스트를 둔다.
   - 테스트 파일이 300줄(CLAUDE.md §6)에 닿으면 주제별로 `<Component>.<주제>.test.tsx` 로 나눈다
     (예: `Dialog.test.tsx` + `Dialog.trap.test.tsx` = 포커스 트랩·배경 inert). 컴포넌트 파일은
     그대로 하나다 — 나누는 것은 테스트뿐이다.

   IME·접근 이름처럼 **기능 코드도 쓰는** 판정은 `src/lib/`(`ime.ts`·`a11y.ts`)에 두고 가져다 쓴다.

4. 세 번째 사용처가 생길 때 여기로 승격. 그 전엔 feature 안에 둔다. **예외: 두 번째 사용처에서 사본밖에 길이 없을 때.** `DragHandle`(순서 변경 손잡이)이 그 경우였다 — 투두 본문과 카테고리 사이드바 둘뿐이지만, 조립 방향 때문에 상대 feature 의 파일을 직접 import 할 수 없고 React 컴포넌트라 `src/lib/` 에도 갈 수 없어(`features/AGENTS.md` 규칙 5-(4)) 남는 선택지가 복제뿐이었다. 복제는 같은 규칙이 Blocker 로 막으므로 승격이 유일하게 열린 길이다. **이 예외는 "두 번째면 올린다" 가 아니다** — 세 길(배럴 공유·`src/lib` 이동·그대로 두기)이 전부 막힌 것을 먼저 보여야 한다. **이 문턱은 React 컴포넌트용이다 — feature 간에 공유할 순수 함수(React 를 모르는 것)는 이 문턱이 아니라 `features/AGENTS.md` 규칙 5(`src/lib/`, 두 feature 째부터)를 따른다.**
5. 출처: `docs/ARCHITECTURE.md` §1, `docs/conventions/code-style.md` §3·§6·§10.

## 관할: ui/

`src/components/ui/`에는 별도 `AGENTS.md`를 두지 않는다(이 문서가 관할). 실제 컴포넌트 파일은 전부 여기 아래 있다.

## 검증

```bash
pnpm test src/components --reporter=dot 2>&1 | tail -20
```
