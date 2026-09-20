<!-- 읽기 조건: 색·간격·라운드·z-index 토큰이나 테마를 변경할 때. -->

# src/styles/ — AGENTS

## 목적

디자인 토큰(`tokens.css`), 폰트 선언(`fonts.css`), 전역 스타일(`globals.css`). `.css`만 둔다(코드 파일은 린트 에러). 토큰 값의 단일 소스는 `docs/specs/theme.md` §3.

## 규칙

1. 토큰 이름: `--color-{bg|surface|surface-2|text|muted|faint|border|accent|on-accent|focus|danger|saturday|sunday}`, `--color-cat-<id>[-dark]`(12색), `--color-heatmap-{0..4}`(히트맵 진하기 5단계, theme.md §3-H), `--space-{1..8}`, `--radius-{sm|md|lg|xl|full}`, `--text-{xs|sm|base|md|lg|xl|2xl|3xl}`, `--leading-normal`, `--font-sans`, `--font-weight-{regular|semibold|bold}`, `--shadow-{sm|md}`(런타임 값은 `--elev-{sm|md}`), `--motion-{fast|base|slow|ease}`, `--z-{base|sticky|popover|modal|toast}`, `--control-{checkbox-size|checkbox-border|height|hit-min}`.
2. 테마: 라이트가 `@theme`의 기본값이고, 다크는 **두 블록**에서 같은 토큰을 재정의한다 — 시스템 추종용 `@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) }` 와 명시 선택용 `:root[data-theme='dark']`. 둘 다 `@theme`(= `@layer theme`)보다 우선하므로 명시 선택이 시스템을 항상 이긴다(theme.md R6·R7). 강조색은 `--color-accent`(사용자 선택, 스토어가 inline style로 주입).
3. Tailwind v4 `@theme`에 토큰을 등록해 `bg-bg`, `text-muted` 등 유틸로 사용. **`@theme` 밖 `:root`에 두는 예외 2가지**: ① 그림자 — `--shadow-*`를 `@theme`에 리터럴로 넣으면 `.shadow-md` 유틸이 빌드 시점 라이트 값을 굽어 다크 재정의를 무시한다(실측). 값은 `--elev-*`에 두고 `@theme inline { --shadow-md: var(--elev-md) }`로 연결한다. ② 카테고리 팔레트 `--color-cat-*` — 등록하면 `bg-cat-coral` 등 유틸 24개가 생겨 theme.md R1을 우회할 길이 열린다.
4. 폰트: `@font-face`는 `fonts.css`에만 둔다(`globals.css`가 import). `next/font` 금지 — 빌드 스택이 순수 Vite + React라 그런 경로가 없다(ADR-0013). `tokens.css`는 `--font-sans` 스택만 갖고 파일을 가리키지 않는다.
5. 토큰 추가/변경은 스크린샷(라이트/다크) 첨부.
6. 이 디렉토리에는 테스트도 둘 수 없다(`.ts`는 전부 린트 에러 — 의도된 규칙이다). 토큰 값을 검사하는 테스트는 `src/test/tokens.test.ts`에 둔다.

## 검증

```bash
pnpm build 2>&1 | tail -5
pnpm test -- src/test/tokens.test.ts
```
