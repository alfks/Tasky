#!/usr/bin/env bash
# 읽기 조건: wt.sh mkdir 폴백의 PID 읽기·소유자 판정을 바꾸거나, wt 스모크가 실패했을 때.
# 실제 wt.sh 복사본을 격리 Git fixture에서 실행한다. 실패 fixture는 보존한다.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/wt-reader.XXXXXX")"
REAL_CAT="$(command -v cat)"
REAL_MV="$(command -v mv)"
fail_count=0

cleanup() {
  local rc=$?
  if [ "$rc" -ne 0 ] || [ "$fail_count" -ne 0 ]; then
    echo "FAIL: reader fixture 보존: $TMP"
  else
    rm -rf "$TMP"
  fi
}
trap cleanup EXIT
bad() { echo "FAIL: $1" >&2; fail_count=$((fail_count + 1)); }

make_fixture() {
  local name="$1" dir="$TMP/$1" work="$TMP/$1/work"
  mkdir -p "$dir" || return 1
  git init --bare -q "$dir/origin.git" || return 1
  git -C "$dir/origin.git" symbolic-ref HEAD refs/heads/main || return 1
  git init -q -b main "$work" || return 1
  git -C "$work" config user.name alfks || return 1
  git -C "$work" config user.email millie020524@gmail.com || return 1
  git -C "$work" remote add origin "$dir/origin.git" || return 1
  mkdir -p "$work/scripts" || return 1
  cp "$ROOT/scripts/wt.sh" "$work/scripts/wt.sh" || return 1
  cp "$ROOT/scripts/wt-lock.sh" "$work/scripts/wt-lock.sh" || return 1
  printf 'reader fixture\n' > "$work/README.md"
  git -C "$work" add -A || return 1
  git -C "$work" commit -q -m 'chore(t): reader fixture' || return 1
  git -C "$work" push -q origin HEAD:main || return 1
  [ "$(git hash-object "$work/scripts/wt.sh")" = "$(git hash-object "$ROOT/scripts/wt.sh")" ] || return 1
  [ "$(git hash-object "$work/scripts/wt-lock.sh")" = "$(git hash-object "$ROOT/scripts/wt-lock.sh")" ]
}

make_mv_shim() {
  local shim="$1"
  cat > "$shim/mv" <<'MV_SHIM'
#!/usr/bin/env bash
if [ "$#" -eq 2 ] && [ "$2" = "$WT_READER_BOARD" ]; then
  "$WT_READER_REAL_MV" "$@"
  rc=$?
  [ "$rc" -eq 0 ] || exit "$rc"
  : > "$WT_READER_READY"
  tries=0
  until [ -f "$WT_READER_RELEASE" ]; do
    tries=$((tries + 1))
    [ "$tries" -le 200 ] || exit 124
    sleep 0.1
  done
  exit 0
fi
exec "$WT_READER_REAL_MV" "$@"
MV_SHIM
  chmod +x "$shim/mv"
}

make_cat_shim() {
  local shim="$1"
  cat > "$shim/cat" <<'CAT_SHIM'
#!/usr/bin/env bash
if [ "$#" -eq 1 ] && [ "$1" = "$WT_READER_PID" ] && [ "$WT_READER_CAT_FAIL" = yes ]; then
  printf 'called\n' >> "$WT_READER_CAT_CALLS"
  exit 73
fi
exec "$WT_READER_REAL_CAT" "$@"
CAT_SHIM
  chmod +x "$shim/cat"
}

make_shims() {
  local dir="$1" shim="$1/noflock" bin path
  mkdir -p "$shim" || return 1
  for bin in bash env git mkdir gnumkdir rmdir rm mv cp cat sed awk grep printf wc tr kill sleep dirname basename chmod; do
    path="$(command -v "$bin" 2>/dev/null || true)"
    [ -n "$path" ] && ln -sf "$path" "$shim/$bin"
  done
  rm "$shim/mv" "$shim/cat" || return 1
  make_mv_shim "$shim" || return 1
  make_cat_shim "$shim" || return 1
}

wait_ready() {
  local marker="$1" child="$2" tries
  for ((tries = 0; tries < 200; tries++)); do
    [ -f "$marker" ] && return 0
    kill -0 "$child" 2>/dev/null || return 1
    sleep 0.1
  done
  return 1
}

inject_fault() {
  local kind="$1" pidfile="$2" owner="$3"
  case "$kind" in
    valid|cat-fail) ;;
    missing) rm "$pidfile" ;;
    empty) : > "$pidfile" ;;
    wrong) printf '%s\n' "$((owner + 1))" > "$pidfile" ;;
    extra) printf '%s\n%s\n' "$owner" "$((owner + 1))" > "$pidfile" ;;
    crlf) printf '%s\r\n' "$owner" > "$pidfile" ;;
    *) return 1 ;;
  esac
}

