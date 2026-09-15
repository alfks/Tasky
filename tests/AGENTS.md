<!-- 읽기 조건: E2E 테스트를 작성·수정할 때. -->

# tests/ — AGENTS

## 목적

Playwright E2E(`tests/e2e/`). 스모크 1개(앱 로드 → 카테고리 추가 → 투두 추가 → 체크 → 달성률 갱신)부터.

## 규칙

1. 셀렉터는 `getByRole`/`getByLabel`. `data-testid`는 최후 수단.
2. 각 테스트는 새 브라우저 컨텍스트(IndexedDB 격리). CI에서는 chromium만, 로컬은 `pnpm test:e2e --headed`.
3. 실패 시 트레이스 첨부(`--trace on-first-retry`).

## 관할: e2e/

`tests/e2e/`에는 별도 `AGENTS.md`를 두지 않는다(이 문서가 관할).

## 검증

```bash
pnpm test:e2e 2>&1 | tail -20
```
