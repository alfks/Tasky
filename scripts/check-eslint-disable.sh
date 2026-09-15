#!/usr/bin/env bash
# 읽기 조건: 이 검사가 실패했을 때, 또는 disable 금지 규칙 목록(RESTRICTED)을 바꿀 때.
# 규칙(단일 소스 — code-style.md §7 은 여기로 링크한다): src/ 의 트래킹된 모든 파일(확장자 무관) 안에서
#   (1) 규칙명 없는 eslint-disable 금지                       예) /* eslint-disable */
#   (2) 아키텍처 규칙(RESTRICTED)의 disable 금지                예) // eslint-disable-next-line import/no-restricted-paths
#   (3) 그 외 규칙의 disable 은 `-- 사유` 설명 필수              예) // eslint-disable-next-line no-console -- 개발용 진단
#   (4) 인라인 설정 주석 금지                                   예) /* eslint no-restricted-imports: off */, /* eslint-env */, /* global */
#   (5) 규칙명 부분에 ASCII 밖 문자 금지(NBSP·전각 공백·제로폭) — ESLint 는 이를 구분자로 인정하므로 우회로 취급
# ESLint 자체는 "쓰인" disable 지시자를 조용히 통과시키므로(reportUnusedDisableDirectives 는 미사용만 잡는다) 이 검사가 필요하다.
#
# 판정 방식: **줄마다 독립 판정하고 문맥(문자열·주석 상태)을 다음 줄로 이어가지 않는다.**
#   이전 버전은 awk 로 JS 를 토크나이즈했다. 그런데 정규식 리터럴·JSX 텍스트 안의 백틱 하나(`/[^a-z0-9`~]/g`)면
#   토크나이저가 템플릿 리터럴 상태에 빠져 그 뒤 파일 전체가 검사에서 사라졌다(실측 우회 7종). 셸에서 정규식
#   리터럴과 나눗셈을 가르려면 사실상 JS 파서가 필요하다 — 그래서 가르기를 포기하고, `eslint-disable` 이 들어간
#   줄은 문맥과 무관하게 전부 지시자로 본다(과잉 검출). **한 줄의 오판이 다른 줄로 번지지 않는 것**이 요점이다.
#   여러 줄로 쪼갠 지시자도 막힌다: ESLint 는 주석값을 trim 한 뒤 맨 앞이 `eslint-disable` 이어야 인정하므로,
#   어느 한 줄에는 이 토큰이 통째로 남고 그 줄의 규칙 목록은 비거나 잘려 (1)·(3) 에 걸린다(실측).
#   ESLint 와 맞춘 두 가지(실측): 규칙명을 감싼 따옴표는 ESLint 가 벗기므로 여기서도 벗긴다. `--` 사유 구분자는
#   앞뒤 공백 + 하이픈 2개 이상일 때만 인정한다(ESLint 의 \s 는 상위집합이라 규칙 목록을 짧게 볼 위험이 없다).
#
# 알려진 한계(실측으로 뒷받침되는 것만 적는다 — "우회 수단 없음" 같은 단정은 쓰지 않는다):
#   - 과잉 검출 2종(오탐 픽스처 14개 중 4개가 걸린다): (a) 문자열·템플릿·주석 안이라도 `eslint-disable` 을
#     그대로 쓰면 걸린다, (b) 줄이 `eslint `/`global(s) ` 로 시작하면 여러 줄 설정 주석으로 보고 걸린다.
#     린트 정책을 예시로 적어야 하면 docs/ 에 쓰거나 토큰을 쪼갠다(`'eslint-' + 'disable'`).
#   - 검사 범위는 트래킹된 src/ 뿐이다. src/ 밖(루트 설정 파일 등)의 disable 은 보지 않는다.
#   - CR 단독 개행 파일은 여러 JS 줄이 한 줄로 합쳐져 행번호가 부정확할 수 있다(판정 자체는 막는 쪽으로 기운다).
# 사용법: bash scripts/check-eslint-disable.sh [file...]   (인자 없으면 트래킹된 src/ 전체 — 확장자를 열거하지 않는다)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

RESTRICTED='import/no-restricted-paths|no-restricted-imports|no-restricted-globals|no-restricted-syntax|import/no-cycle|import/no-unresolved|import/no-default-export|@typescript-eslint/no-explicit-any'