verify_case() {
  local name="$1" kind="$2" rc="$3" injected_hash="$4"
  local dir="$TMP/$name" work="$TMP/$name/work" branch="feature/reader-$name"
  local pidfile="$work/.worktrees/.board.lock.d/pid" rows actual calls=0
  rows="$(awk -F'|' -v b="$branch" '$4 ~ "^[[:space:]]*" b "[[:space:]]*$" { n++ } END { print n+0 }' "$work/.worktrees/BOARD.md")"
  actual="$(git -C "$work/.worktrees/reader-$name" branch --show-current 2>/dev/null || true)"
  [ "$rows" -eq 1 ] || bad "$name: BOARD 행 $rows (기대 1)"
  [ "$actual" = "$branch" ] || bad "$name: worktree branch ${actual:-없음}"
  [ -f "$dir/cat-calls" ] && calls="$(wc -l < "$dir/cat-calls")"
  if [ "$kind" = valid ] || [ "$kind" = cat-fail ]; then
    [ "$rc" -eq 0 ] || bad "$name: 예상 성공, rc=$rc"
    [ ! -e "$work/.worktrees/.board.lock.d" ] || bad "$name: 성공 뒤 락 잔여"
    [ "$calls" -eq 0 ] || bad "$name: cat 실패 shim 호출 $calls (기대 0)"
  else
    [ "$rc" -ne 0 ] || bad "$name: 예상 실패인데 rc=0"
    [ -d "$work/.worktrees/.board.lock.d" ] || bad "$name: 실패 뒤 락이 사라짐"
    [ "$kind" = missing ] || [ "$(git hash-object "$pidfile" 2>/dev/null)" = "$injected_hash" ] || bad "$name: PID raw 변경"
    [ "$kind" != missing ] || [ ! -e "$pidfile" ] || bad "$name: 없는 PID 재생성"
    grep -F '락을 보존합니다' "$dir/child.log" >/dev/null || bad "$name: 보존 오류 메시지 없음"
    [ "$kind" != missing ] || grep -F "$pidfile" "$dir/child.log" >/dev/null || bad "$name: native 읽기 오류 없음"
  fi
}

run_case() {
  local name="$1" kind="$2" dir="$TMP/$1" work="$TMP/$1/work"
  local pidfile="$work/.worktrees/.board.lock.d/pid" branch="feature/reader-$1"
  local child owner rc injected_hash=missing before="$fail_count"
  make_fixture "$name" && make_shims "$dir" || { bad "$name: fixture 생성 실패"; return; }
  (
    cd "$work" || exit 1
    exec timeout --signal=TERM --kill-after=2s 40s env PATH="$dir/noflock" WT_READER_BOARD="$work/.worktrees/BOARD.md" \
      WT_READER_PID="$pidfile" WT_READER_READY="$dir/ready" WT_READER_RELEASE="$dir/release" \
      WT_READER_REAL_MV="$REAL_MV" WT_READER_REAL_CAT="$REAL_CAT" \
      WT_READER_CAT_FAIL="$([ "$kind" = cat-fail ] && echo yes || echo no)" \
      WT_READER_CAT_CALLS="$dir/cat-calls" bash scripts/wt.sh new "$branch"
  ) > "$dir/child.log" 2>&1 &
  child=$!
  if ! wait_ready "$dir/ready" "$child"; then
    bad "$name: BOARD 교체 barrier 미도달"; : > "$dir/release"; wait "$child" || true
    return
  fi
  owner="$("$REAL_CAT" "$pidfile")" || { bad "$name: owner PID 읽기 실패"; : > "$dir/release"; wait "$child" || true; return; }
  [[ "$owner" =~ ^[0-9]+$ ]] || { bad "$name: owner PID 형식 오류"; : > "$dir/release"; wait "$child" || true; return; }
  inject_fault "$kind" "$pidfile" "$owner" || bad "$name: fault 주입 실패"
  [ -f "$pidfile" ] && injected_hash="$(git hash-object "$pidfile")"
  : > "$dir/release"
  if wait "$child"; then rc=0; else rc=$?; fi
  if [ "$rc" -eq 124 ] || [ "$rc" -eq 137 ]; then
    bad "$name: wt.sh 실행 시간 초과 또는 강제 종료 (rc=$rc)"
    return
  fi
  verify_case "$name" "$kind" "$rc" "$injected_hash"
  [ "$fail_count" -eq "$before" ] && echo "OK: $name ($kind)"
}

cd "$ROOT" || exit 1
run_case valid valid
run_case missing missing
run_case empty empty
run_case wrong wrong
run_case extra extra
run_case crlf crlf
run_case cat-fail cat-fail

if [ "$fail_count" -eq 0 ]; then
  echo "OK: wt.sh PID reader 7 fixture 통과"
  exit 0
fi
echo "FAIL: wt.sh PID reader $fail_count건"
exit 1
