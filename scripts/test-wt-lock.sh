#!/usr/bin/env bash
# 읽기 조건: wt.sh의 GNU mkdir 선택·fail-closed·동시 BOARD 락 계약을 바꿀 때.
# 격리 Git fixture에서 거짓 성공 mkdir과 실제 GNU mkdir의 경합을 결정적으로 구분한다.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/wt-lock.XXXXXX")"
REAL_CP="$(command -v cp)"
REAL_MKDIR="$(command -v mkdir)"
REAL_GNU_MKDIR=""
fail_count=0

cleanup() {
  local rc=$?
  if [ "$rc" -ne 0 ] || [ "$fail_count" -ne 0 ]; then
    echo "FAIL: lock fixture 보존: $TMP"
  else
    rm -rf "$TMP"
  fi
}
trap cleanup EXIT
bad() { echo "FAIL: $1" >&2; fail_count=$((fail_count + 1)); }

for tool in gnumkdir mkdir; do
  candidate="$(type -P "$tool" 2>/dev/null || true)"
  [ -n "$candidate" ] || continue
  version="$(LC_ALL=C "$candidate" --version 2>/dev/null)" || continue
  version="${version%%$'\n'*}"
  case "$version" in 'mkdir (GNU coreutils) '*) REAL_GNU_MKDIR="$candidate"; break ;; esac
done

make_fixture() {
  local name="$1" dir="$TMP/$1" work="$TMP/$1/work"
  mkdir -p "$work/scripts" || return 1
  git init --bare -q "$dir/origin.git" || return 1
  git -C "$dir/origin.git" symbolic-ref HEAD refs/heads/main || return 1
  git init -q -b main "$work" || return 1
  git -C "$work" config user.name alfks || return 1
  git -C "$work" config user.email millie020524@gmail.com || return 1
  git -C "$work" remote add origin "$dir/origin.git" || return 1
  cp "$ROOT/scripts/wt.sh" "$ROOT/scripts/wt-lock.sh" "$work/scripts/" || return 1
  printf 'lock fixture\n' > "$work/README.md"
  git -C "$work" add -A || return 1
  git -C "$work" commit -q -m 'chore(t): lock fixture' || return 1
  git -C "$work" push -q origin HEAD:main || return 1
  [ "$(git hash-object "$work/scripts/wt.sh")" = "$(git hash-object "$ROOT/scripts/wt.sh")" ] || return 1
  [ "$(git hash-object "$work/scripts/wt-lock.sh")" = "$(git hash-object "$ROOT/scripts/wt-lock.sh")" ]
}

make_shim() {
  local dir="$1" gnu="$2" shim="$1/noflock" bin path
  mkdir -p "$shim" || return 1
  for bin in bash env git mkdir rmdir rm mv cp cat sed awk grep printf wc tr kill sleep dirname basename chmod timeout; do
    path="$(command -v "$bin" 2>/dev/null || true)"
    [ -n "$path" ] && ln -sf "$path" "$shim/$bin"
  done
  rm "$shim/mkdir" "$shim/cp" || return 1
  cat > "$shim/mkdir" <<'FALSE_MKDIR'
#!/usr/bin/env bash
if [ "$#" -eq 1 ] && [ "$1" = --version ]; then
  echo 'mkdir (uutils coreutils) 0.8.0'
  exit 0
fi
"$WT_LOCK_REAL_MKDIR" "$@"
rc=$?
if [ "$#" -eq 1 ] && [ "$1" = "$WT_LOCK_DIR" ]; then
  printf 'called\n' >> "$WT_LOCK_FALSE_CALLS"
  [ "$rc" -eq 0 ] || exit 0
fi
exit "$rc"
FALSE_MKDIR
  cat > "$shim/cp" <<'PAUSE_CP'
#!/usr/bin/env bash
if [ "$WT_LOCK_ROLE" = B ] && [ "$#" -eq 2 ] && [ "$1" = "$WT_LOCK_BOARD" ]; then
  "$WT_LOCK_REAL_CP" "$@" || exit $?
  : > "$WT_LOCK_B_READY"
  tries=0
  until [ -f "$WT_LOCK_B_RELEASE" ]; do
    tries=$((tries + 1))
    [ "$tries" -le 200 ] || exit 124
    sleep 0.1
  done
  exit 0
fi
exec "$WT_LOCK_REAL_CP" "$@"
PAUSE_CP
  chmod +x "$shim/mkdir" "$shim/cp"
  [ "$gnu" = yes ] || return 0
  cat > "$shim/gnumkdir" <<'GNU_MKDIR'
#!/usr/bin/env bash
if [ "$WT_LOCK_ROLE" = A ] && [ "$#" -eq 1 ] && [ "$1" = "$WT_LOCK_DIR" ]; then
  [ -f "$WT_LOCK_A_BLOCKED" ] && exec "$WT_LOCK_REAL_GNU_MKDIR" "$@"
  LC_ALL=C "$WT_LOCK_REAL_GNU_MKDIR" "$@" 2> "$WT_LOCK_A_ERROR"
  rc=$?
  if [ "$rc" -eq 1 ] && grep -Fq 'File exists' "$WT_LOCK_A_ERROR"; then
    : > "$WT_LOCK_A_BLOCKED"
  fi
  exit "$rc"
fi
exec "$WT_LOCK_REAL_GNU_MKDIR" "$@"
GNU_MKDIR
  chmod +x "$shim/gnumkdir"
}

