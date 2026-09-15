<!-- 읽기 조건: 색·간격·라운드·z-index 토큰이나 테마를 변경할 때. -->

# src/styles/ — AGENTS

## 목적

디자인 토큰(`tokens.css`)과 전역 스타일(`globals.css`). `.css`만 둔다(코드 파일은 린트 에러).

## 규칙

1. 토큰 이름: `--color-{bg|surface|text|muted|accent|border}`, `--space-{1..8}`, `--radius-{sm|md|lg|full}`, `--z-{base|popover|modal|toast}`, `--shadow-{sm|md}`.
2. 테마: `:root[data-theme="light"]`, `:root[data-theme="dark"]` 에서 같은 토큰 재정의. 강조색은 `--color-accent`(사용자 선택, 스토어가 inline style로 주입).
3. Tailwind v4 `@theme`에 토큰을 등록해 `bg-bg`, `text-muted` 등 유틸로 사용. 폰트는 `tokens.css`의 `@font-face` 직접 선언(`next/font` 금지 — ADR-0010) + `layout.tsx`의 preload, 유틸에서는 `--font-sans`만 참조.
4. 토큰 추가/변경은 스크린샷(라이트/다크) 첨부.
5. 이 디렉토리에는 테스트도 둘 수 없다(`.ts`는 전부 린트 에러 — 의도된 규칙이다). 토큰 값을 검사하는 테스트는 `src/test/tokens.test.ts`에 둔다.

## 검증

```bash
pnpm build 2>&1 | tail -5
```
