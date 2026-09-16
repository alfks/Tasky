#!/usr/bin/env bash
# 읽기 조건: 이 검사에 막혔을 때, 또는 새 비밀 파일 패턴을 추가할 때.
#
# `.env` 계열(실제 자격증명이 들어가는 파일)이 레포에 들어오는 걸 막는다. `.gitignore` 는
# `git add -f` 한 방에 뚫리므로 ignore 규칙만으로는 부족하다 — 그래서 훅과 check.sh 둘 다 이걸 부른다.
#
# 모드:
#   --staged   인덱스(스테이징된 파일)를 본다. pre-commit 훅이 쓴다. 커밋 **전에** 막는 유일한 지점.
#   (인자 없음) 추적 중인 파일 전체를 본다. check.sh 가 쓴다. 이미 들어가 버린 걸 뒤늦게 잡는다.
#
# 허용 예외는 `.env.example` 하나다(자격증명 없는 템플릿, 일부러 커밋한다).
# 한계(실측 8종 중 차단 4 / 통과 4): 이 검사는 **파일명만** 본다.
#   차단 = `.env` `.env.local` `.env.production` `config/.env.staging`(경로 어디든)
#          + 대소문자 변형 `.ENV` `.Env` · 후행 공백 `.env ` (정규화 후 판정)
#   통과 = `.env.example`(의도된 예외, **정확히 이 철자만**) · `.environment` `env` `my.env`
# 즉 `foo.env` 처럼 접미사형 이름이나, 아예 다른 이름의 파일에 적은 토큰은 잡지 못한다.
# 이 목록은 `.gitignore` 의 `.env` / `.env.*` 규칙과 같은 범위다 — 둘이 어긋나면 한쪽이 빈다.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

mode="${1:-}"
case "$mode" in
  --staged) listing="스테이징된"; files=$(git diff --cached --name-only --diff-filter=ACMR) ;;
  '')       listing="추적 중인";  files=$(git ls-files) ;;
  *)        echo "사용법: $0 [--staged]" >&2; exit 2 ;;
esac

# `.env`, `.env.local`, `path/.env.production` … 은 잡고 `.env.example` 만 뺀다.
# 경로 어디에 있든 잡도록 basename 으로 판정한다.
# 판정은 **정규화한 이름**으로 한다. 대소문자 변형(`.ENV`)과 후행 공백(`.env `)이 실제로 통과했었다 —
# macOS·Windows 의 대소문자 무시 파일시스템에서는 `.ENV` 가 곧 `.env` 라서 더 위험하다.
# 면제는 **정확히 `.env.example`** 하나뿐이다(대소문자 변형은 면제하지 않는다 — 막는 쪽으로 틀린다).
shopt -s extglob
bad=""
while IFS= read -r f; do
  [ -z "$f" ] && continue
  base=${f##*/}
  [ "$base" = ".env.example" ] && continue
  key=${base,,}                 # 소문자화
  key=${key%%+([[:space:]])}    # 후행 공백·탭 제거
  case "$key" in
    .env|.env.*) bad="$bad$f"$'\n' ;;
  esac
done <<< "$files"

if [ -n "$bad" ]; then
  echo "ERROR: $listing 파일에 자격증명 파일이 있습니다 — 커밋하면 토큰이 레포에 영구히 남습니다:"
  printf '%s' "$bad" | sed 's/^/  - /'
  echo
  echo "고치기:"
  echo "  git restore --staged <파일>        # 스테이징만 되어 있을 때"
  echo "  git rm --cached <파일>             # 이미 추적 중일 때(파일 자체는 남는다)"
  echo "  값은 .env 에 두고, 템플릿만 .env.example 에 커밋한다."
  exit 1
fi

echo "OK $listing 파일에 .env 계열 없음(.env.example 제외)"
