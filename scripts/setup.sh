#!/usr/bin/env bash
# 읽기 조건: 최초 셋업이 실패했을 때. 사용: bash scripts/setup.sh  (클론 직후 1회. 워크트리는 레포 config를 공유하므로 재실행 불필요)
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

# 4) 실행 권한 + 워크트리 보드 준비
chmod +x scripts/*.sh .githooks/* 2>/dev/null || true
bash scripts/wt.sh init

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
