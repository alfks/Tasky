#!/usr/bin/env bash
# 읽기 조건: scripts/wt.sh 를 고쳤을 때 커밋 전에 반드시 먼저 돌려 볼 것.
#           wt.sh 는 라운드 1·2 리뷰에서 연속으로 Blocker(반쪽 상태로 브랜치·커밋 유실)를 냈다 —
#           이 스모크 테스트가 그런 회귀를 다시 커밋 전에 잡기 위한 안전망이다.
# 사용법: bash scripts/test-wt.sh
# /tmp 에 가짜 bare origin + 워킹 클론을 만들어 이 레포의 scripts/wt.sh 를 그대로 복사해 넣고
# 주요 경로(new · new --existing 3종 · rm merged · rm unmerged 거부 · rm --force · 동시 BOARD
# 갱신)를 왕복시킨다. 원본 레포(.worktrees, 브랜치)는 절대 건드리지 않고, 끝나면(성공·실패 무관)
# 임시 디렉토리를 항상 지운다. pnpm 등 무거운 의존성이 없어 CI 에서도 수십 초 안에 끝난다.
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/wt-smoke.XXXXXX")"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

fail=0
ok()  { echo "OK: $1"; }
bad() { echo "FAIL: $1"; fail=1; }

run() { # $1 설명, 나머지는 성공해야 하는 명령
  local desc="$1"; shift
  if "$@" >"$TMP/last.log" 2>&1; then
    ok "$desc"
  else
    local rc=$?
    bad "$desc (rc=$rc)"
    sed 's/^/    /' "$TMP/last.log"
  fi
}
expect_fail() { # $1 설명, 나머지는 실패(거부)해야 하는 명령
  local desc="$1"; shift
  if "$@" >"$TMP/last.log" 2>&1; then
    bad "$desc — 거부돼야 하는데 성공함"
    sed 's/^/    /' "$TMP/last.log"
  else
    ok "$desc"
  fi
}
assert_exists() { [ -e "$1" ] && ok "$2" || bad "$2 — $1 없음"; }
assert_absent()  { [ -e "$1" ] && bad "$2 — $1 이 남아있음(반쪽 상태)" || ok "$2"; }
assert_branch_gone() { git branch --list "$1" | grep -q . && bad "$2 — 브랜치 '$1' 남음" || ok "$2"; }
assert_branch_kept() { git branch --list "$1" | grep -q . && ok "$2" || bad "$2 — 브랜치 '$1' 사라짐(손실!)"; }

# --- 샌드박스: bare origin + 워킹 클론, wt.sh 만 지금 버전으로 넣는다 ---
git init --bare -q "$TMP/origin.git"
git -C "$TMP/origin.git" symbolic-ref HEAD refs/heads/main
git init -q -b main "$TMP/work"
cd "$TMP/work"
git config user.name alfks
git config user.email millie020524@gmail.com
git remote add origin "$TMP/origin.git"
mkdir -p scripts
cp "$ROOT/scripts/wt.sh" scripts/wt.sh
chmod +x scripts/wt.sh
echo "smoke" > README.md
git add -A && git commit -q -m "chore(t): 초기 커밋"
git push -q origin HEAD:main

echo "=== 1) new: 새 브랜치 ==="
run "new 로 워크트리 생성" bash scripts/wt.sh new feature/smoke-new
assert_exists .worktrees/smoke-new "새 브랜치 워크트리 디렉토리"

echo "=== 2) new --existing: 이미 있는 로컬 브랜치 ==="
git branch feature/smoke-existing main -q
run "new --existing(로컬 브랜치)" bash scripts/wt.sh new feature/smoke-existing --existing
assert_exists .worktrees/smoke-existing "기존 로컬 브랜치 워크트리 디렉토리"

echo "=== 3) new --existing: 원격에만 있는 브랜치 ==="
git worktree add -q -b feature/smoke-remote "$TMP/tmp-remote" main
git -C "$TMP/tmp-remote" push -q origin feature/smoke-remote
git worktree remove "$TMP/tmp-remote" --force
git branch -D feature/smoke-remote -q >/dev/null 2>&1
git fetch origin -q
run "new --existing(원격 전용 브랜치)" bash scripts/wt.sh new feature/smoke-remote --existing
assert_exists .worktrees/smoke-remote "원격 전용 브랜치 워크트리 디렉토리"

echo "=== 4) new --existing: 존재하지 않는 브랜치 → 거부 + 반쪽 상태 없음 ==="
expect_fail "존재하지 않는 브랜치 거부" bash scripts/wt.sh new feature/smoke-nope --existing
assert_absent .worktrees/smoke-nope "반쪽 워크트리 없음"
assert_branch_gone feature/smoke-nope "반쪽 브랜치 없음"

echo "=== 5) rm: 머지된 브랜치 → 삭제 성공 ==="
( cd .worktrees/smoke-new && echo work > W.md && git add -A && git commit -q -m "feat(t): 작업" )
git merge --no-ff feature/smoke-new -q -m "merge smoke-new"
git push -q origin main
run "머지 브랜치 rm 성공" bash scripts/wt.sh rm smoke-new
assert_branch_gone feature/smoke-new "머지된 브랜치 삭제됨"

echo "=== 6) rm: 미머지 브랜치 → 거부(작업 보존) ==="
( cd .worktrees/smoke-existing && echo work2 > W2.md && git add -A && git commit -q -m "feat(t): 미머지 작업" )
expect_fail "미머지 브랜치 rm 거부" bash scripts/wt.sh rm smoke-existing
assert_branch_kept feature/smoke-existing "미머지 브랜치 보존됨"

echo "=== 7) rm --force: 미머지 브랜치도 강제 삭제 ==="
run "--force 삭제 성공" bash scripts/wt.sh rm smoke-existing --force
assert_branch_gone feature/smoke-existing "--force 삭제 확인"

echo "=== 8) 동시 BOARD 갱신: new 8개 동시 실행 ==="
pids=()
for i in 1 2 3 4 5 6 7 8; do
  ( bash scripts/wt.sh new "feature/smoke-c$i" >"$TMP/c$i.log" 2>&1 ) &
  pids+=("$!")
done
for p in "${pids[@]}"; do wait "$p"; done
rows="$(grep -cE 'smoke-c[1-8]' .worktrees/BOARD.md)"
[ "$rows" -eq 8 ] && ok "동시 실행 후 BOARD 행 8/8 보존" || bad "동시 실행 후 BOARD 행 손실 ($rows/8)"
headers="$(grep -cE '^# BOARD' .worktrees/BOARD.md)"
[ "$headers" -eq 1 ] && ok "BOARD 헤더 중복 없음" || bad "BOARD 헤더 중복 발생 ($headers)"

echo "=================================="
if [ "$fail" -eq 0 ]; then
  echo "OK: wt.sh 스모크 테스트 전부 통과"
else
  echo "FAIL: 위 실패 항목을 확인하세요 (임시 디렉토리는 자동 정리됨, 원본 레포는 손대지 않음)"
fi
exit "$fail"
