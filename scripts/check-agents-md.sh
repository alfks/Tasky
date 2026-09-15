#!/usr/bin/env bash
# 읽기 조건: 이 검사가 실패했을 때, 또는 검사 규칙을 바꿀 때.
# 규칙: 트래킹된 파일이 있는 모든 디렉토리는 AGENTS.md 를 갖는다.
#       예외: 상위 디렉토리의 AGENTS.md 본문에 '관할: <하위디렉토리명>/' 이 명시적으로 있으면 그 하위
#       디렉토리는 면제된다(예: .github/AGENTS.md 에 '관할: workflows/' 가 있으면 .github/workflows/ 는 면제).
#       하드코딩된 필수 목록을 쓰지 않는다 — git ls-files 로 매번 동적으로 다시 센다.
# 검사: (1) 위 규칙으로 디렉토리마다 AGENTS.md 존재 (2) 디렉토리 AGENTS.md ≤ 60줄 (3) 첫 3줄에 '읽기 조건'
#       (4) CLAUDE.md ≤ 250줄, 루트 AGENTS.md ≤ 120줄 (5) docs/**/*.md (research 제외) 첫 3줄에 '읽기 조건'
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

MAX_AGENTS=60
MAX_ROOT_AGENTS=120
MAX_CLAUDE=250

fail=0
say_fail() { echo "FAIL: $*"; fail=1; }

# 트래킹 파일을 직접 담고 있는 모든 디렉토리(루트 제외, 중복 제거). git + awk 만 사용.
dirs="$(git ls-files | awk -F'/' '
  NF == 1 { next }
  { d = $1; for (i = 2; i < NF; i++) d = d "/" $i
    if (!(d in seen)) { seen[d] = 1; print d } }
')"

dir_count=0
for d in $dirs; do
  dir_count=$((dir_count + 1))
  f="$d/AGENTS.md"
  if [ -f "$f" ]; then
    n="$(wc -l < "$f" | tr -d ' ')"
    [ "$n" -le "$MAX_AGENTS" ] || say_fail "$f 가 ${MAX_AGENTS}줄을 넘습니다 (${n}줄) — 하위 디렉토리로 분리"
    head -3 "$f" | grep -q '읽기 조건' || say_fail "$f 첫 3줄에 '<!-- 읽기 조건: … -->' 이 없습니다"
    continue
  fi
  # AGENTS.md 가 없다 — 부모 AGENTS.md 의 명시적 '관할: <dir>/' 선언으로만 면제된다.
  parent="${d%/*}"; [ "$parent" = "$d" ] && parent="."
  base="${d##*/}"
  parent_agents="AGENTS.md"; [ "$parent" != "." ] && parent_agents="$parent/AGENTS.md"
  if [ -f "$parent_agents" ] && grep -qF "관할: ${base}/" "$parent_agents"; then
    continue
  fi
  say_fail "AGENTS.md 없음: $f  (템플릿: docs/conventions/templates/AGENTS.template.md, 또는 $parent_agents 에 '관할: ${base}/' 선언으로 면제)"
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
  [ -f "$f" ] || continue  # 인덱스엔 있으나 워킹트리에서 지워짐 — 위 디렉토리 루프에서 이미 별도로 잡힘
  head -3 "$f" | grep -q '읽기 조건' || say_fail "$f 첫 3줄에 '읽기 조건' 주석이 없습니다"
done < <(git ls-files 'docs/*.md' 'docs/**/*.md' | grep -v '^docs/research/' || true)

[ "$fail" -eq 0 ] && echo "OK: AGENTS.md 구조 검사 통과 (${dir_count}개 디렉토리)"
exit "$fail"
