#!/usr/bin/env bash
# 읽기 조건: scripts/wt.sh 를 고쳤을 때 커밋 전에 반드시 먼저 돌려 볼 것. wt.sh 는 라운드 1~3 에서
#           연속으로 Blocker(반쪽 상태·브랜치/커밋 유실)를 냈다 — 그 회귀를 잡는 안전망이다.
# 사용법: bash scripts/test-wt.sh
# /tmp 에 가짜 bare origin + 워킹 클론(+ 제3의 클론 "agentB")을 만들어 이 레포의 scripts/wt.sh 를
# 그대로 복사해 넣고 주요 경로를 왕복시킨다: new · new --existing 3종 · rm 일반/스쿼시 머지 · 미머지
# 거부/--force · 빈/되돌린 커밋 거부 · 원격 앞섬/조회 실패 · 미커밋 변경 · cherry 실패 · stale ref 거부
# 보고 · flock 유무 양쪽의 동시 BOARD 갱신. 원본 레포는 절대 건드리지 않고, 끝나면(성공·실패·
# SIGINT/SIGTERM 무관) trap 으로 임시 디렉토리를 항상 지운다. CI 에서는 락 대기까지 수십 초가 든다.
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
# wt.sh 의 BOARD 락은 BOARD.md 갱신만 보호한다 — git worktree add 자체는 여러 프로세스가 정말
# 동시에 돌면 git 내부 메타데이터 레이스로 드물게 실패한다(BOARD 행 유실과는 다른, git 의 한계).
# 아래 동시성 테스트가 보려는 건 "BOARD 행이 드랍되는가"이므로 이 레이스는 짧게 재시도해 흡수한다.
new_with_retry() { # $1 PATH(빈 문자열이면 현재 PATH 유지), $2 branch
  local envpath="$1" branch="$2" tries=0
  # log 는 별도 local 문으로 — 같은 local 안에서 뒤 항목이 앞 항목을 참조하면 set -u 로 샌다.
  local log="$TMP/nwr-$(printf '%s' "$branch" | tr '/' '_').log"
  while true; do
    if [ -n "$envpath" ]; then
      PATH="$envpath" bash scripts/wt.sh new "$branch" >"$log" 2>&1 && return 0
    else
      bash scripts/wt.sh new "$branch" >"$log" 2>&1 && return 0
    fi
    tries=$((tries + 1))
    [ "$tries" -lt 5 ] || { cat "$log"; return 1; }
    sleep "0.$((RANDOM % 5 + 1))"
  done
}

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
  ( new_with_retry "" "feature/smoke-c$i" ) &
  pids+=("$!")
done
for p in "${pids[@]}"; do wait "$p"; done
rows="$(grep -cE 'smoke-c[1-8]' .worktrees/BOARD.md)"
[ "$rows" -eq 8 ] && ok "동시 실행 후 BOARD 행 8/8 보존" || bad "동시 실행 후 BOARD 행 손실 ($rows/8)"
headers="$(grep -cE '^# BOARD' .worktrees/BOARD.md)"
[ "$headers" -eq 1 ] && ok "BOARD 헤더 중복 없음" || bad "BOARD 헤더 중복 발생 ($headers)"

echo "=== 9) rm: 스쿼시 머지된 브랜치 → 삭제 성공 (commit-tree+cherry 판정 경로) ==="
run "new(smoke-sq)" bash scripts/wt.sh new feature/smoke-sq
( cd .worktrees/smoke-sq \
  && echo a > A.md && git add -A && git commit -q -m "feat(t): sq 1" \
  && echo b > B.md && git add -A && git commit -q -m "feat(t): sq 2" )
git merge --squash feature/smoke-sq -q >/dev/null 2>&1
git commit -q -m "feat(t): 스쿼시 병합"
git push -q origin main
run "스쿼시 머지 브랜치 rm 성공" bash scripts/wt.sh rm smoke-sq
assert_branch_gone feature/smoke-sq "스쿼시 머지 브랜치 삭제됨"

echo "=== 10) rm: 빈 커밋만 있는 브랜치 → 거부(히스토리 보존, tree==base_tree 인데 커밋 있음) ==="
run "new(smoke-empty)" bash scripts/wt.sh new feature/smoke-empty
( cd .worktrees/smoke-empty && git commit -q --allow-empty -m "chore(t): 빈 커밋" )
expect_fail "빈 커밋 브랜치 rm 거부" bash scripts/wt.sh rm smoke-empty
assert_branch_kept feature/smoke-empty "빈 커밋 브랜치 보존됨"
bash scripts/wt.sh rm smoke-empty --force >"$TMP/last.log" 2>&1 || true

