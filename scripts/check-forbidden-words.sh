#!/usr/bin/env bash
# 읽기 조건: 이 검사가 실패했을 때, 또는 검사 범위를 바꿀 때.
# 사용법:
#   bash scripts/check-forbidden-words.sh                  트래킹 + 미추적(비무시) 파일 전체 (본문 + 파일명)
#   bash scripts/check-forbidden-words.sh --staged         인덱스(스테이징 반영) 전체 + 스테이징 파일명  (pre-commit)
#   bash scripts/check-forbidden-words.sh --text-file <f>  임의 텍스트 파일 (커밋 메시지, PR 제목/본문)
#   bash scripts/check-forbidden-words.sh --paths <p...>   비트래킹 경로 재귀 검사 (빌드 산출물 등)
#
# 금지 토큰(레퍼런스 앱 제품명)은 이 파일에도 리터럴로 쓰지 않는다 — 아래처럼 조각으로 조립한다.
# 오탐(예: 영문 두 단어가 우연히 이어지는 경우)이 나면 문장을 바꿔 쓴다. 예외 목록은 두지 않는다.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

p1='to'; p2='do'; p3='ma'; p4='te'
k1='투두'; k2='메이트'
SEP='[[:space:]_.-]*'
PATTERN="${p1}${p2}${SEP}${p3}${p4}|${k1}${SEP}${k2}"
EXCLUDES=(':!pnpm-lock.yaml' ':!*.png' ':!*.jpg' ':!*.jpeg' ':!*.ico' ':!*.woff' ':!*.woff2' ':!*.svg')

fail=0
report() { # $1 label, $2 hits
  if [ -n "$2" ]; then
    echo "FAIL: $1 에서 금지어(레퍼런스 앱 제품명)가 발견되었습니다. '레퍼런스 앱'으로 바꾸세요."
    printf '%s\n' "$2" | head -50 | sed 's/^/    /'
    fail=1
  fi
}

mode="${1:-}"
case "$mode" in
  --text-file)
    f="${2:?파일 경로 필요}"
    report "$f" "$(grep -niE "$PATTERN" "$f" || true)"
    ;;
  --paths)
    shift
    [ "$#" -gt 0 ] || { echo "경로를 지정하세요"; exit 2; }
    existing=()
    for p in "$@"; do [ -e "$p" ] && existing+=("$p"); done
    if [ "${#existing[@]}" -gt 0 ]; then
      report "경로 ${existing[*]} (본문)" "$(grep -rnIiE "$PATTERN" "${existing[@]}" 2>/dev/null || true)"
      report "경로 ${existing[*]} (파일명)" "$(find "${existing[@]}" -print 2>/dev/null | grep -iE "$PATTERN" || true)"
    fi
    ;;
  --staged)
    report "인덱스(본문)" "$(git grep --cached -nIiE "$PATTERN" -- . "${EXCLUDES[@]}" || true)"
    report "스테이징 파일명" "$(git diff --cached --name-only | grep -iE "$PATTERN" || true)"
    ;;
  "")
    report "작업 트리(본문)" "$(git grep -nIiE --untracked "$PATTERN" -- . "${EXCLUDES[@]}" || true)"
    report "파일명" "$(git ls-files --cached --others --exclude-standard | grep -iE "$PATTERN" || true)"
    ;;
  *)
    echo "알 수 없는 옵션: $mode"; sed -n '2,8p' "$0"; exit 2
    ;;
esac

[ "$fail" -eq 0 ] && echo "OK: 금지어 없음"
exit "$fail"
