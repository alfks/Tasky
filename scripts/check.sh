#!/usr/bin/env bash
# 읽기 조건: 커밋/PR 직전에 CI guard/build 잡과 같은 검사를 로컬에서 한 번에 돌릴 때,
#           또는 CI 스텝이 어떤 검사를 호출하는지 확인할 때.
# 사용법:
#   bash scripts/check.sh [base]                모든 검사를 순서대로 실행, 요약 출력 (base 기본값 main)
#   bash scripts/check.sh <step> [base 또는 인자]  검사 하나만 실행, 그 검사의 exit code 그대로 반환
# step 이름: forbidden-words | env-secrets | agents-md | author | wt | arch | lint | typecheck | format | test
#
# 이 스크립트가 검사 목록의 단일 소스다. .github/workflows/ci.yml 은 guard/build 각 잡에서
# 이 스크립트를 `--guard`/`--build` 로 한 번씩만 호출한다(로직 중복 없음). 스텝을 검사마다
# 쪼개지 않고 묶은 이유: run_step 이 개별 검사가 실패해도 나머지를 계속 돌려 "요약: 통과 N / 실패 M"
# 까지 한 번의 실행에서 전부 보여주기 때문 — 스텝을 쪼개 fail-fast 하면 첫 실패 이후 것들을
# 그 CI 실행에서는 볼 수 없다. 어느 검사가 실패했는지는 로그의 "FAIL: <라벨>" 줄과(CI에서는)
# 아래 run_step 의 `::error::` 애노테이션으로 확인한다.
# package.json 이 없으면(스캐폴딩 전) pnpm 관련 검사는 SKIP.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

has_pnpm() { [ -f package.json ] && command -v pnpm >/dev/null 2>&1; }
skip_pnpm() { echo "SKIP: package.json 없음(스캐폴딩 전) 또는 pnpm 미설치"; }
# has_pnpm && CMD || skip_pnpm 형태는 쓰지 않는다 — CMD 가 실패하면 || 분기가 같이 돌아서
# skip_pnpm(rc=0)으로 실패를 덮어 false green 이 된다(AGENTS.md 규칙 6 위반). if/else로 분리한다.

step_forbidden_words() { bash scripts/check-forbidden-words.sh "$@"; }
# env-secrets: 추적 파일 전체를 본다(이미 들어간 것 탐지). 커밋 **전** 차단은 .githooks/pre-commit 이
# 같은 스크립트를 --staged 로 부르는 쪽이다 — 여기서만 보면 이미 늦는다.
step_env_secrets()     { bash scripts/check-env-secrets.sh; }
step_agents_md()       { bash scripts/check-agents-md.sh; }
step_author()          { bash scripts/check-author.sh "${1:-main}"; }
# arch: 레이어 경계 픽스처 + 아키텍처 규칙 2차 패스(--no-inline-config, ADR-0008). node_modules 가 필요하므로
# guard 가 아니라 build 에 있다 — 스캐폴딩 전에는 check-arch.sh 가 스스로 SKIP 한다.
step_arch()            { if has_pnpm; then bash scripts/check-arch.sh; else skip_pnpm; fi; }
step_lint()            { if has_pnpm; then pnpm lint; else skip_pnpm; fi; }
step_typecheck()       { if has_pnpm; then pnpm typecheck; else skip_pnpm; fi; }
step_test()            { if has_pnpm; then pnpm test -- --reporter=dot; else skip_pnpm; fi; }
step_format()          { if has_pnpm; then pnpm format:check; else skip_pnpm; fi; }
step_wt()              { bash scripts/test-wt.sh; }
# package.json 이 생기고 나면(스캐폴딩 후) 위 4개(step_arch/lint/typecheck/test)를 "pnpm check"
# 하나로 위임하는 편이 스크립트-package.json 중복을 줄인다. 지금은 package.json 자체가 없어
# 그 스크립트가 존재하지 않으므로, 개별 pnpm 명령을 직접 호출하는 현재 형태를 유지한다.

case "${1:-}" in
  forbidden-words|env-secrets|agents-md|author|arch|lint|typecheck|test|format|wt)
    step="$1"; shift
    "step_${step//-/_}" "$@"
    exit $?
    ;;
esac

MODE=""
case "${1:-}" in
  --guard|--build) MODE="$1"; shift;;
esac

BASE="${1:-main}"

pass=0
fail_count=0
failed_labels=""   # 실패한 검사 라벨(개행 구분) — 요약에 그대로 다시 찍는다
run_step() { # $1 라벨, 나머지는 명령
  local label="$1"; shift
  echo "-- $label --"
  if "$@"; then
    echo "PASS: $label"
    pass=$((pass + 1))
  else
    echo "FAIL: $label"
    [ "${GITHUB_ACTIONS:-}" = "true" ] && echo "::error title=${label}::${label} 실패 — 위 로그 참조"
    fail_count=$((fail_count + 1))
    failed_labels="${failed_labels}${label}
"
  fi
  echo
}

run_guard() {
  run_step "금지어 검사"              step_forbidden_words
  run_step "자격증명 파일(.env) 검사"   step_env_secrets
  run_step "AGENTS.md 구조 검사"       step_agents_md
  run_step "author/커밋 메시지 검사 ($BASE)" step_author "$BASE"
}
run_build() {
  run_step "레이어 경계 린트 검증 + 아키텍처 2차 패스" step_arch
  run_step "pnpm lint"                step_lint
  run_step "pnpm typecheck"           step_typecheck
  run_step "pnpm format:check"        step_format
  run_step "pnpm test"                step_test
}

case "$MODE" in
  --guard) run_guard ;;
  --build) run_build ;;
  *)
    run_guard
    run_step "wt.sh 스모크 테스트"       step_wt
    run_build
    ;;
esac

echo "=================================="
echo "요약: 통과 $pass / 실패 $fail_count"
if [ "$fail_count" -eq 0 ]; then
  echo "OK: 로컬 검사 통과 — CI guard/build 잡과 동일"
  exit 0
else
  # 어떤 검사가 실패했는지 여기서 이름으로 다시 말한다. 예전에는 요약에 숫자만 있고 그 아래에
  # __arch__ 잔여물 안내가 **무조건** 붙어 있어서, 원인이 전혀 다른 실패까지 "check-arch.sh 비정상 종료 흔적"
  # 으로 오진하게 만들었다(T-62 실측: 잔여물 1개가 pnpm typecheck 를 죽여 "통과 9 / 실패 1" 이 났는데
  # 화면은 arch 를 가리켰다 — arch 는 PASS 였다). 안내는 잔여물이 실제로 있을 때만 붙인다.
  echo "FAIL: 다음 검사가 실패했습니다 — 위 로그에서 해당 '-- 라벨 --' 구간을 보세요:"
  printf '%s' "$failed_labels" | sed 's/^/  - /'
  stale=0
  [ -d src ] && stale="$(find src -type d -name __arch__ -prune 2>/dev/null | wc -l | tr -d ' ')"
  if [ "${stale:-0}" -gt 0 ]; then
    echo "힌트: src/**/__arch__ 잔여물 ${stale}개가 남아 있습니다(check-arch.sh 비정상 종료 흔적)."
    echo "      .gitignore 에 걸려 git status 에는 안 보이지만 pnpm typecheck 를 실패시킵니다."
    echo "      bash scripts/check-arch.sh 를 한 번 돌리면 스스로 지웁니다(또는 find src -type d -name __arch__ -prune -exec rm -rf {} +)."
  fi
  exit 1
fi
