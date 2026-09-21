<!-- 읽기 조건: src/features/sync/ 바로 아래(components/store)에 파일을 추가하기 전, 관할만 확인하려고. 규칙 본문은 ../AGENTS.md. -->

# src/features/sync/ — AGENTS

관할 선언 전용 — 고유 규칙 없음. 규칙 본문: [src/features/AGENTS.md](../AGENTS.md).

지연 로드 경계(진입 vs `sync-engine`/`auth-actions` 지연 청크)는 이 디렉토리 파일들의
머리주석과 `lazy-boundary.test.ts` 가 단일 소스다. 새 파일을 더할 때는 그 테스트의 허용
목록을 먼저 본다 — 목록 밖에서 시작하는 정적 값 import 는 그대로 실패한다.

## 관할: components/

## 관할: store/
