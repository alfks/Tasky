#!/usr/bin/env bash
# 읽기 조건: 이 검사가 실패했을 때.
# 사용법:
#   bash scripts/check-author.sh [base]              base..HEAD 모든 커밋의 author · 제목 형식 · AI 서명 검증 (기본 main, origin/main 우선)
#   bash scripts/check-author.sh --message-file <f>  커밋 메시지 파일: 제목 형식 + 길이 + AI 서명  (commit-msg 훅, PR 제목)
#   bash scripts/check-author.sh --body-file <f>     자유 텍스트(PR 본문): AI 서명만
set -euo pipefail

EXPECTED_NAME="alfks"
EXPECTED_EMAIL="millie020524@gmail.com"
TYPES='feat|fix|refactor|docs|chore|test|style|perf|ci'
SUBJECT_RE="^(${TYPES})(\([a-z0-9._/-]+\))?!?: .+$"
# AI 도구 서명/트레일러 패턴 (대소문자 무시). 커밋·PR에 AI 흔적을 남기지 않는 규칙(CLAUDE.md §1-1).
AI_RE='co-authored-by:.*(claude|anthropic|copilot|chatgpt|openai|gemini|gpt|noreply@anthropic)|generated with.*(claude|copilot|chatgpt|gemini|cursor|codex)|claude-session:|claude\.ai/code|🤖'

fail=0
say_fail() { echo "FAIL: $*"; fail=1; }

# UTF-8 코드포인트 수(로케일 비의존). ${#s} 는 로케일이 없는 컨테이너(C 로케일)에서 바이트를 세어
# 한글 제목을 3배로 과대 계산한다. 연속 바이트(0x80-0xBF)를 지우고 남은 바이트 수 = 코드포인트 수.
cp_len() { LC_ALL=C printf '%s' "$1" | LC_ALL=C tr -d '\200-\277' | LC_ALL=C wc -c | tr -d ' '; }

check_ai_text() { # $1 label, $2 text
  local hits
  hits="$(printf '%s\n' "$2" | grep -niE "$AI_RE" || true)"
  if [ -n "$hits" ]; then
    say_fail "$1 에 AI 서명/트레일러가 있습니다 (제거 후 다시):"
    printf '%s\n' "$hits" | sed 's/^/    /'
  fi
}

check_subject() { # $1 label, $2 subject
  local label="$1" subject="$2"
  case "$subject" in "Revert "*|"Merge "*) return 0 ;; esac
  if ! printf '%s' "$subject" | grep -qE "$SUBJECT_RE"; then
    say_fail "$label 제목 형식 위반: '$subject' → '<type>(<scope>): <한국어 제목>'  (type: ${TYPES})"
  fi
  local n; n="$(cp_len "$subject")"
  if [ "$n" -gt 72 ]; then
    say_fail "$label 제목이 72자를 넘습니다 (${n}자)"
  fi
}

first_nonempty_line() { grep -m1 -vE '^[[:space:]]*$' || true; }

mode="${1:-main}"
case "$mode" in
  --message-file)
    f="${2:?메시지 파일 경로 필요}"
    msg="$(grep -vE '^[[:space:]]*#' "$f" || true)"
    subject="$(printf '%s\n' "$msg" | first_nonempty_line)"
    if [ -z "$subject" ]; then say_fail "커밋 메시지가 비어 있습니다"; else check_subject "커밋 메시지" "$subject"; fi
    check_ai_text "커밋 메시지" "$msg"
    ;;
  --body-file)
    f="${2:?파일 경로 필요}"
    [ -f "$f" ] || { echo "FAIL: 검사 대상 파일이 없습니다: $f"; exit 1; }
    check_ai_text "본문" "$(cat "$f")"
    ;;
  --*)
    echo "알 수 없는 옵션: $mode"; sed -n '2,7p' "$0"; exit 2
    ;;
  *)
    base="$mode"
    range_base="$base"
    git rev-parse --verify -q "origin/$base" >/dev/null 2>&1 && range_base="origin/$base"
    git rev-parse --verify -q "$range_base" >/dev/null 2>&1 || { echo "FAIL: 기준 브랜치 '$range_base' 를 찾을 수 없습니다 (git fetch origin $base)"; exit 1; }
    commits="$(git rev-list "$range_base..HEAD")"
    if [ -z "$commits" ]; then echo "OK: $range_base..HEAD 에 커밋 없음"; exit 0; fi
    for c in $commits; do
      short="$(git rev-parse --short "$c")"
      an="$(git log -1 --format=%an "$c")"; ae="$(git log -1 --format=%ae "$c")"
      if [ "$an" != "$EXPECTED_NAME" ] || [ "$ae" != "$EXPECTED_EMAIL" ]; then
        say_fail "$short author '$an <$ae>' ≠ '$EXPECTED_NAME <$EXPECTED_EMAIL>'"
      fi
      check_subject "$short" "$(git log -1 --format=%s "$c")"
      check_ai_text "$short 메시지" "$(git log -1 --format=%B "$c")"
    done
    if [ "$fail" -ne 0 ]; then
      cat <<HELP
고치기 (본인 브랜치, 머지 전):
  git rebase $range_base --exec 'git commit --amend --no-edit --author="$EXPECTED_NAME <$EXPECTED_EMAIL>"'
  # 메시지(제목/트레일러) 수정: git rebase -i $range_base  (대화형 불가 환경: git reset --soft $range_base && git commit)
  git push --force-with-lease
HELP
    fi
    ;;
esac

[ "$fail" -eq 0 ] && echo "OK: author/메시지 검증 통과"
exit "$fail"
