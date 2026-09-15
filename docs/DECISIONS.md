<!-- 읽기 조건: "왜 이렇게 되어 있지?"가 궁금할 때, 결정을 바꾸려 할 때, 새 ADR 번호를 정할 때. 본문은 각 ADR 파일. -->

# 아키텍처 결정 기록 (ADR) 인덱스

작성법: [decisions/AGENTS.md](./decisions/AGENTS.md). 템플릿: [ADR-0000](./decisions/ADR-0000-template.md).
새 ADR은 마지막 번호 +1, 여기에 행 추가(같은 PR).

| 번호 | 제목 | 상태 | 날짜 | 영향 범위 |
|------|------|------|------|----------|
| [ADR-0001](./decisions/ADR-0001-nextjs-app-router.md) | Next.js 15 App Router + TypeScript + PWA(Serwist) | accepted | 2026-09-15 | `src/app`, PWA |
| [ADR-0002](./decisions/ADR-0002-local-first-indexeddb-repository.md) | 로컬 우선 — IndexedDB(Dexie) + Repository + 소프트 삭제 | accepted | 2026-09-15 | `src/domain`, `src/repositories`, `src/infra` |
| [ADR-0003](./decisions/ADR-0003-state-and-styling.md) | Zustand(feature별) + Tailwind v4 + CSS 변수 토큰 | accepted | 2026-09-15 | `src/features/*/store`, `src/styles` |
| [ADR-0004](./decisions/ADR-0004-agent-collaboration-rules.md) | 멀티 에이전트 협업 규칙 | accepted | 2026-09-15 | CLAUDE.md, AGENTS.md, scripts, CI |

## 예정(초안 필요 시 번호 예약 없이 작성)
- 동기화 어댑터 설계(Phase 2) · SNS 데이터 모델(Phase 2) · E2E 도입 범위
