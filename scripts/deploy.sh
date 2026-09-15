#!/usr/bin/env bash
# 읽기 조건: 배포를 실행하거나, 배포가 자격증명 문제로 실패했을 때.
# 원칙: 자격증명이 없으면 "조용히 성공" 하지 않는다 — 무엇이 왜 없는지 말하고 rc=1 로 멈춘다.
#       CI(.github/workflows/deploy.yml)와 로컬이 같은 wrangler 명령을 타도록 여기 한 곳에 모은다.
set -euo pipefail
cd "$(dirname "$0")/.."

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

# --- .env 로드(로컬 전용) --------------------------------------------------
# CI 에는 .env 가 없고 시크릿이 환경변수로 들어온다. 이미 있는 값은 덮지 않는다.
if [ -f .env ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|\#*) continue ;; esac
    key=${line%%=*}
    val=${line#*=}
    case "$key" in CLOUDFLARE_ACCOUNT_ID|CLOUDFLARE_API_TOKEN|DEPLOY_URL) ;; *) continue ;; esac
    # 앞뒤 따옴표만 벗긴다(값 안의 문자는 건드리지 않는다)
    val=${val#\"}; val=${val%\"}; val=${val#\'}; val=${val%\'}
    [ -z "$val" ] && continue
    if [ -z "$(eval "printf '%s' \"\${$key:-}\"")" ]; then export "$key=$val"; fi
  done < .env
fi

# --- 자격증명 검사 ----------------------------------------------------------
missing=0
note() { printf 'ERROR: %s\n' "$1" >&2; missing=1; }
[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ] && note "CLOUDFLARE_ACCOUNT_ID 가 비어 있습니다."
[ -z "${CLOUDFLARE_API_TOKEN:-}" ]  && note "CLOUDFLARE_API_TOKEN 이 비어 있습니다."
if [ "$missing" -eq 1 ]; then
  cat >&2 <<'MSG'

  로컬: cp .env.example .env  후 .env 의 빈 값을 채우세요(발급 방법은 그 파일 주석에).
  CI  : 레포 Settings → Secrets and variables → Actions 에 같은 이름으로 등록하세요.
MSG
  exit 1
fi

# --- 산출물 검사 ------------------------------------------------------------
# "빌드가 없는데 배포 성공" 을 막는다.
for f in dist/server/wrangler.json dist/client/index.html dist/client/sw.js; do
  [ -f "$f" ] || { printf 'ERROR: 산출물이 없습니다: %s — 먼저 pnpm build 를 실행하세요.\n' "$f" >&2; exit 1; }
done

# --- 실행 -------------------------------------------------------------------
if [ "$DRY_RUN" -eq 1 ]; then
  exec pnpm exec wrangler deploy --config dist/server/wrangler.json --dry-run --outdir dist/dry-run
fi
exec pnpm exec wrangler deploy --config dist/server/wrangler.json
