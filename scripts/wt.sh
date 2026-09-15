#!/usr/bin/env bash
# 읽기 조건: 이 스크립트가 실패했을 때, 또는 워크트리 규칙을 바꿀 때.
# 사용법:
#   bash scripts/wt.sh new <type>/<name> [--existing]   워크트리 + 브랜치 생성 → .worktrees/<name>  (origin/main 기준)
#   bash scripts/wt.sh rm  <name>|<type>/<name> [--force]
#                                                        워크트리 · 로컬/원격 브랜치 정리 + BOARD 갱신
#                                                        기본: git만으로 머지 여부 판정(squash 포함) 후에만 삭제.
#                                                        판정 불가/미확정이면 거부 — 정말 지우려면 --force.
#   bash scripts/wt.sh list                             워크트리 목록 + BOARD
#   bash scripts/wt.sh init                             .worktrees/ 하위 디렉토리 · BOARD 헤더 생성 (setup.sh 가 호출)
# 예시: bash scripts/wt.sh new feature/category-color-picker
#       bash scripts/wt.sh rm category-color-picker        (또는 feature/category-color-picker — 둘 다 허용)
# 항상 메인 워킹트리(/home/user/Tasky)에서 실행한다. 워크트리 안에서는 거부한다.
set -euo pipefail

usage() { sed -n '3,12p' "$0"; }

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

# --- BOARD.md 락: flock 있으면 flock, 없으면 mkdir 스핀락(POSIX, 외부 도구 불필요) ---
_board_lock_dir="$WT_DIR/.board.lock.d"
_board_lock_fd=""
board_lock_acquire() {
  mkdir -p "$WT_DIR"
  if command -v flock >/dev/null 2>&1; then
    exec 9>"$WT_DIR/.board.flock"
    flock -w 20 9 || { echo "ERROR: BOARD 락 획득 실패(20초 대기, flock)"; exit 1; }
    _board_lock_fd=9
  else
    local tries=0
    until mkdir "$_board_lock_dir" 2>/dev/null; do
      tries=$((tries + 1))
      [ "$tries" -le 200 ] || { echo "ERROR: BOARD 락 획득 실패(20초 대기, mkdir 락) — 고아 락이면 삭제: rmdir $_board_lock_dir"; exit 1; }
      sleep 0.1
    done
  fi
}
board_lock_release() {
  if [ -n "$_board_lock_fd" ]; then
    flock -u "$_board_lock_fd" 2>/dev/null || true
    exec 9>&- 2>/dev/null || true
    _board_lock_fd=""
  fi
  rmdir "$_board_lock_dir" 2>/dev/null || true
}
# 정상 종료·에러 종료 어느 쪽이든 락을 반드시 반납한다(들고 있지 않으면 조용히 no-op).
trap board_lock_release EXIT

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
  board_lock_acquire
  ensure_board
  local tmp="$BOARD.$$.$RANDOM.tmp"
  if grep -qE "^\|[^|]*\|[^|]*\|[[:space:]]*${branch}[[:space:]]*\|" "$BOARD"; then
    sed -E "s#^(\|[^|]*\|[^|]*\|[[:space:]]*${branch}[[:space:]]*\|[^|]*\|)[^|]*\|#\1 ${status} |#" "$BOARD" > "$tmp"
  else
    cp "$BOARD" "$tmp"
    printf '| T-? | (티켓 미등록 — 오케스트레이터가 채울 것) | %s | ? | %s | ? | - | 0 |\n' "$branch" "$status" >> "$tmp"
  fi
  mv "$tmp" "$BOARD"
  board_lock_release
}

# 브랜치가 $target(예: origin/main)에 이미 반영됐는지 git만으로 판정한다.
# 일반 머지(fast-forward/3-way)와 squash 머지를 모두 잡는다:
#  1) 조상 관계면 즉시 merged(일반 머지)
#  2) 브랜치 트리 == merge-base 트리면 변경 없음 → merged
#  3) 그 외에는 "브랜치를 merge-base 위에 얹은 가상 스쿼시 커밋"을 만들어
#     `git cherry`(patch-id 비교)로 그 변경이 $target 히스토리에 이미 있는지 확인 (squash 머지 포착)
# 반환: 0=merged, 1=merged 아님, 2=판정 불가(merge-base 없음 등)
is_branch_merged() {
  local branch="$1" target="$2" merge_base tree base_tree squash_commit
  merge_base="$(git merge-base "$target" "$branch" 2>/dev/null)" || return 2
  git merge-base --is-ancestor "$branch" "$target" 2>/dev/null && return 0
  tree="$(git rev-parse "${branch}^{tree}" 2>/dev/null)" || return 2
  base_tree="$(git rev-parse "${merge_base}^{tree}" 2>/dev/null)" || return 2
  [ "$tree" = "$base_tree" ] && return 0
  squash_commit="$(git commit-tree "$tree" -p "$merge_base" -m "_wt-squash-check_" 2>/dev/null)" || return 2
  # git cherry 는 각 커밋을 '-'(이미 target에 있음/patch-id 일치) 또는 '+'(없음)로 나열한다.
  # 출력이 비어있는 게 아니라 '+' 로 시작하는 줄이 하나도 없어야 merged.
  if ! git cherry "$target" "$squash_commit" 2>/dev/null | grep -q '^+'; then
    return 0
  fi
  return 1
}

