<!-- 읽기 조건: "왜 이렇게 되어 있지?"가 궁금할 때, 결정을 바꾸려 할 때, 새 ADR 번호를 정할 때. 본문은 각 ADR 파일. -->

# 아키텍처 결정 기록 (ADR) 인덱스

작성법: [decisions/AGENTS.md](./decisions/AGENTS.md). 템플릿: [ADR-0000](./decisions/ADR-0000-template.md).
새 ADR은 마지막 번호 +1, 여기에 행 추가(같은 PR).

| 번호 | 제목 | 상태 | 날짜 | 영향 범위 |
|------|------|------|------|----------|
| [ADR-0001](./decisions/ADR-0001-nextjs-app-router.md) | Next.js 15 App Router + TypeScript + PWA(Serwist) | accepted | 2026-09-15 | `src/app`, PWA |
| [ADR-0002](./decisions/ADR-0002-local-first-indexeddb-repository.md) | 로컬 우선 — IndexedDB(Dexie) + Repository | accepted | 2026-09-15 | `src/domain`, `src/repositories`, `src/infra` |
| [ADR-0003](./decisions/ADR-0003-state-and-styling.md) | Zustand(feature별) + Tailwind v4 + CSS 변수 토큰 | accepted | 2026-09-15 | `src/features/*/store`, `src/styles` |
| [ADR-0004](./decisions/ADR-0004-agent-collaboration-rules.md) | 멀티 에이전트 협업 규칙 | accepted | 2026-09-15 | CLAUDE.md, AGENTS.md, scripts, CI |
| [ADR-0005](./decisions/ADR-0005-entity-meta-and-sync-readiness.md) | 엔티티 공통 필드와 동기화 대비 규칙(ID · 시각 · rev · 툼스톤 · 충돌 정책) | accepted | 2026-09-15 | `src/domain`, `src/repositories`, `src/infra`, `src/lib/id.ts` |
| [ADR-0006](./decisions/ADR-0006-layer-boundary-allow-list.md) | 레이어 경계 강제 구조 — 허용 목록 · 전수 분류 · 절대 경로 표기 · 배럴 위치 | accepted | 2026-09-15 | `src/**` 전체, `scripts/arch-layers.mjs`, `eslint.config.mjs`, `scripts/check-arch.sh` |
| [ADR-0007](./decisions/ADR-0007-persistable-write-path-and-tombstone-reads.md) | 쓰기 경로 브랜드(`Persistable`)와 툼스톤 조회 규칙 | accepted | 2026-09-15 | `src/domain/meta.ts`, `src/repositories`, `src/infra/indexeddb/query.ts`, 계약 테스트 |

## 예정(초안 필요 시 번호 예약 없이 작성)
- 동기화 어댑터 설계(Phase 2, ADR-0005·0007을 supersede) · SNS 데이터 모델(Phase 2) · E2E 도입 범위
