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
  local f="$1" line n body rules desc dircount
  # eslint-disable 계열 + 인라인 설정 주석(/* eslint …, /* eslint-env, /* global(s)) 후보 줄만 추출
  { grep -nE 'eslint-disable|/\*[[:space:]]*eslint(-env)?[[:space:]]|/\*[[:space:]]*globals?[[:space:]]' "$f" 2>/dev/null || true; } | while IFS= read -r line; do
    n="${line%%:*}"
    line="${line#*:}"
    # 문자열 리터럴('...'/"...")의 *내용만* 지운다(줄 전체를 건너뛰지 않는다). 과거 버전은
    # "주석 기호 앞 따옴표가 홀수면 문자열 안이니 줄 전체를 건너뛴다"였는데, 그러면
    # `const s = "don't"; // eslint-disable-line import/no-restricted-paths` 처럼 흔한
    # 아포스트로피가 낀 코드에서 뒤의 진짜 지시자까지 통째로 새 나간다(감사망 우회).
    # false negative(우회 허용)는 금지, false positive(문자열 속 가짜 주석 오탐)는 허용 쪽으로
    # 기운다 — 문자열 내용을 비우면 두 문제가 동시에 없어진다: 진짜 주석은 그대로 남고,
    # 문자열 안의 가짜 "// eslint-disable" 텍스트는 사라진다.
    line="$(printf '%s' "$line" | sed -E "s/'([^'\\\\]|\\\\.)*'/''/g; s/\"([^\"\\\\]|\\\\.)*\"/\"\"/g")"
    printf '%s' "$line" | grep -qE 'eslint-disable|/\*[[:space:]]*eslint(-env)?[[:space:]]|/\*[[:space:]]*globals?[[:space:]]' || continue
    # 한 줄에 eslint-disable 지시자가 2개 이상이면 아래 sed(greedy)가 뒤의 것만 남기고 앞의
    # 것은 검사되지 않은 채 통과한다 — 판정을 시도하는 대신 애초에 금지한다(줄 분리 강제).
    dircount="$(printf '%s' "$line" | grep -o 'eslint-disable' | wc -l | tr -d ' ')"
    if [ "$dircount" -gt 1 ]; then
      echo "FAIL: $f:$n 한 줄에 eslint-disable 지시자가 2개 이상입니다. 줄을 나누세요(뒤의 것만 검사되어 앞의 것이 감사망을 빠져나갑니다)."
      continue
    fi
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