echo "=== 11) rm: 추가 후 되돌려 트리가 base 와 같아진 브랜치(커밋 2개) → 거부 ==="
run "new(smoke-revert)" bash scripts/wt.sh new feature/smoke-revert
( cd .worktrees/smoke-revert \
  && echo tmp > T.md && git add -A && git commit -q -m "feat(t): 추가" \
  && git rm -q T.md && git commit -q -m "revert(t): 되돌림" )
expect_fail "되돌린(트리 동일) 브랜치 rm 거부" bash scripts/wt.sh rm smoke-revert
assert_branch_kept feature/smoke-revert "되돌린 브랜치 보존됨"
bash scripts/wt.sh rm smoke-revert --force >"$TMP/last.log" 2>&1 || true

echo "=== 12) rm: 원격이 로컬보다 앞선 브랜치 → 거부 (커밋 유실 방지, Blocker 회귀 방지) ==="
run "new(smoke-ahead)" bash scripts/wt.sh new feature/smoke-ahead
( cd .worktrees/smoke-ahead && echo a1 > A1.md && git add -A && git commit -q -m "feat(t): 1차" \
  && git push -q origin feature/smoke-ahead )
git merge --no-ff feature/smoke-ahead -q -m "merge smoke-ahead 1차"
git push -q origin main
git clone -q "$TMP/origin.git" "$TMP/agentB"
( cd "$TMP/agentB" && git config user.name alfks && git config user.email millie020524@gmail.com \
  && git checkout -q feature/smoke-ahead && echo a2 > A2.md && git add -A \
  && git commit -q -m "feat(t): 2차(다른 클론)" && git push -q origin feature/smoke-ahead )
expect_fail "원격이 앞선 브랜치 rm 거부(--force 도 거부해야 함)" bash scripts/wt.sh rm smoke-ahead --force
if git ls-remote --heads origin feature/smoke-ahead 2>/dev/null | grep -q .; then
  ok "원격 브랜치 '2차' 커밋 보존됨(유실 없음)"
else
  bad "원격 브랜치가 사라짐 — 다른 클론의 커밋이 유실됐습니다!"
fi

echo "=== 13) rm: 머지됐지만 워크트리에 미커밋 변경이 있음 → 거부(worktree remove 보호) ==="
run "new(smoke-dirty)" bash scripts/wt.sh new feature/smoke-dirty
( cd .worktrees/smoke-dirty && echo d > D.md && git add -A && git commit -q -m "feat(t): dirty 작업" )
git merge --no-ff feature/smoke-dirty -q -m "merge smoke-dirty"
git push -q origin main
echo unsaved > .worktrees/smoke-dirty/U.md   # 미추적 파일 — 커밋되지 않음
expect_fail "미커밋 변경 있는 워크트리 rm 거부" bash scripts/wt.sh rm smoke-dirty
assert_exists .worktrees/smoke-dirty/U.md "미저장 파일 보존됨(worktree remove 가 거부됨)"
bash scripts/wt.sh rm smoke-dirty --force >"$TMP/last.log" 2>&1 || true

echo "=== 14) rm: git cherry 실패 시 fail-closed(판정 불가 → 거부) ==="
run "new(smoke-cherry)" bash scripts/wt.sh new feature/smoke-cherry
( cd .worktrees/smoke-cherry && echo c > C.md && git add -A && git commit -q -m "feat(t): 미머지" )
REAL_GIT="$(command -v git)"
mkdir -p "$TMP/shim"
cat > "$TMP/shim/git" <<SHIM
#!/usr/bin/env bash
for a in "\$@"; do [ "\$a" = cherry ] && exit 128; done
exec "$REAL_GIT" "\$@"
SHIM
chmod +x "$TMP/shim/git"
expect_fail "git cherry 실패 시 rm 거부(fail-closed)" env PATH="$TMP/shim:$PATH" bash scripts/wt.sh rm smoke-cherry
assert_branch_kept feature/smoke-cherry "cherry 실패 시에도 브랜치 보존됨"
bash scripts/wt.sh rm smoke-cherry --force >"$TMP/last.log" 2>&1 || true

echo "=== 15) 락: flock 없는 환경에서도 new 8개 동시 실행 무결 ==="
NOFLOCK="$TMP/noflock"
mkdir -p "$NOFLOCK"
for bin in bash env git mkdir rmdir rm mv cp cat sed awk grep printf wc tr kill sleep dirname basename chmod; do
  p="$(command -v "$bin" 2>/dev/null || true)"
  [ -n "$p" ] && ln -sf "$p" "$NOFLOCK/$bin"
