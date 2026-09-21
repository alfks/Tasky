<!-- 읽기 조건: Worker 테스트에서 D1 하네스(`d1-harness.ts`)를 쓰거나 고치기 전. -->

# worker/test/ — AGENTS

## 목적

실 D1 테스트 하네스(`d1-harness.ts` — `getPlatformProxy`(wrangler)로 로컬 Miniflare D1 을 띄우고
`db/migrations/*.sql` **전부를 파일명 정렬 순서로** 적용한다 — 리뷰에서 `0001_init.sql` 하드코딩이
지적됐다: `0002_*.sql` 이 생겨도 자동으로 같이 적용돼야 새 마이그레이션이 테스트 스키마에서 조용히
누락되는 일이 없다). `src/test/` 와 같은 원칙: 픽스처·하네스 디렉토리라 `worker/**` 의 경계
제한(`eslint.config.mjs` worker 블록) 밖이다.

## 규칙 (이 디렉토리에만 적용)

1. 테스트마다 독립 임시 디렉토리를 써서 서로 격리한다(`createD1Fixture()` 가 `mkdtempSync` 로
   만든다) — 병렬 테스트 파일이 서로의 D1 상태를 건드리지 않는다.
2. `fx.dispose()` 를 `finally` 에서 반드시 부른다(임시 디렉토리 정리) — `worker/**/*.test.ts` 의
   기존 테스트가 전부 이 패턴을 쓴다.

## 검증

```bash
pnpm vitest run --project=worker
```
