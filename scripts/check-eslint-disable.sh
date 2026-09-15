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

# 한 줄을 "주석은 그대로, 문자열 리터럴 내용은 비운" 형태로 정규화해 지시자 후보 줄만 뽑는다.
# 핵심은 순서다: 주석을 먼저 인식한다. 이전 버전은 sed 로 문자열만 지워서, 주석 안의 따옴표 쌍이
# 그 사이의 진짜 지시자를 통째로 삼켰다 — `/* " */ /* eslint-disable … */ /* " */` 가 검사를
# 통과하고 실제 ESLint 에서는 규칙이 꺼졌다(라운드 3 Major). 블록 주석·템플릿 리터럴은 줄을
# 넘어가므로 상태를 파일 단위로 이어간다. 줄 끝까지 닫히지 않은 따옴표(정규식 리터럴 오인 등)는
# 판정 불가로 보고 그 줄을 원문 그대로 검사한다 — false negative(우회)는 금지, 과잉 검출은 허용.
candidate_lines() { # $1 파일 → "행번호:정규화된 줄"
  awk '
    BEGIN { st = 0 }   # 0=코드, 1=블록 주석, 2=템플릿 리터럴
    {
      line = $0; out = ""; susp = 0; i = 1; L = length(line)
      while (i <= L) {
        c = substr(line, i, 1); c2 = substr(line, i, 2)
        if (st == 1) { if (c2 == "*/") { out = out "*/"; i += 2; st = 0 } else { out = out c; i++ } }
        else if (st == 2) { if (c == "\\") { i += 2 } else if (c == "`") { out = out "`"; i++; st = 0 } else { i++ } }
        else if (c2 == "//") { out = out substr(line, i); i = L + 1 }
        else if (c2 == "/*") { out = out "/*"; i += 2; st = 1 }
        else if (c == "`") { out = out "`"; i++; st = 2 }
        else if (c == "\"" || c == "\047") {
          q = c; out = out q; i++; closed = 0
          while (i <= L) {
            d = substr(line, i, 1)
            if (d == "\\") { i += 2; continue }
            if (d == q) { out = out q; i++; closed = 1; break }
            i++
          }
          if (! closed) { susp = 1; break }
        }
        else { out = out c; i++ }
      }
      if (susp) out = line
      if (out ~ /eslint-disable/ || out ~ /\/\*[[:space:]]*eslint(-env)?[[:space:]]/ || out ~ /\/\*[[:space:]]*globals?[[:space:]]/)
        print NR ":" out
    }
  ' "$1"
}

check_file() { # $1 파일
  local f="$1" line n body rules desc dircount
  candidate_lines "$f" | while IFS= read -r line; do
    n="${line%%:*}"
    line="${line#*:}"
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
