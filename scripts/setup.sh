#!/usr/bin/env bash
# 읽기 조건: 최초 셋업이 실패했을 때. 사용: bash scripts/setup.sh  (클론 직후 1회, 또는 훅이 안 돌 때 재실행)
# 재실행은 안전(idempotent)하다. 워크트리 안에서 실행해도 되며, 그 경우 BOARD 초기화만 건너뛴다
# (워크트리는 메인 트리와 레포 config 를 공유하므로 그 외 단계는 그대로 다시 돈다).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# 1) 커밋 author 고정 (레포 로컬 config — 모든 워크트리 공유)
git config user.name  "alfks"
git config user.email "millie020524@gmail.com"

# 2) 로컬 훅 활성화 (상대 경로 → 각 워크트리의 .githooks/ 가 쓰임)
git config core.hooksPath .githooks

# 3) 협업에 유리한 기본값
git config pull.rebase true
git config rebase.autoStash true
git config push.autoSetupRemote true
git config fetch.prune true

# 4) 실행 권한(실행 대상만 — .githooks/AGENTS.md 같은 문서 파일은 건드리지 않는다.
#    잘못 주면 클론 직후 git status 가 더러워진다) + 워크트리 보드 준비(메인 트리에서만)
chmod +x scripts/*.sh 2>/dev/null || true
find .githooks -maxdepth 1 -type f ! -name '*.md' -exec chmod +x {} + 2>/dev/null || true
# 워크트리 안에서는 wt.sh 자체가 실행을 거부한다(.git 이 파일이면 워크트리) — BOARD.md는
# 메인 트리에만 있고 모든 워크트리가 공유하므로, 워크트리 안에서는 재실행 시 조용히 건너뛴다.
if [ -f .git ]; then
  echo "INFO: 워크트리 안에서 실행 중 — BOARD 초기화(wt.sh init)는 메인 트리 전용이라 건너뜁니다."
else
  bash scripts/wt.sh init
fi

# 5) 의존성 (스캐폴딩 후에만)
if [ -f package.json ]; then
  if ! command -v pnpm >/dev/null 2>&1; then
    corepack enable 2>/dev/null && corepack prepare pnpm@10 --activate 2>/dev/null || echo "WARN: pnpm 을 찾지 못했습니다. https://pnpm.io/installation"
  fi
  command -v pnpm >/dev/null 2>&1 && pnpm install --prefer-offline
fi

echo "OK setup 완료"
echo "  author     : $(git config user.name) <$(git config user.email)>"
echo "  hooksPath  : $(git config core.hooksPath)"
echo "  worktrees  : $(git rev-parse --show-toplevel)/.worktrees  (bash scripts/wt.sh new <type>/<name>)"
