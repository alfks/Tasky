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
# mkdir 폴백은 락 디렉토리 안에 보유자 PID를 적어 두고, 반납은 "자기가 잡은 락"일 때만 한다
# (그래야 락 획득에 실패한 프로세스가 EXIT trap 에서 남의 락을 rmdir 하지 않는다).
# 대기 중 보유자 PID가 죽은 것을 확인하면(stale lock) 즉시 회수해 무한 대기를 피한다.
_board_lock_dir="$WT_DIR/.board.lock.d"
_board_lock_fd=""
_board_lock_held=""
board_lock_acquire() {
  mkdir -p "$WT_DIR"
  if command -v flock >/dev/null 2>&1; then
    exec 9>"$WT_DIR/.board.flock"
    flock -w 20 9 || { echo "ERROR: BOARD 락 획득 실패(20초 대기, flock)"; exit 1; }
    _board_lock_fd=9
    _board_lock_held=flock
  else
    local tries=0
    until mkdir "$_board_lock_dir" 2>/dev/null; do
      if [ -f "$_board_lock_dir/pid" ]; then
        local holder_pid
        holder_pid="$(cat "$_board_lock_dir/pid" 2>/dev/null || true)"
        if [ -n "$holder_pid" ] && ! kill -0 "$holder_pid" 2>/dev/null; then
          echo "WARN: BOARD 락 보유자(PID $holder_pid)가 죽어 있어 stale lock 을 회수합니다." >&2
          rm -rf "$_board_lock_dir" 2>/dev/null || true
          continue
        fi
      fi
      tries=$((tries + 1))
      [ "$tries" -le 200 ] || {
        echo "ERROR: BOARD 락 획득 실패(20초 대기, mkdir 락, 보유자 PID $(cat "$_board_lock_dir/pid" 2>/dev/null || echo '알 수 없음') 살아있음)"
        echo "  살아있는데도 실제로는 멈춰 있다면 수동 확인 후:  rm -rf $_board_lock_dir"
        exit 1
      }
      sleep 0.1
    done
    echo "$$" > "$_board_lock_dir/pid" 2>/dev/null || true
    _board_lock_held=mkdir
  fi
}
board_lock_release() {
  # 이 프로세스가 실제로 획득한 락만 반납한다 — 획득에 실패했거나 아직 시도하지 않은 경우는 no-op.
  [ -n "$_board_lock_held" ] || return 0
  if [ "$_board_lock_held" = flock ]; then
    flock -u "$_board_lock_fd" 2>/dev/null || true
    exec 9>&- 2>/dev/null || true
  else
    rm -rf "$_board_lock_dir" 2>/dev/null || true
  fi
  _board_lock_held=""
  _board_lock_fd=""
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
#  2) 브랜치 트리 == merge-base 트리이고 그 사이 커밋이 0개면(즉 branch == merge_base) merged
#     (커밋이 있는데 트리만 우연히 같아진 경우 — 빈 커밋, 되돌린 뒤 원상복구 등 — 는 3 으로 넘겨
#      "변경은 없지만 히스토리가 있다"를 merged 와 구분한다. 조상 관계였다면 이미 1에서 잡혔을 것이다)
#  3) 그 외에는 "브랜치를 merge-base 위에 얹은 가상 스쿼시 커밋"을 만들어
#     `git cherry`(patch-id 비교)로 그 변경이 $target 히스토리에 이미 있는지 확인 (squash 머지 포착)
# 반환: 0=merged, 1=merged 아님, 2=판정 불가(merge-base 없음 등, fail-closed), 3=변경 없음이지만 커밋 존재(fail-closed)
is_branch_merged() {
  local branch="$1" target="$2" merge_base tree base_tree squash_commit commit_count cherry
  merge_base="$(git merge-base "$target" "$branch" 2>/dev/null)" || return 2
  git merge-base --is-ancestor "$branch" "$target" 2>/dev/null && return 0
  tree="$(git rev-parse "${branch}^{tree}" 2>/dev/null)" || return 2
  base_tree="$(git rev-parse "${merge_base}^{tree}" 2>/dev/null)" || return 2
  if [ "$tree" = "$base_tree" ]; then
    commit_count="$(git rev-list --count "${merge_base}..${branch}" 2>/dev/null)" || return 2
    [ "$commit_count" -eq 0 ] && return 0
    return 3
  fi
  squash_commit="$(git commit-tree "$tree" -p "$merge_base" -m "_wt-squash-check_" 2>/dev/null)" || return 2
  # git cherry 는 각 커밋을 '-'(이미 target에 있음/patch-id 일치) 또는 '+'(없음)로 나열한다.
  # squash_commit 은 언제나 1개이므로 정상 출력은 정확히 한 줄('-' 또는 '+')이어야 한다.
  # git cherry 자체가 실패하거나 출력이 비면 판정 불가로 취급한다(fail-closed) — 침묵해서
  # "+ 가 없으니 merged" 로 새는 쪽(fail-open)은 라운드 1 Blocker 와 같은 유형의 손실을 부른다.
  cherry="$(git cherry "$target" "$squash_commit" 2>/dev/null)" || return 2
  [ -n "$cherry" ] || return 2
  case "$cherry" in
    +*) return 1 ;;
    *)  return 0 ;;
  esac
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
    # --existing 은 브랜치를 새로 만들지 않으므로 --no-track 을 쓸 수 없다(git이 거부: "can only be
    # used if a new branch is created"). 기존 브랜치의 upstream 은 이미 정해져 있으니 그대로 둔다 —
    # 로컬에 없어 방금 fetch 로 받아온 경우도 `git fetch origin branch:branch` 는 upstream 을
    # 설정하지 않으므로(clone/pull과 달리) origin/main 으로 잘못 잡힐 일이 없다.
    local fetched=0
    if ! git rev-parse --verify -q "$branch" >/dev/null 2>&1; then
      git fetch origin "$branch:$branch" || { echo "ERROR: origin 에 '$branch' 브랜치가 없습니다."; exit 1; }
      fetched=1
    fi
    git worktree add "$dir" "$branch" || {
      [ "$fetched" = 1 ] && git branch -D "$branch" >/dev/null 2>&1
      echo "ERROR: 워크트리 생성 실패 — 위 git 메시지를 확인하고 다시 시도하세요(반쪽 상태를 남기지 않도록 정리했습니다)."
      exit 1
    }
  else
    if git rev-parse --verify -q "$branch" >/dev/null 2>&1; then
      echo "ERROR: 브랜치 '$branch' 가 이미 있습니다. 이어서 하려면:  bash scripts/wt.sh new $branch --existing"; exit 1; fi
    # --no-track: start-point가 origin/main 이라도 upstream을 origin/main 으로 잡지 않는다.
    # (안 그러면 push --force-with-lease 가 실패하고 git이 push origin HEAD:main 을 제안한다 — 위험)
    # 최초 push는 push.autoSetupRemote=true(setup.sh) 가 올바른 원격 브랜치를 자동 생성한다.
    # (이 경로만 새 브랜치를 만드므로 --no-track 이 유효하다 — --existing 경로에는 절대 붙이지 않는다.)
    git worktree add --no-track -b "$branch" "$dir" "$base" || {
      git branch -D "$branch" >/dev/null 2>&1
      echo "ERROR: 워크트리 생성 실패 — 위 git 메시지를 확인하고 다시 시도하세요(반쪽 상태를 남기지 않도록 정리했습니다)."
      exit 1
    }
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
      [ "$rc" -eq 3 ] && why="변경 내용은 '$target' 과 같지만 커밋 $(git rev-list --count "$target..$branch")개가 머지되지 않았습니다(되돌린 커밋·빈 커밋 등). 삭제하면 히스토리가 유실됩니다"
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
