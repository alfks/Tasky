#!/usr/bin/env bash
# 읽기 조건: 커밋/PR 직전에 CI guard/build 잡과 같은 검사를 로컬에서 한 번에 돌릴 때,
#           또는 CI 스텝이 어떤 검사를 호출하는지 확인할 때.
# 사용법:
#   bash scripts/check.sh [base]                모든 검사를 순서대로 실행, 요약 출력 (base 기본값 main)
#   bash scripts/check.sh <step> [base 또는 인자]  검사 하나만 실행, 그 검사의 exit code 그대로 반환
# step 이름: forbidden-words | agents-md | eslint-disable | author | wt | arch | lint | typecheck | test
#
# 이 스크립트가 검사 목록의 단일 소스다. .github/workflows/ci.yml 은 각 스텝에서 이 스크립트를
# step 이름으로 호출하기만 한다(로직 중복 없음) — 그러면서도 스텝을 나눠 부르므로 어느 검사가
# 실패했는지 GitHub Actions UI 에 스텝 단위로 그대로 뜬다(하나로 합치면 이 이점을 잃는다).
# package.json 이 없으면(스캐폴딩 전) pnpm 관련 검사는 SKIP.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

has_pnpm() { [ -f package.json ] && command -v pnpm >/dev/null 2>&1; }
skip_pnpm() { echo "SKIP: package.json 없음(스캐폴딩 전) 또는 pnpm 미설치"; }
# has_pnpm && CMD || skip_pnpm 형태는 쓰지 않는다 — CMD 가 실패하면 || 분기가 같이 돌아서
# skip_pnpm(rc=0)으로 실패를 덮어 false green 이 된다(AGENTS.md 규칙 6 위반). if/else로 분리한다.

step_forbidden_words() { bash scripts/check-forbidden-words.sh "$@"; }
step_agents_md()       { bash scripts/check-agents-md.sh; }
step_eslint_disable()  { bash scripts/check-eslint-disable.sh; }
step_author()          { bash scripts/check-author.sh "${1:-main}"; }
step_arch()            { if has_pnpm; then bash scripts/check-arch.sh; else skip_pnpm; fi; }
step_lint()            { if has_pnpm; then pnpm lint; else skip_pnpm; fi; }
step_typecheck()       { if has_pnpm; then pnpm typecheck; else skip_pnpm; fi; }
step_test()            { if has_pnpm; then pnpm test -- --reporter=dot; else skip_pnpm; fi; }
step_wt()              { bash scripts/test-wt.sh; }
# package.json 이 생기고 나면(스캐폴딩 후) 위 4개(step_arch/lint/typecheck/test)를 "pnpm check"
# 하나로 위임하는 편이 스크립트-package.json 중복을 줄인다. 지금은 package.json 자체가 없어
# 그 스크립트가 존재하지 않으므로, 개별 pnpm 명령을 직접 호출하는 현재 형태를 유지한다.

case "${1:-}" in
  forbidden-words|agents-md|eslint-disable|author|arch|lint|typecheck|test|wt)
    step="$1"; shift
    "step_${step//-/_}" "$@"
    exit $?
    ;;
esac

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

run_step "금지어 검사"              step_forbidden_words
run_step "AGENTS.md 구조 검사"       step_agents_md
run_step "eslint-disable 정책 검사"  step_eslint_disable
run_step "author/커밋 메시지 검사 ($BASE)" step_author "$BASE"
run_step "wt.sh 스모크 테스트"       step_wt
run_step "레이어 경계 린트 검증"      step_arch
run_step "pnpm lint"                step_lint
run_step "pnpm typecheck"           step_typecheck
run_step "pnpm test"                step_test

echo "=================================="
echo "요약: 통과 $pass / 실패 $fail_count"
if [ "$fail_count" -eq 0 ]; then
  echo "OK: 로컬 검사 통과 — CI guard/build 잡과 동일"
  exit 0
else
  echo "FAIL: 위 실패 항목을 고친 뒤 다시 실행하세요"
  exit 1
fi
