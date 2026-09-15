#!/usr/bin/env bash
# 읽기 조건: 커밋/PR 직전에 CI guard 잡과 같은 검사를 로컬에서 한 번에 돌릴 때.
# 사용법: bash scripts/check.sh [base]   (base 기본값 main — check-author.sh 에 그대로 전달)
# CI guard 잡(.github/workflows/ci.yml)과 같은 스크립트를 같은 순서로 호출한다.
# package.json 이 있으면(스캐폴딩 후) pnpm lint/typecheck/test 도 이어서 돈다.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
BASE="${1:-main}"

pass=0
fail_count=0
run_step() { # $1 라벨, 나머지는 명령
  local label="$1"; shift
  echo "-- $label --"
  if "$@"; then
    echo "PASS: $label"
    pass=$((pass + 1))
  else
    echo "FAIL: $label"
    fail_count=$((fail_count + 1))
  fi
  echo
}

run_step "금지어 검사"        bash scripts/check-forbidden-words.sh
run_step "AGENTS.md 구조 검사" bash scripts/check-agents-md.sh
run_step "eslint-disable 정책 검사" bash scripts/check-eslint-disable.sh
run_step "author/커밋 메시지 검사 ($BASE)" bash scripts/check-author.sh "$BASE"

if [ -f package.json ] && command -v pnpm >/dev/null 2>&1; then
  run_step "pnpm lint"      pnpm lint
  run_step "레이어 경계 린트 검증" bash scripts/check-arch.sh
  run_step "pnpm typecheck" pnpm typecheck
  run_step "pnpm test"      pnpm test -- --reporter=dot
else
  echo "-- pnpm lint/typecheck/test --"
  echo "SKIP: package.json 없음(스캐폴딩 전) 또는 pnpm 미설치"
  echo
fi

echo "=================================="
echo "요약: 통과 $pass / 실패 $fail_count"
if [ "$fail_count" -eq 0 ]; then
  echo "OK: 로컬 검사 통과 — CI guard 잡과 동일"
  exit 0
else
  echo "FAIL: 위 실패 항목을 고친 뒤 다시 실행하세요"
  exit 1
fi