done
pids=()
for i in 1 2 3 4 5 6 7 8; do
  ( new_with_retry "$NOFLOCK" "feature/smoke-nf$i" ) >"$TMP/nf$i.log" 2>&1 &
  pids+=("$!")
done
for i in 1 2 3 4 5 6 7 8; do
  if wait "${pids[$((i - 1))]}"; then :; else
    rc=$?; bad "no-flock 자식 $i 실패(rc=$rc)"; sed 's/^/    /' "$TMP/nf$i.log"
  fi
  branch="feature/smoke-nf$i"
  rows="$(awk -F'|' -v b="$branch" '$4 ~ "^[[:space:]]*" b "[[:space:]]*$" { n++ } END { print n+0 }' .worktrees/BOARD.md)"
  actual="$(git -C ".worktrees/smoke-nf$i" branch --show-current 2>/dev/null || true)"
  [ "$rows" -eq 1 ] && [ "$actual" = "$branch" ] && ok "no-flock $branch BOARD·worktree 정확 1개" || bad "no-flock $branch BOARD=$rows worktree=${actual:-없음}"
done
assert_absent .worktrees/.board.lock.d "no-flock 정상 종료 뒤 락 없음"
echo "=== 16) 락: 살아있거나 죽은 보유자의 락은 자동 회수하지 않음 ==="
for owner in "$$" 99999999; do
  label=dead; [ "$owner" = "$$" ] && label=live
  mkdir .worktrees/.board.lock.d || { bad "$label fixture 시작 전 락 잔존"; exit 1; }
  printf '%s\n' "$owner" > .worktrees/.board.lock.d/pid || { bad "$label fixture PID 기록 실패"; exit 1; }
  before="$(git hash-object .worktrees/BOARD.md)"
  if env PATH="$NOFLOCK" bash scripts/wt.sh new "feature/smoke-lock-$label" >"$TMP/lock-$label.log" 2>&1; then
    bad "$label 보유자 락을 훔쳐 new 성공"
  elif grep -Fq 'BOARD 락 획득 실패(20초 대기' "$TMP/lock-$label.log"; then
    ok "$label 보유자 락을 20초 안에 fail-closed"
  else
    bad "$label 예상과 다른 거부"; sed 's/^/    /' "$TMP/lock-$label.log"
  fi
  [ -d .worktrees/.board.lock.d ] && [ "$(cat .worktrees/.board.lock.d/pid 2>/dev/null)" = "$owner" ] && [ "$(git hash-object .worktrees/BOARD.md)" = "$before" ] && ok "$label 보유자 락·BOARD 보존" || bad "$label 보유자 락·BOARD 변조"
  rm .worktrees/.board.lock.d/pid && rmdir .worktrees/.board.lock.d || bad "$label fixture 락 정리 실패"
  git worktree remove --force ".worktrees/smoke-lock-$label" >/dev/null 2>&1 || true
  git branch -D "feature/smoke-lock-$label" >/dev/null 2>&1 || true
done
echo "=== 17) rm: 원격 삭제만 실패해도 삼키지 않고 정확히 보고한다(거짓 성공 보고 방지, 회귀 방지) ==="
run "new(smoke-remotefail)" bash scripts/wt.sh new feature/smoke-remotefail
( cd .worktrees/smoke-remotefail && echo r > R.md && git add -A && git commit -q -m "feat(t): 작업" \
  && git push -q origin feature/smoke-remotefail )
