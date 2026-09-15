<!-- 읽기 조건: 워크트리를 만들거나, 커밋/PR을 만들거나, 충돌을 해결하거나, 머지할 때. 코드만 읽는 세션에서는 읽지 않는다. -->

# Git 워크플로

## 1. 브랜치 전략

- `main`: 보호 브랜치. 직접 push 금지, PR + CI 통과 + squash merge만.
- 작업 브랜치: `<type>/<kebab-case-name>` — `type ∈ feature | fix | refactor | docs | chore | test`.
  - 좋음: `feature/date-strip`, `fix/todo-toggle-race`, `docs/adr-0005-sync`, `chore/deps-dexie`
  - 금지: `claude/...`, `opus/...`, `sonnet/...`, `wip`, `test1`, 한글 브랜치명, 티켓 번호만(`T-12`)
- 브랜치 수명: 1 티켓 = 1 브랜치 = 1 워크트리 = 1 PR. 머지 후 즉시 삭제.
- 장기 브랜치(Phase 2 `sync`)가 필요하면 ADR로 결정.

### 1.1 레포 최초 1회 수동 설정 (사람이 GitHub UI/`gh`로, 코드로 강제 불가)

`main` 보호는 레포 설정이라 코드로 표현할 수 없다. 아래를 1회 설정할 것(`gh api -X PUT repos/:owner/:repo/branches/main/protection …` 또는 Settings → Branches):
- [ ] PR 없이 직접 push 금지
- [ ] 필수 상태 체크: `guard`, `build` (워크플로 잡 이름과 정확히 일치)
- [ ] 리니어 히스토리(merge 커밋 금지)
- [ ] squash merge만 허용(merge commit·rebase merge 비활성화)
- [ ] 머지 후 head 브랜치 자동 삭제
- [ ] force push 금지(관리자 포함)

미설정 상태에서는 위 어느 것도 보장되지 않는다 — CI 빨간 PR이 머지되거나 `main`에 직접 push될 수 있음. 확인: `gh api repos/:owner/:repo/branches/main/protection`.

## 2. 커밋 컨벤션 (Conventional Commits, 본문 한국어)

```
<type>(<scope>): <제목: 한국어, 50자 이내, 마침표 없음>

<본문(선택): 무엇을 왜 바꿨는지 한국어로. 어떻게는 diff가 말한다.>

Refs: T-<n>  (선택. 이슈가 있으면 Closes #<n>)
```

- `type`: `feat | fix | refactor | docs | chore | test | style | perf | ci`
- `scope`: 디렉토리 또는 기능명 영문 (`todo`, `category`, `date-strip`, `theme`, `infra`, `domain`, `docs`, `collab`, `deps`)
- 예: `feat(todo): 날짜별 투두 목록 조회 레포지토리 메서드 추가`
- **금지 트레일러**: `Co-Authored-By: Claude …`, `Generated with Claude Code`, `Claude-Session: …`, 어떤 AI 도구 서명도 금지. `commit-msg` 훅이 거부한다.
- 커밋 단위: 논리적 변경 1개. "WIP" 커밋은 PR 전에 `git rebase -i`가 불가능한 환경이면 `git reset --soft main && git commit`으로 스쿼시.

### author 강제

```bash
# 최초 1회(레포 로컬 config — 모든 워크트리가 공유)
git config user.name  "alfks"
git config user.email "millie020524@gmail.com"
# 또는 한 번에
bash scripts/setup.sh

# config를 못 건드리는 상황이면 커밋마다
git -c user.name=alfks -c user.email=millie020524@gmail.com commit -m "..."

# 검증
git log --format='%an <%ae>' main..HEAD | sort -u     # 한 줄: alfks <millie020524@gmail.com>
bash scripts/check-author.sh main
```

잘못된 author로 이미 커밋했다면(본인 브랜치, 아직 머지 전):
```bash
git rebase main --exec 'git commit --amend --no-edit --author="alfks <millie020524@gmail.com>"'
git push --force-with-lease
```

## 3. 워크트리 사용법 (병렬 작업 필수)

원칙: **모든 워크트리는 `/home/user/Tasky/.worktrees/<name>/`**. 메인 워킹트리는 오케스트레이터가 `main` 상태 확인용으로만 사용.

### 생성
```bash
cd /home/user/Tasky
git fetch origin main
bash scripts/wt.sh new feature/date-strip
# 내부적으로:
#   git worktree add -b feature/date-strip .worktrees/date-strip origin/main
#   (cd .worktrees/date-strip && pnpm install --prefer-offline)   # package.json 있을 때만
#   .worktrees/BOARD.md에 행 추가
cd /home/user/Tasky/.worktrees/date-strip
```
- `<name>`은 브랜치명에서 `type/`을 뺀 부분. 같은 이름 워크트리가 있으면 실패(재사용 금지, 정리 후 재생성).
- 기존 브랜치를 이어받을 때: `bash scripts/wt.sh new feature/date-strip --existing`.