cmd_new() {
  local branch="${1:-}" flag="${2:-}"
  [ -n "$branch" ] || { usage; exit 1; }
  printf '%s' "$branch" | grep -qE "$BRANCH_RE" || {
    echo "ERROR: 브랜치명 규칙 위반 '$branch' → <type>/<kebab-name>, type ∈ feature|fix|refactor|docs|chore|test (에이전트 이름 브랜치 금지)"; exit 1; }
  local name="${branch#*/}" dir="$WT_DIR/${branch#*/}"
  if [ -e "$dir" ]; then
    local occupant
    occupant="$(git worktree list --porcelain | awk -v d="$dir" '$1=="worktree"{w=$2} $1=="branch" && w==d {sub("refs/heads/","",$2); print $2}')"
    echo "ERROR: $dir 를 이미 '${occupant:-알 수 없음}' 이 쓰고 있습니다."
    echo "  그 작업이 끝났다면:  bash scripts/wt.sh rm $name"
    echo "  아니라면 브랜치 이름을 다르게 지으세요(디렉토리명은 type을 뺀 <name> 이므로 name이 겹치면 충돌합니다)."
    exit 1
  fi
  ensure_board
  git fetch origin main --quiet 2>/dev/null || echo "WARN: origin fetch 실패(오프라인?) — 로컬 main 기준으로 진행"
  local base="main"
  git rev-parse --verify -q origin/main >/dev/null 2>&1 && base="origin/main"
  if [ "$flag" = "--existing" ]; then
    git rev-parse --verify -q "$branch" >/dev/null 2>&1 || git fetch origin "$branch:$branch"
    git worktree add --no-track "$dir" "$branch"
  else
    if git rev-parse --verify -q "$branch" >/dev/null 2>&1; then
      echo "ERROR: 브랜치 '$branch' 가 이미 있습니다. 이어서 하려면:  bash scripts/wt.sh new $branch --existing"; exit 1; fi
    # --no-track: start-point가 origin/main 이라도 upstream을 origin/main 으로 잡지 않는다.
    # (안 그러면 push --force-with-lease 가 실패하고 git이 push origin HEAD:main 을 제안한다 — 위험)
    # 최초 push는 push.autoSetupRemote=true(setup.sh) 가 올바른 원격 브랜치를 자동 생성한다.
    git worktree add --no-track -b "$branch" "$dir" "$base"
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
  # 완료: bash scripts/check.sh && git push -u origin $branch && gh pr create --base main
NEXT
}

cmd_rm() {
  local name="${1:-}" flag="${2:-}"
  [ -n "$name" ] || { usage; exit 1; }
  # new 는 <type>/<name> 을, rm 은 관례상 <name> 을 받지만 <type>/<name> 을 그대로 넣어도 되게 한다.
  local dir="$WT_DIR/${name#*/}" branch
  branch="$(git worktree list --porcelain | awk -v d="$dir" '$1=="worktree"{w=$2} $1=="branch" && w==d {sub("refs/heads/","",$2); print $2}')"
  [ -n "$branch" ] || { echo "ERROR: $dir 에 해당하는 워크트리가 없습니다. 확인:  git worktree list"; exit 1; }

  local target="main"
  git fetch origin main --quiet 2>/dev/null || true
  git rev-parse --verify -q origin/main >/dev/null 2>&1 && target="origin/main"

  if [ "$flag" != "--force" ]; then
    local rc=0
    is_branch_merged "$branch" "$target" || rc=$?
    if [ "$rc" -ne 0 ]; then
      local why="'$target' 에 머지되지 않았습니다"
      [ "$rc" -eq 2 ] && why="머지 여부를 git만으로 판정할 수 없습니다(공통 조상 없음 등)"
      echo "ERROR: '$branch' 가 $why. 삭제 시 작업 유실 위험이 있어 기본은 거부합니다."
      echo "  머지된 것이 확실하면:  bash scripts/wt.sh rm $name --force"
      echo "  판정 근거를 직접 확인:  git log --oneline $target | grep -i \"\$(git log -1 --format=%s $branch)\""
      exit 1
    fi
  fi

  local tip
  tip="$(git rev-parse "$branch")"
  if [ "$flag" = "--force" ]; then
    git worktree remove --force "$dir"
  else
    git worktree remove "$dir" || { echo "ERROR: 미커밋 변경이 있습니다. 확인 후:  bash scripts/wt.sh rm $name --force"; exit 1; }
  fi
  git branch -D "$branch" >/dev/null 2>&1 || true
  # 여기까지 왔다는 건 위에서 이미 merged 로 판정됐거나 --force 였다는 뜻 — 원격도 같은 기준으로 삭제.
  git push origin --delete "$branch" >/dev/null 2>&1 || true
  git worktree prune
  set_status "$branch" "done"
  echo "OK 정리 완료: $dir 제거, 브랜치 '$branch' 로컬·원격 삭제, BOARD → done"
  echo "   되돌리기(로컬 reflog 만료 전):  git branch $branch $tip"
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