git merge --no-ff feature/smoke-remotefail -q -m "merge smoke-remotefail"
git push -q origin main
REAL_GIT2="$(command -v git)"
mkdir -p "$TMP/shim2"
cat > "$TMP/shim2/git" <<SHIM2
#!/usr/bin/env bash
# 원격 브랜치 "삭제" push 만 실패시킨다 — 표기가 --delete 든 :refs/heads/… 든 전부 잡는다.
if [ "\$1" = push ]; then
  for a in "\$@"; do case "\$a" in --delete|-d|:refs/heads/*) exit 1 ;; esac; done
fi
exec "$REAL_GIT2" "\$@"
SHIM2
chmod +x "$TMP/shim2/git"
out="$(env PATH="$TMP/shim2:$PATH" bash scripts/wt.sh rm smoke-remotefail 2>&1)"; rc=$?
[ "$rc" -eq 0 ] && ok "원격 삭제만 실패해도 로컬 정리는 rc=0" || bad "원격 삭제 실패 시 rc=$rc(예상 밖, 로그: $out)"
if printf '%s' "$out" | grep -q "원격 삭제 실패"; then
  ok "원격 삭제 실패가 메시지에 정확히 보고됨(거짓 '로컬·원격 삭제' 보고 없음)"
else
  bad "원격 삭제가 실패했는데도 성공한 것처럼 보고함(회귀!): $out"
fi

echo "=== 18) rm: 원격 조회 실패 → 판정 불가로 삭제 거부(stale ref 로 원격 커밋 유실 방지, Blocker 회귀 방지) ==="
run "new(smoke-fetchfail)" bash scripts/wt.sh new feature/smoke-fetchfail
( cd .worktrees/smoke-fetchfail && echo f > F.md && git add -A && git commit -q -m "feat(t): 작업" \
  && git push -q origin feature/smoke-fetchfail )
git merge --no-ff feature/smoke-fetchfail -q -m "merge smoke-fetchfail"   # 로컬 판정으로는 merged
git push -q origin main
# 다른 클론이 같은 브랜치에 커밋을 더 올린다 — 로컬 origin/<branch> 는 이 값을 모른다(stale).
( cd "$TMP/agentB" && git fetch -q origin && echo f2 > F2.md \
  && git checkout -q -B feature/smoke-fetchfail origin/feature/smoke-fetchfail && git add -A \
  && git commit -q -m "feat(t): 리뷰어가 origin 에만 올린 커밋" && git push -q origin feature/smoke-fetchfail )
remote_before="$(git ls-remote --heads "$TMP/origin.git" feature/smoke-fetchfail | cut -f1)"
# fetch 만 끊고 push 는 정상으로 — 과거 버전은 fetch 실패를 삼키고 stale ref 로 가드를 통과해 경고 0줄로 원격을 지웠다.
git remote set-url origin "$TMP/broken-nonexistent.git" && git remote set-url --push origin "$TMP/origin.git"
expect_fail "원격 조회 실패 시 rm 거부(fail-closed)" bash scripts/wt.sh rm smoke-fetchfail
expect_fail "원격 조회 실패 시 rm --force 도 거부" bash scripts/wt.sh rm smoke-fetchfail --force
remote_after="$(git ls-remote --heads "$TMP/origin.git" feature/smoke-fetchfail | cut -f1)"
if [ -n "$remote_after" ] && [ "$remote_after" = "$remote_before" ]; then
  ok "원격 조회 불가 상태에서 원격 브랜치·커밋 보존됨"
else
  bad "원격을 조회할 수 없는데도 원격 브랜치를 지웠습니다 — 커밋 유실!(before=$remote_before after=${remote_after:-없음})"
fi
git remote set-url origin "$TMP/origin.git"

echo "=== 19) rm: fetch 가 성공해도 origin/<branch> 가 갱신되지 않으면 거부(stale ref 신뢰 금지) ==="
# 18) 직후 상태 그대로: 로컬 ref 는 stale, 원격 tip 은 agentB 커밋. fetch 를 no-op 성공으로 셰임한다.
mkdir -p "$TMP/shim3"
printf '#!/usr/bin/env bash\n[ "$1" = fetch ] && exit 0\nexec %s "$@"\n' "$REAL_GIT" > "$TMP/shim3/git"
chmod +x "$TMP/shim3/git"
out19="$(env PATH="$TMP/shim3:$PATH" bash scripts/wt.sh rm smoke-fetchfail --force 2>&1)" && bad "fetch 가 ref 를 갱신하지 않았는데 rm --force 가 성공함" || ok "fetch 가 ref 를 갱신하지 않으면 rm --force 거부"
printf '%s' "$out19" | grep -q "갱신되지 않았습니다" && ok "거부 사유로 'ref 미갱신'을 정확히 지목" || bad "ref 미갱신 검사가 사라졌습니다(다른 경로로 우연히 막힌 것일 수 있음): $out19"
remote_after2="$(git ls-remote --heads "$TMP/origin.git" feature/smoke-fetchfail | cut -f1)"
[ "$remote_after2" = "$remote_before" ] && ok "stale ref 상태에서도 원격 커밋 보존됨" || bad "stale ref 를 믿고 원격 브랜치를 지웠습니다 — 커밋 유실!(after=${remote_after2:-없음})"

echo "=================================="
if [ "$fail" -eq 0 ]; then
  echo "OK: wt.sh 스모크 테스트 전부 통과"
else
  echo "FAIL: 위 실패 항목을 확인하세요 (임시 디렉토리는 자동 정리됨, 원본 레포는 손대지 않음)"
fi
exit "$fail"
