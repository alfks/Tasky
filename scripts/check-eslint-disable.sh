#!/usr/bin/env bash
# 읽기 조건: 이 검사가 실패했을 때, 또는 disable 금지 규칙 목록(RESTRICTED)을 바꿀 때.
# 규칙(단일 소스 — code-style.md §7 은 여기로 링크한다): src/ 의 트래킹된 모든 파일(확장자 무관) 안에서
#   (1) 규칙명 없는 eslint-disable 금지                       예) /* eslint-disable */
#   (2) 아키텍처 규칙(RESTRICTED)의 disable 금지 — 우회 수단 없음  예) // eslint-disable-next-line import/no-restricted-paths
#   (3) 그 외 규칙의 disable 은 `-- 사유` 설명 필수              예) // eslint-disable-next-line no-console -- 개발용 진단
#   (4) 인라인 설정 주석 금지                                   예) /* eslint no-restricted-imports: off */, /* eslint-env */, /* global */
#   (5) 규칙명 부분에 ASCII 밖 문자 금지(NBSP·전각 공백·제로폭) — ESLint 는 이를 구분자로 인정하므로 우회로 취급
# ESLint 자체는 "쓰인" disable 지시자를 조용히 통과시키므로(reportUnusedDisableDirectives 는 미사용만 잡는다) 이 검사가 필요하다.
# 사용법: bash scripts/check-eslint-disable.sh [file...]   (인자 없으면 트래킹된 src/ 전체 — 확장자를 열거하지 않는다)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

RESTRICTED='import/no-restricted-paths|no-restricted-imports|no-restricted-globals|no-restricted-syntax|import/no-cycle|import/no-unresolved|import/no-default-export|@typescript-eslint/no-explicit-any'

check_file() { # $1 파일
  local f="$1" line n body rules desc pre q
  # eslint-disable 계열 + 인라인 설정 주석(/* eslint …, /* eslint-env, /* global(s)) 후보 줄만 추출
  { grep -nE 'eslint-disable|/\*[[:space:]]*eslint(-env)?[[:space:]]|/\*[[:space:]]*globals?[[:space:]]' "$f" 2>/dev/null || true; } | while IFS= read -r line; do
    n="${line%%:*}"
    line="${line#*:}"
    # 주석 기호가 문자열 리터럴 안이면(앞의 따옴표 수가 홀수) 코드가 아니라 문자열 — 건너뛴다
    pre="$(printf '%s' "$line" | sed -E 's#(//|/\*).*$##')"
    q="$(printf '%s' "$pre" | tr -cd "\"'" | wc -c | tr -d ' ')"
    [ $((q % 2)) -eq 0 ] || continue
    if printf '%s' "$line" | grep -qE '/\*[[:space:]]*eslint(-env)?[[:space:]]|/\*[[:space:]]*globals?[[:space:]]'; then
      echo "FAIL: $f:$n 인라인 ESLint 설정 주석 금지(규칙 (4)). 설정은 eslint.config.mjs 에서만."
      continue
    fi
    printf '%s' "$line" | grep -q 'eslint-disable' || continue
    body="$(printf '%s' "$line" | sed -E 's/.*eslint-disable(-next-line|-line)?//; s/\*\/.*$//')"
    case "$body" in
      *--*) rules="${body%%--*}"; desc="${body#*--}" ;;
      *)    rules="$body";        desc="" ;;
    esac
    if printf '%s' "$rules" | LC_ALL=C grep -q '[^ -~]'; then
      echo "FAIL: $f:$n disable 지시자의 규칙명에 ASCII 가 아닌 문자가 있습니다(규칙 (5): NBSP·전각공백·제로폭). 우회로 취급합니다."
      continue
    fi
    rules="$(printf '%s' "$rules" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
    desc="$(printf '%s' "$desc" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
    if [ -z "$rules" ]; then
      echo "FAIL: $f:$n 규칙명 없는 eslint-disable 금지(규칙 (1)). 규칙명을 지정하고 -- 사유를 적으세요."
    elif printf '%s' "$rules" | grep -qE "(^|[[:space:],])(${RESTRICTED})([[:space:],]|$)"; then
      echo "FAIL: $f:$n 아키텍처 규칙은 disable 할 수 없습니다(규칙 (2)): '$rules'. 경계를 지키도록 코드를 옮기세요(docs/ARCHITECTURE.md §1)."
    elif [ -z "$desc" ]; then
      echo "FAIL: $f:$n disable 에 사유가 없습니다(규칙 (3)). 예: // eslint-disable-next-line $rules -- <이유>"
    fi
  done
}

if [ "$#" -gt 0 ]; then
  out="$(for f in "$@"; do [ -f "$f" ] && check_file "$f"; done)"
else
  files="$(git ls-files src 2>/dev/null || true)"   # 확장자 제외 목록 없음 — src/ 의 모든 트래킹 파일
  if [ -z "$files" ]; then
    echo "WARN: src/ 에 트래킹된 파일이 없습니다(스캐폴딩 전) — 검사할 것이 없어 통과합니다."
    exit 0
  fi
  out="$(printf '%s\n' "$files" | while IFS= read -r f; do check_file "$f"; done)"
fi

if [ -n "$out" ]; then
  printf '%s\n' "$out"
  exit 1
fi
echo "OK: eslint-disable 정책 위반 없음"