run_wt() {
  local dir="$1" role="$2" work="$TMP/$1/work"
  shift 2
  cd "$work" || return 1
  exec timeout --signal=TERM --kill-after=2s 40s env PATH="$TMP/$dir/noflock" \
    WT_LOCK_ROLE="$role" WT_LOCK_REAL_MKDIR="$REAL_MKDIR" \
    WT_LOCK_REAL_GNU_MKDIR="$REAL_GNU_MKDIR" WT_LOCK_REAL_CP="$REAL_CP" \
    WT_LOCK_DIR="$work/.worktrees/.board.lock.d" WT_LOCK_BOARD="$work/.worktrees/BOARD.md" \
    WT_LOCK_FALSE_CALLS="$TMP/$dir/false-calls" WT_LOCK_B_READY="$TMP/$dir/b-ready" \
    WT_LOCK_B_RELEASE="$TMP/$dir/b-release" WT_LOCK_A_BLOCKED="$TMP/$dir/a-blocked" \
    WT_LOCK_A_ERROR="$TMP/$dir/a-mkdir.err" \
    bash scripts/wt.sh "$@"
}

wait_marker() {
  local marker="$1" child="$2" tries
  for ((tries = 0; tries < 200; tries++)); do
    [ -f "$marker" ] && return 0
    kill -0 "$child" 2>/dev/null || return 1
    sleep 0.1
  done
  return 1
}

run_no_gnu() {
  local dir="$TMP/no-gnu" work="$TMP/no-gnu/work" rc board_hash
  make_fixture no-gnu && make_shim "$dir" no || { bad 'no-GNU fixture 생성 실패'; return; }
  if ( run_wt no-gnu N new feature/lock-no-gnu ) > "$dir/result.log" 2>&1; then rc=0; else rc=$?; fi
  [ "$rc" -eq 1 ] || bad "no-GNU new 종료 코드 $rc (기대 1)"
  grep -F 'GNU coreutils mkdir' "$dir/result.log" >/dev/null || bad 'no-GNU 진단 없음'
  [ ! -e "$work/.worktrees" ] || bad 'no-GNU 이후 .worktrees 생성됨'
  [ -z "$(git -C "$work" branch --list feature/lock-no-gnu)" ] || bad 'no-GNU 브랜치 생성됨'
  [ ! -f "$dir/false-calls" ] || bad 'no-GNU가 거짓 mkdir를 호출함'
  [ "$fail_count" -eq 0 ] || return
  ( cd "$work" && timeout --signal=TERM --kill-after=2s 40s bash scripts/wt.sh new feature/lock-keep ) > "$dir/seed.log" 2>&1 || { bad 'rm용 seed 실패'; return; }
  board_hash="$(git hash-object "$work/.worktrees/BOARD.md")"
  if ( run_wt no-gnu N rm lock-keep --force ) > "$dir/rm.log" 2>&1; then rc=0; else rc=$?; fi
  [ "$rc" -eq 1 ] || bad "no-GNU rm 종료 코드 $rc (기대 1)"
  grep -F 'GNU coreutils mkdir' "$dir/rm.log" >/dev/null || bad 'no-GNU rm 진단 없음'
  [ "$(git -C "$work/.worktrees/lock-keep" branch --show-current 2>/dev/null)" = feature/lock-keep ] || bad 'no-GNU rm이 worktree를 제거함'
  [ -n "$(git -C "$work" branch --list feature/lock-keep)" ] || bad 'no-GNU rm이 브랜치를 제거함'
  [ "$(git hash-object "$work/.worktrees/BOARD.md")" = "$board_hash" ] || bad 'no-GNU rm이 BOARD를 변경함'
  [ ! -e "$work/.worktrees/.board.lock.d" ] || bad 'no-GNU rm이 락을 생성함'
  [ ! -f "$dir/false-calls" ] || bad 'no-GNU rm이 거짓 mkdir를 호출함'
  [ "$fail_count" -ne 0 ] || echo 'OK: GNU 없음은 new·rm 변경 전 거부'
}

