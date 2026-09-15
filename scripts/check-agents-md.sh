#!/usr/bin/env bash
# 읽기 조건: 이 검사가 실패했을 때, 또는 필수 디렉토리 목록을 바꿀 때.
# 검사: (1) 필수 디렉토리마다 AGENTS.md 존재 (2) 디렉토리 AGENTS.md ≤ 60줄 (3) 첫 3줄에 '읽기 조건'
#       (4) CLAUDE.md ≤ 250줄, 루트 AGENTS.md ≤ 120줄 (5) docs/**/*.md (research 제외) 첫 3줄에 '읽기 조건'
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

MAX_AGENTS=60
MAX_ROOT_AGENTS=120
MAX_CLAUDE=250
REQUIRED_DIRS="docs docs/conventions docs/research docs/specs docs/decisions .github .worktrees scripts .githooks"

fail=0
say_fail() { echo "FAIL: $*"; fail=1; }

dirs="$REQUIRED_DIRS"
# src/ 와 그 바로 아래 디렉토리, tests/ 는 존재할 때만 (features/* 하위는 features/AGENTS.md 가 담당)
[ -d src ] && dirs="$dirs src"
for d in src/*/; do [ -d "$d" ] && dirs="$dirs ${d%/}"; done
[ -d tests ] && dirs="$dirs tests"

for d in $dirs; do
  f="$d/AGENTS.md"
  if [ ! -d "$d" ]; then say_fail "필수 디렉토리 없음: $d"; continue; fi
  if [ ! -f "$f" ]; then say_fail "AGENTS.md 없음: $f  (템플릿: docs/conventions/templates/AGENTS.template.md)"; continue; fi
  n="$(wc -l < "$f" | tr -d ' ')"
  [ "$n" -le "$MAX_AGENTS" ] || say_fail "$f 가 ${MAX_AGENTS}줄을 넘습니다 (${n}줄) — 하위 디렉토리로 분리"
  head -3 "$f" | grep -q '읽기 조건' || say_fail "$f 첫 3줄에 '<!-- 읽기 조건: … -->' 이 없습니다"
done

if [ -f CLAUDE.md ]; then
  n="$(wc -l < CLAUDE.md | tr -d ' ')"
  [ "$n" -le "$MAX_CLAUDE" ] || say_fail "CLAUDE.md 가 ${MAX_CLAUDE}줄을 넘습니다 (${n}줄) — 컨벤션 문서로 이동"
else
  say_fail "CLAUDE.md 없음"
fi

if [ -f AGENTS.md ]; then
  n="$(wc -l < AGENTS.md | tr -d ' ')"
  [ "$n" -le "$MAX_ROOT_AGENTS" ] || say_fail "루트 AGENTS.md 가 ${MAX_ROOT_AGENTS}줄을 넘습니다 (${n}줄) — agent-collaboration.md 로 이동"
else
  say_fail "루트 AGENTS.md 없음"
fi

while IFS= read -r f; do
  head -3 "$f" | grep -q '읽기 조건' || say_fail "$f 첫 3줄에 '읽기 조건' 주석이 없습니다"
done < <(git ls-files 'docs/*.md' 'docs/**/*.md' | grep -v '^docs/research/' || true)

[ "$fail" -eq 0 ] && echo "OK: AGENTS.md 구조 검사 통과 ($(printf '%s\n' $dirs | wc -l | tr -d ' ')개 디렉토리)"
exit "$fail"
