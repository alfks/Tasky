#!/usr/bin/env bash
# 읽기 조건: 이 검사가 실패했을 때, 또는 disable 금지 규칙 목록(RESTRICTED)을 바꿀 때.
# 규칙(단일 소스 — code-style.md §7 은 여기로 링크한다): src/**/*.{ts,tsx,js,mjs} 안에서
#   (1) 규칙명 없는 eslint-disable 금지                       예) /* eslint-disable */
#   (2) 아키텍처 규칙(RESTRICTED)의 disable 금지 — 우회 수단 없음  예) // eslint-disable-next-line import/no-restricted-paths
#   (3) 그 외 규칙의 disable 은 `-- 사유` 설명 필수              예) // eslint-disable-next-line no-console -- 개발용 진단
#   (4) 인라인 설정 주석 금지                                   예) /* eslint no-restricted-imports: off */, /* eslint-env */, /* global */
# ESLint 자체는 "쓰인" disable 지시자를 조용히 통과시키므로(reportUnusedDisableDirectives 는 미사용만 잡는다) 이 검사가 필요하다.
# 사용법: bash scripts/check-eslint-disable.sh [file...]   (인자 없으면 트래킹된 src/ 소스 전체)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

RESTRICTED='import/no-restricted-paths|no-restricted-imports|no-restricted-globals|no-restricted-syntax|import/no-cycle|import/no-unresolved|import/no-default-export|@typescript-eslint/no-explicit-any'

fail=0
say_fail() { echo "FAIL: $*"; fail=1; }

check_file() { # $1 파일
  local f="$1" line n body rules desc
  # eslint-disable 계열 + 인라인 설정 주석(/* eslint …, /* eslint-env, /* global(s)) 후보 줄만 추출
  { grep -nE 'eslint-disable|/\*[[:space:]]*eslint(-env)?[[:space:]]|/\*[[:space:]]*globals?[[:space:]]' "$f" 2>/dev/null || true; } | while IFS= read -r line; do
    n="${line%%:*}"
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
  files="$(git ls-files 'src/*.ts' 'src/*.tsx' 'src/*.js' 'src/*.mjs' 2>/dev/null || true)"
  if [ -z "$files" ]; then
    echo "WARN: src/ 에 트래킹된 소스가 없습니다(스캐폴딩 전) — 검사할 것이 없어 통과합니다."
    exit 0
  fi
  out="$(printf '%s\n' "$files" | while IFS= read -r f; do check_file "$f"; done)"
fi

if [ -n "$out" ]; then
  printf '%s\n' "$out"
  exit 1
fi
echo "OK: eslint-disable 정책 위반 없음"