check_file() { # $1 파일 → 위반 줄마다 FAIL 출력
  LC_ALL=C awk -v R="$RESTRICTED" -v F="$1" '
    BEGIN {
      SQ = sprintf("%c", 39)           # 작은따옴표(awk 소스에 리터럴로 넣을 수 없다)
      QUOTES = "[" SQ "\"]"
      RX = "[[:space:],](" R ")[[:space:],]"   # 규칙명 앞뒤를 공백으로 패딩해서 본다 — 문자열 중간의 "$" 앵커를
                                              # 앵커로 안 보는 awk 구현이 있어 경계 표현에 "|$" 를 쓰지 않는다
    }
    function trim(s) { sub(/^[[:space:]]+/, "", s); sub(/[[:space:]]+$/, "", s); return s }
    function fail(n, msg) { print "FAIL: " F ":" n " " msg }
    {
      line = $0; sub(/\r$/, "", line)

      # 지시자 개수 — 토큰 분해 없이 부분 문자열 그대로 센다.
      n = 0; t = line
      while ((p = index(t, "eslint-disable")) > 0) { n++; t = substr(t, p + 14) }

      # 인라인 설정 주석: 주석값이 trim 후 eslint/eslint-env/global(s) 로 시작하면 ESLint 가 설정으로 읽는다.
      # 그 시작점은 (a) 여는 "/*" 바로 뒤이거나 (b) 여는 줄이 "/*" 뿐일 때 다음 줄 맨 앞이다 — 둘 다 본다.
      # ("(x|$)" 형태는 awk 구현마다 편차가 있어 패턴을 나눠 쓴다.)
      conf = (line ~ /\/\*[[:space:]]*eslint(-env)?[[:space:]]/ || line ~ /\/\*[[:space:]]*eslint(-env)?$/ ||
              line ~ /\/\*[[:space:]]*globals?[[:space:]]/      || line ~ /\/\*[[:space:]]*globals?$/ ||
              line ~ /^[[:space:]]*eslint(-env)?[[:space:]]/    || line ~ /^[[:space:]]*eslint(-env)?$/ ||
              line ~ /^[[:space:]]*globals?[[:space:]]/         || line ~ /^[[:space:]]*globals?$/)

      if (n == 0 && ! conf) next

      if (n > 1) {
        fail(NR, "한 줄에 eslint-disable 지시자가 2개 이상입니다. 줄을 나누세요(한 줄에 하나만 판정합니다).")
        next
      }
      if (conf) {
        fail(NR, "인라인 ESLint 설정 주석 금지(규칙 (4)). 설정은 eslint.config.mjs 에서만.")
        next
      }

      # 지시자 뒤 = 규칙 목록 + (`--` 사유). 블록 주석이면 첫 "*/" 에서 끊는다.
      p = index(line, "eslint-disable"); rest = substr(line, p + 14)
      if (rest ~ /^-next-line/) rest = substr(rest, 11)
      else if (rest ~ /^-line/) rest = substr(rest, 6)
      q = index(rest, "*/"); if (q > 0) rest = substr(rest, 1, q - 1)

      if (match(rest, /[[:space:]]--+[[:space:]]/)) {
        rules = substr(rest, 1, RSTART - 1); desc = substr(rest, RSTART + RLENGTH)
      } else { rules = rest; desc = "" }

      probe = rules; gsub(/[[:space:]]/, " ", probe)   # ASCII 공백만 정규화 → NBSP·전각공백·제로폭은 남는다
      if (probe ~ /[^ -~]/) {
        fail(NR, "disable 지시자의 규칙명에 ASCII 가 아닌 문자가 있습니다(규칙 (5): NBSP·전각공백·제로폭). 우회로 취급합니다.")
        next
      }
      rules = trim(rules); desc = trim(desc)
      unquoted = rules; gsub(QUOTES, "", unquoted)     # ESLint 는 규칙명을 감싼 따옴표를 벗긴다
      padded = " " unquoted " "

      if (rules == "")
        fail(NR, "규칙명 없는 eslint-disable 금지(규칙 (1)). 규칙명을 지정하고 -- 사유를 적으세요.")
      else if (padded ~ RX)
        fail(NR, "아키텍처 규칙은 disable 할 수 없습니다(규칙 (2)): " SQ rules SQ ". 경계를 지키도록 코드를 옮기세요(docs/ARCHITECTURE.md §1).")
      else if (desc == "")
        fail(NR, "disable 에 사유가 없습니다(규칙 (3)). 예: // eslint-disable-next-line " rules " -- <이유>")
    }
  ' "$1"
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