rows_for() {
  awk -F'|' -v b="$2" '$4 ~ "^[[:space:]]*" b "[[:space:]]*$" { n++ } END { print n+0 }' "$1/.worktrees/BOARD.md"
}

run_interleave() {
  local dir="$TMP/interleave" work="$TMP/interleave/work" bpid apid brc arc pid_hash
  make_fixture interleave && make_shim "$dir" yes || { bad 'interleave fixture 생성 실패'; return; }
  ( cd "$work" && timeout --signal=TERM --kill-after=2s 40s bash scripts/wt.sh new feature/lock-seed ) > "$dir/seed.log" 2>&1 || { bad 'seed 실패'; return; }
  ( run_wt interleave B new feature/lock-b ) > "$dir/b.log" 2>&1 & bpid=$!
  if ! wait_marker "$dir/b-ready" "$bpid"; then
    bad 'B의 BOARD 복사 barrier 미도달'; : > "$dir/b-release"; wait "$bpid" || true
    return
  fi
  [ -f "$work/.worktrees/.board.lock.d/pid" ] || bad 'B pause 때 PID 없음'
  pid_hash="$(git hash-object "$work/.worktrees/.board.lock.d/pid" 2>/dev/null || true)"
  ( run_wt interleave A new feature/lock-a ) > "$dir/a.log" 2>&1 & apid=$!
  if ! wait_marker "$dir/a-blocked" "$apid"; then
    bad 'A의 GNU EEXIST 관측 실패'; : > "$dir/b-release"
    wait "$bpid" || true; wait "$apid" || true; return
  fi
  [ "$(git hash-object "$work/.worktrees/.board.lock.d/pid" 2>/dev/null)" = "$pid_hash" ] || bad 'A가 B의 PID를 변경함'
  grep -F 'File exists' "$dir/a-mkdir.err" >/dev/null || bad 'A의 GNU EEXIST 원문 없음'
  [ "$(rows_for "$work" feature/lock-b)" -eq 0 ] || bad 'B release 전 BOARD 행 생성됨'
  [ "$(rows_for "$work" feature/lock-a)" -eq 0 ] || bad 'A가 B 락 보유 중 BOARD에 진입함'
  : > "$dir/b-release"
  if wait "$bpid"; then brc=0; else brc=$?; fi
  if wait "$apid"; then arc=0; else arc=$?; fi
  [ "$brc" -eq 0 ] && [ "$arc" -eq 0 ] || bad "B/A 종료 rc=$brc/$arc"
  [ "$(rows_for "$work" feature/lock-b)" -eq 1 ] || bad 'B BOARD 행 손실'
  [ "$(rows_for "$work" feature/lock-a)" -eq 1 ] || bad 'A BOARD 행 손실'
  [ ! -e "$work/.worktrees/.board.lock.d" ] || bad '완료 뒤 락 잔여'
  [ ! -f "$dir/false-calls" ] || bad '거짓 성공 mkdir를 락 획득에 사용함'
  [ "$fail_count" -ne 0 ] || echo 'OK: B 복사 뒤 A GNU EEXIST, B 해제 뒤 A 완료·두 BOARD 행 보존'
}

cd "$ROOT" || exit 1
[ -n "$REAL_GNU_MKDIR" ] || { bad '실제 GNU mkdir 부재로 필수 동시 경합 검사 불가'; exit 1; }
run_no_gnu
[ "$fail_count" -eq 0 ] && run_interleave
[ "$fail_count" -eq 0 ] || exit 1
echo 'OK: wt.sh GNU mkdir 락 회귀 검사 통과'
