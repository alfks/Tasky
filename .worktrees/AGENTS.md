<!-- 읽기 조건: 워크트리를 만들기 전(구현 에이전트), 티켓/보드/핸드오프/리뷰 보고를 쓰기 전(모든 역할). -->

# .worktrees/ — AGENTS

## 목적
(1) 병렬 작업용 git worktree의 유일한 위치, (2) 커밋하지 않는 **로컬 협업 상태**(보드·티켓·핸드오프·리뷰 보고)의 저장소. 이 디렉토리는 모든 워크트리에서 같은 절대 경로(`/home/user/Tasky/.worktrees/`)로 접근 가능하므로 에이전트들이 같은 보드를 본다.

## 구조 (`AGENTS.md`만 트래킹, 나머지 전부 gitignore)
```
.worktrees/
├── AGENTS.md              ← 이 파일(트래킹)
├── BOARD.md               ← 작업 보드(쓰기 주체는 규칙 4 참조)
├── tickets/T-<n>.md       ← 티켓(포맷: docs/conventions/agent-collaboration.md §1)
├── handoffs/T-<n>.md      ← 구현자 핸드오프(포맷: 아래 "핸드오프 포맷")
├── reviews/T-<n>-round<N>-<persona>.md
└── <name>/                ← 워크트리 (브랜치 <type>/<name>)
```

## 핸드오프 포맷 (경로로 전달, 본문 복붙 금지 — 구현 에이전트가 PR 생성 직후 작성)

```markdown
# Handoff T-<n>: <제목>
- branch: feature/<name>   worktree: .worktrees/<name>   pr: #<번호>
- status: ready-for-review | needs-fix | blocked
- changed: <파일 목록, --stat 기준>
- decisions: <구현 중 내린 판단 1~3줄; 아키텍처 영향 있으면 ADR 번호>
- not-done: <티켓 범위 중 못 한 것 + 이유>
- verify: <리뷰어/오케스트레이터가 확인할 명령 1~3개>
- risks: <알려진 리스크>
```
리뷰 라운드마다 `## Round N 반영` 절을 append. 리뷰어는 리뷰 전에 `decisions:`·`not-done:`을 먼저 읽는다.

## 규칙
1. 워크트리 생성·삭제는 `bash scripts/wt.sh` 로만(직접 `git worktree add` 금지 — 보드 갱신과 경로 규칙을 스크립트가 보장).
2. 항상 `/home/user/Tasky`(메인 트리)에서 `wt.sh` 실행. 워크트리 안에서 또 워크트리 생성 금지.
3. `<name>` = 브랜치명에서 `type/` 제거. 한 브랜치 = 한 워크트리. 머지 후 즉시 `wt.sh rm`.
4. `BOARD.md`의 `status` 열은 `wt.sh`(`new`/`rm`)가 자동 갱신한다. 그 외 열(id/title/owns/pr/round)은 오케스트레이터만 손으로 고친다. 구현자는 티켓·핸드오프에만 쓴다. 리뷰어는 `reviews/`에만 쓴다.
5. 다른 워크트리(`.worktrees/<other>/`)의 파일을 읽거나 수정하지 않는다(락 규칙). 상대 작업 내용이 필요하면 `handoffs/`를 읽는다.
6. 이 디렉토리의 로컬 파일은 백업되지 않는다. 결정·근거는 PR 본문 또는 ADR로 옮겨야 영속된다.
7. BOARD 초기 내용이 없으면 `wt.sh`가 헤더를 만든다. 티켓 번호는 BOARD 마지막 +1.

## 검증
```bash
bash scripts/wt.sh list
git worktree list
```

## 자주 하는 실수
- 메인 트리에서 그냥 `git checkout -b` 로 작업 시작 → 병렬 편집 충돌. 반드시 워크트리.
- 워크트리 안에서 `pnpm install` 생략 → `node_modules` 없음. `wt.sh new`가 실행하지만 실패 시 수동 실행.
