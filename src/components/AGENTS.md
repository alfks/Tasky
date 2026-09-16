<!-- 읽기 조건: 두 기능 이상에서 쓰는 UI 프리미티브를 추가·수정할 때. -->

# src/components/ — AGENTS

## 목적

무상태·도메인 무관 UI 프리미티브(`ui/`): `Button`, `Checkbox`, `IconButton`, `Popover`, `Dialog`, `ColorSwatch`, `ProgressRing` 등.

## 규칙

1. props로만 동작. 카테고리 색은 `--cat-color` CSS 변수를 props로 받아 적용.
2. 접근성 기본 내장: 포커스 링, `aria-*`, 키보드. 프리미티브가 접근성을 책임지면 feature는 신경 덜 쓴다.
3. 파일 1개 = 컴포넌트 1개 + 테스트 1개(`Button.test.tsx`, 행동 1~2개). 예외: 여러 오버레이가
   공유하는 레이어 스택(`ui/overlay-stack.ts`)처럼 컴포넌트가 아닌 모듈은 같은 이름의 테스트를 둔다.
   IME·접근 이름처럼 **기능 코드도 쓰는** 판정은 `src/lib/`(`ime.ts`·`a11y.ts`)에 두고 가져다 쓴다.
4. 세 번째 사용처가 생길 때 여기로 승격. 그 전엔 feature 안에 둔다.
5. 출처: `docs/ARCHITECTURE.md` §1, `docs/conventions/code-style.md` §3·§6·§10.

## 관할: ui/

`src/components/ui/`에는 별도 `AGENTS.md`를 두지 않는다(이 문서가 관할). 실제 컴포넌트 파일은 전부 여기 아래 있다.

## 검증

```bash
pnpm test src/components --reporter=dot 2>&1 | tail -20
```
