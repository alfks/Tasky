#!/usr/bin/env bash
# 읽기 조건: 이 스크립트가 실패했을 때, 또는 워크트리 규칙을 바꿀 때.
# 사용법:
#   bash scripts/wt.sh new <type>/<name> [--existing]   워크트리 + 브랜치 생성 → .worktrees/<name>  (origin/main 기준)
#   bash scripts/wt.sh rm <name> [--force]              머지 후 워크트리 · 로컬/원격 브랜치 정리 + BOARD 갱신
#   bash scripts/wt.sh list                             워크트리 목록 + BOARD
#   bash scripts/wt.sh init                             .worktrees/ 하위 디렉토리 · BOARD 헤더 생성 (setup.sh 가 호출)
# 항상 메인 워킹트리(/home/user/Tasky)에서 실행한다. 워크트리 안에서는 거부한다.
set -euo pipefail

usage() { sed -n '3,8p' "$0"; }

ROOT="$(git rev-parse --show-toplevel)"
if [ -f "$ROOT/.git" ]; then
  MAIN_ROOT="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
  echo "ERROR: 워크트리 안에서 실행할 수 없습니다. 메인 트리에서 실행하세요:  cd $MAIN_ROOT"
  exit 1
fi
cd "$ROOT"
WT_DIR="$ROOT/.worktrees"
BOARD="$WT_DIR/BOARD.md"
BRANCH_RE='^(feature|fix|refactor|docs|chore|test)/[a-z0-9]+(-[a-z0-9]+)*$'

ensure_board() {
  mkdir -p "$WT_DIR/tickets" "$WT_DIR/handoffs" "$WT_DIR/reviews"
  if [ ! -f "$BOARD" ]; then
    cat > "$BOARD" <<'BOARD_HEADER'
<!-- 로컬 작업 보드. 오케스트레이터만 수정. 커밋되지 않음. 포맷: docs/conventions/agent-collaboration.md §2 -->
# BOARD

| id | title | branch | owner(model) | status | owns | pr | round |
|----|-------|--------|--------------|--------|------|----|-------|
BOARD_HEADER
  fi
}

set_status() { # $1 branch, $2 status  (브랜치명은 BRANCH_RE 로 검증된 문자만 포함)
  local branch="$1" status="$2"
  ensure_board
  if grep -qE "^\|[^|]*\|[^|]*\|[[:space:]]*${branch}[[:space:]]*\|" "$BOARD"; then
    sed -E "s#^(\|[^|]*\|[^|]*\|[[:space:]]*${branch}[[:space:]]*\|[^|]*\|)[^|]*\|#\1 ${status} |#" "$BOARD" > "$BOARD.tmp" && mv "$BOARD.tmp" "$BOARD"
  else
    printf '| T-? | (티켓 미등록 — 오케스트레이터가 채울 것) | %s | ? | %s | ? | - | 0 |\n' "$branch" "$status" >> "$BOARD"
  fi
}

cmd_new() {
  local branch="${1:-}" flag="${2:-}"
  [ -n "$branch" ] || { usage; exit 1; }
  printf '%s' "$branch" | grep -qE "$BRANCH_RE" || {
    echo "ERROR: 브랜치명 규칙 위반 '$branch' → <type>/<kebab-name>, type ∈ feature|fix|refactor|docs|chore|test (에이전트 이름 브랜치 금지)"; exit 1; }
  local name="${branch#*/}" dir="$WT_DIR/${branch#*/}"
  [ ! -e "$dir" ] || { echo "ERROR: $dir 이미 존재. 먼저:  bash scripts/wt.sh rm $name"; exit 1; }
  ensure_board
  git fetch origin main --quiet 2>/dev/null || echo "WARN: origin fetch 실패(오프라인?) — 로컬 main 기준으로 진행"
  local base="main"
  git rev-parse --verify -q origin/main >/dev/null 2>&1 && base="origin/main"
  if [ "$flag" = "--existing" ]; then
    git rev-parse --verify -q "$branch" >/dev/null 2>&1 || git fetch origin "$branch:$branch"
    git worktree add "$dir" "$branch"
  else
    if git rev-parse --verify -q "$branch" >/dev/null 2>&1; then
      echo "ERROR: 브랜치 '$branch' 가 이미 있습니다. 이어서 하려면:  bash scripts/wt.sh new $branch --existing"; exit 1; fi
    git worktree add -b "$branch" "$dir" "$base"
  fi
  if [ -f "$dir/package.json" ] && command -v pnpm >/dev/null 2>&1; then
    (cd "$dir" && pnpm install --prefer-offline --silent) || echo "WARN: pnpm install 실패 — 워크트리에서 수동 실행: pnpm install"
  fi
  set_status "$branch" "in-progress"
  cat <<NEXT
OK 워크트리 생성: $dir   (branch: $branch, base: $base)
다음:
  cd $dir
  # 티켓: $WT_DIR/tickets/T-<n>.md   핸드오프: $WT_DIR/handoffs/T-<n>.md
  # 완료: pnpm check && git push -u origin $branch && gh pr create --base main
NEXT
}

cmd_rm() {
  local name="${1:-}" flag="${2:-}"
  [ -n "$name" ] || { usage; exit 1; }
  local dir="$WT_DIR/$name" branch
  branch="$(git worktree list --porcelain | awk -v d="$dir" '$1=="worktree"{w=$2} $1=="branch" && w==d {sub("refs/heads/","",$2); print $2}')"
  [ -n "$branch" ] || { echo "ERROR: $dir 에 해당하는 워크트리가 없습니다. 확인:  git worktree list"; exit 1; }
  if [ "$flag" != "--force" ]; then
    if command -v gh >/dev/null 2>&1; then
      merged="$(gh pr list --head "$branch" --state merged --json number --jq 'length' 2>/dev/null || echo "?")"
      if [ "$merged" = "0" ]; then
        echo "ERROR: '$branch' 의 머지된 PR을 찾지 못했습니다. 머지 전 삭제는 작업 유실 위험 → 정말 삭제하려면 --force"; exit 1; fi
    else
      echo "WARN: gh 미설치 — 머지 여부를 확인하지 못했습니다. 계속합니다."
    fi
    git worktree remove "$dir" || { echo "ERROR: 미커밋 변경이 있습니다. 확인 후:  bash scripts/wt.sh rm $name --force"; exit 1; }
  else
    git worktree remove --force "$dir"
  fi
  git branch -D "$branch" >/dev/null 2>&1 || true
  git push origin --delete "$branch" >/dev/null 2>&1 || true
  git worktree prune
  set_status "$branch" "done"
  echo "OK 정리 완료: $dir 제거, 브랜치 '$branch' 로컬·원격 삭제, BOARD → done"
}

cmd_list() {
  git worktree list
  echo
  if [ -f "$BOARD" ]; then cat "$BOARD"; else echo "(BOARD 없음 — bash scripts/wt.sh init)"; fi
}

case "${1:-}" in
  new)  shift; cmd_new "$@" ;;
  rm)   shift; cmd_rm "$@" ;;
  list) cmd_list ;;
  init) ensure_board; echo "OK: $WT_DIR 준비됨" ;;
  *)    usage; exit 1 ;;
esac