### 작업 중
```bash
git status --short                 # owns: 밖 파일이 보이면 즉시 되돌림
pnpm check                          # lint + typecheck + test (스캐폴딩 전: bash scripts/check.sh)
git add <파일…>                     # git add -A 금지 (소유권 밖 파일 방지)
git commit -m "feat(date-strip): 주 단위 날짜 스트립 컴포넌트 추가"
git push -u origin feature/date-strip
```

### main 동기화 (merge 커밋 금지)
```bash
git fetch origin main
git rebase origin/main
# 충돌 시 §5 → git add <해결 파일> && git rebase --continue
pnpm check                          # 스캐폴딩 전: bash scripts/check.sh
git push --force-with-lease
```

### 정리 (머지 후, 오케스트레이터)
```bash
cd /home/user/Tasky
bash scripts/wt.sh rm date-strip
# 내부적으로:
#   git worktree remove .worktrees/date-strip
#   git branch -D feature/date-strip
#   git push origin --delete feature/date-strip   (원격에 남아 있으면)
#   git worktree prune
#   BOARD.md 상태 done
```

### 자주 나는 문제
| 증상 | 조치 |
|------|------|
| `fatal: '<branch>' is already checked out at …` | 같은 브랜치를 두 워크트리에서 못 씀. `bash scripts/wt.sh list`로 찾아 정리 |
| 워크트리 안에서 `.worktrees/`가 또 보임 | 정상(`AGENTS.md`만 트래킹). 중첩 생성 금지 — 항상 `/home/user/Tasky`에서 `wt.sh` 실행 |
| `pnpm install`이 느림 | `pnpm install --prefer-offline` (store 공유). 그래도 느리면 `pnpm store status` |
| 훅이 안 돎 | `git config core.hooksPath` → `.githooks` 여야 함. `bash scripts/setup.sh` 재실행 |

## 4. PR 라이프사이클

1. **생성**: `gh pr create --base main --fill` 후 템플릿(`.github/pull_request_template.md`) 전 섹션 채움. 제목 = 대표 커밋 제목 형식. 라벨: `type:<type>` + `area:<scope>` + `review:round-1`.
2. **CI**: `guard`(금지어·author·AGENTS.md) + `build`(lint·typecheck·test·build) 모두 녹색이어야 리뷰 시작.
3. **리뷰 라운드**: 리뷰어는 PR 코멘트가 아니라 **핸드오프 채널(오케스트레이터에게 보고)** 로 결과를 낸다. 오케스트레이터가 집계 결과를 PR 코멘트 1개로 남긴다(라운드별 1개).
4. **수정**: 같은 브랜치에 커밋 추가(`fix(review): …` 또는 원 type). 리뷰 반영 커밋은 스쿼시 머지 시 사라지므로 개수 제한 없음.
5. **머지**: 조건 — CI 녹색, `status:ready-to-merge` 라벨, 리뷰 종료 기준 충족, `main`과 충돌 없음(리베이스 완료).
   ```bash
   gh pr merge <번호> --squash --delete-branch
   ```
   squash 커밋 메시지 = PR 제목 + 본문 요약(한국어). GitHub가 붙이는 `Co-authored-by`가 있으면 **제거**(모든 커밋이 alfks면 생기지 않음).
6. **사후**: `bash scripts/wt.sh rm <name>`, BOARD 갱신, 후속 티켓 발행.

PR 크기: diff 300줄 초과면 오케스트레이터가 분할을 검토. 스캐폴딩·설정 PR은 예외(라벨 `size:large` 명시).

## 5. 충돌 해결 규칙

1. 충돌은 **항상 작업 브랜치 쪽에서 리베이스로** 해결. `main`에 merge 커밋 금지, `git merge main` 금지.
2. 해결 순서: `git status`로 파일 확인 → 각 파일 열어 `<<<<<<<` 블록만 범위 Read → 의도 확인(상대 티켓의 핸드오프 문서를 읽는다) → 해결 → `pnpm check`.
3. **상대 변경을 지우지 않는다.** 둘 다 필요하면 둘 다 살린다. 판단이 안 서면 오케스트레이터에게 두 티켓 번호와 파일명을 보고하고 중단.
4. `pnpm-lock.yaml` 충돌: 수동 편집 금지. `git checkout --theirs pnpm-lock.yaml`(= main 쪽) 후 `pnpm install`로 재생성.
5. 생성 파일(`.next/`, `coverage/`)이 충돌 목록에 있으면 .gitignore 누락 — `chore` 티켓으로 처리.
6. 리베이스 후 push는 `--force-with-lease`만. `--force` 금지. 타인 브랜치 force-push 금지.
7. 같은 파일을 두 티켓이 동시에 수정하게 된 상황 자체가 락 규칙 위반 — 오케스트레이터가 BOARD를 수정하고 재발 방지.

## 6. 태그/릴리스 (MVP 이후)

- `v0.<minor>.<patch>` 태그, `chore(release): v0.1.0`. GitHub Release 노트는 PR 제목 목록으로 생성. 지금은 규칙만 정의.
