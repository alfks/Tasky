<!-- 읽기 조건: 오케스트레이터/리뷰어 역할을 맡았을 때, 또는 다른 에이전트에게 작업을 넘기거나 받을 때. 단순 구현만 할 때는 CLAUDE.md §8 요약으로 충분. -->

# Tasky 루트 에이전트 가이드

CLAUDE.md의 규칙은 여기서 반복하지 않는다. 이 문서는 **역할별 프로토콜, 핸드오프 포맷, 리뷰 루프, 충돌 회피**만 다룬다.
상세 운영법(티켓 전문 포맷, 페르소나 체크리스트, 심각도 정의)은 [docs/conventions/agent-collaboration.md](docs/conventions/agent-collaboration.md).

## 1. 역할과 프로토콜

### 오케스트레이터 (1명)

1. 사용자 요구 → `docs/specs/<feature>.md` 확인(없으면 스펙 티켓 먼저).
2. 티켓 작성: `.worktrees/tickets/T-<n>.md` (포맷: agent-collaboration.md §1). **`owns:` 파일 목록 필수.**
3. `.worktrees/BOARD.md`에 행 추가(상태 `todo`). 동시 진행 티켓끼리 `owns:` 교집합이 없는지 확인 — 겹치면 직렬화.
4. 구현 에이전트에게 티켓 **경로만** 전달 (본문 복붙 금지).
5. PR 생성 보고를 받으면 리뷰 라운드 개시(§3). 종료 조건 충족 시 머지(squash) → `bash scripts/wt.sh rm <name>` → BOARD 상태 `done`.
6. 절대 직접 구현하지 않는다(코드 수정은 항상 티켓을 통해).

### 구현 에이전트 (병렬 N명)

1. 티켓 읽기 → 티켓의 `reads:`에 적힌 문서/디렉토리 `AGENTS.md`만 읽기.
2. `bash scripts/wt.sh new <branch>` → 워크트리로 이동. **이후 모든 명령은 워크트리 경로에서.**
3. `owns:` 파일만 수정. 다른 파일이 꼭 필요하면 **중단하고 오케스트레이터에게 `owns:` 확장 요청**(임의 수정 금지).
4. `pnpm check` 통과 → 커밋(author 규칙) → push → PR(템플릿) → 핸드오프 문서 `.worktrees/handoffs/T-<n>.md` 작성.
5. 최종 응답: PR URL + 핸드오프 경로 + 15줄 이내 요약.
6. 리뷰 피드백 수신 시: 각 항목에 `반영` / `거절(근거)` / `후속 티켓 제안` 중 하나로 응답. 같은 워크트리·브랜치에서 수정 커밋 추가.

### 리뷰 에이전트 (병렬, 페르소나별)

1. 입력: PR 번호(또는 브랜치) + 페르소나 + 티켓 경로. `git diff main...<branch>` **diff만** 읽는다. 맥락이 필요하면 해당 함수/타입만 범위 Read.
2. 출력: agent-collaboration.md §4 리뷰 보고 템플릿. 항목마다 `[Blocker|Major|Minor|Nit]` + 파일:줄 + 제안. 칭찬·요약 금지.
3. 페르소나 밖 항목은 쓰지 않는다(예: 백엔드 리뷰어가 색상 지적 금지). 겹치면 오케스트레이터가 중복 제거.
4. 절대 코드를 직접 수정하지 않는다.

### 리서치 에이전트

1. 산출물은 `docs/research/<topic>.md`(읽기 조건 주석 + 섹션 헤더 필수). 응답은 파일 경로 + 10줄 요약.
2. 금지어 규칙 최우선. 출처의 제품명은 "레퍼런스 앱"으로 치환.

## 2. 핸드오프 포맷

포맷 정의는 [.worktrees/AGENTS.md](.worktrees/AGENTS.md)(핸드오프 파일이 실제로 놓이는 곳, PR 생성 직후 작성). 리뷰 라운드마다 `## Round N 반영` 절을 append(agent-collaboration.md §3).

## 3. 리뷰 피드백 루프 (요약 — 상세: [agent-collaboration.md §4](docs/conventions/agent-collaboration.md))

병렬 페르소나 리뷰 → 오케스트레이터 집계(중복 제거) → **유효 피드백(Blocker+Major) ≤ 3**이면 종료(Blocker 수정 + Major 반영/근거 거절) 후 머지, **≥ 4**면 다음 라운드(최대 3). 초과 시 사용자 에스컬레이션. 리뷰어 간 의견 충돌은 오케스트레이터가 ADR/스펙 근거로 판정.
라운드 상태는 PR 라벨 `review:round-1|2|3`, 종료 시 `status:ready-to-merge`.

## 4. 병렬 작업 충돌 회피 (파일 소유권 락)

- **락의 단위는 파일 경로**, 선언 위치는 티켓의 `owns:`. BOARD.md의 `owns` 열이 현재 락 현황.
- 동시 진행 티켓의 `owns:`는 **서로소**여야 한다. 공용 파일(`package.json`, `src/styles/tokens.css`, `src/repositories/container.ts` 등)은 **한 번에 한 티켓만** 소유.
- **교집합 검사 책임: 오케스트레이터.** 티켓 발행 전 BOARD.md의 `in-progress`/`in-review`/`needs-fix` 행 `owns` 열과 신규 티켓 `owns:`를 대조(절차: agent-collaboration.md §1.1). 이 검사는 기계적으로 강제되지 않는다 — 티켓 파일이 `.gitignore` 대상이라 CI가 볼 수 없기 때문(더 강한 CI 강제를 넣지 않은 이유: 지금 단계에선 리뷰 시점 diff 대조로 충분하고, 별도 스크립트·CI 스텝 추가는 과설계로 판단).
- 락 규칙 위반(= `owns:` 밖 파일 변경)은 리뷰에서 자동 Blocker. **검증 방법**: PR 본문 `## owns` 블록(티켓의 `owns:`를 그대로 복사)과 `git diff --name-only main...HEAD`를 리뷰어가 대조 — 초과 파일이 있으면 Blocker.
- 새 디렉토리 생성은 그 디렉토리 전체(`src/features/todo/**`)를 owns로 선언 가능. 기존 디렉토리는 파일 단위.
- 공유 리소스 순서: `package.json` 의존성 추가는 `chore/deps-<n>` 티켓으로 먼저 머지 → 기능 티켓은 그 위에서 시작.
- 충돌 발생 시: 워크트리에서 `git rebase main` → 해결 → `--force-with-lease`. 다른 티켓의 변경을 되돌리지 않는다.

## 5. 모델별 배정 가이드 (권장)

| 작업                                    | 권장                                                    |
| --------------------------------------- | ------------------------------------------------------- |
| 티켓 설계, 리뷰 집계·판정, 아키텍처/ADR | opus / fable                                            |
| 기능 구현, 테스트 작성                  | sonnet (범위가 명확할 때) / fable (레이어 경계 걸칠 때) |
| 페르소나 리뷰                           | sonnet (병렬 3~4개)                                     |
| 리서치 요약                             | sonnet                                                  |
