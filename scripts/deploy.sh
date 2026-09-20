#!/usr/bin/env bash
# 읽기 조건: 배포를 실행하거나, 배포가 자격증명 문제로 실패했을 때.
# 원칙: 자격증명이 없으면 "조용히 성공" 하지 않는다 — 무엇이 왜 없는지 말하고 rc=1 로 멈춘다.
#       CI(.github/workflows/deploy.yml)와 로컬이 같은 wrangler 명령을 타도록 여기 한 곳에 모은다.
#       안전 플래그의 오타(`--dryrun`)가 진짜 배포로 바뀌지 않도록 **모르는 인자는 거절**한다.
set -euo pipefail
cd "$(dirname "$0")/.."

usage() {
  cat >&2 <<'MSG'
사용법: bash scripts/deploy.sh [--dry-run]

  (인자 없음)   Cloudflare Workers 에 실제로 배포한다.
  --dry-run     업로드 대상·바인딩만 해석하고 배포하지 않는다(자격증명 불필요).

  pnpm run deploy / pnpm run deploy:dry-run 이 이 스크립트를 부른다.
  (`pnpm deploy` 는 pnpm 내장 명령이다 — 반드시 `pnpm run deploy`.)
MSG
}

DRY_RUN=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      printf 'ERROR: 알 수 없는 인자입니다: %s\n' "$1" >&2
      printf '       `--dryrun`·`-n` 같은 오타는 받지 않습니다 — 그대로 진행하면 진짜 배포가 됩니다.\n' >&2
      usage
      exit 1
      ;;
  esac
  shift
done

# --- .env 로드(로컬 전용) --------------------------------------------------
# CI 에는 .env 가 없고 시크릿이 환경변수로 들어온다. 이미 있는 값은 덮지 않는다.
# "값처럼 보이지만 값이 아닌 것"(CRLF 의 \r · 공백만 · 인라인 주석)은 여기서 걸러 낸다 —
# 그대로 통과시키면 wrangler 까지 가서 "왜 인증이 안 되지" 로만 보인다.
#
# 동기화(sync.md) 키는 아래 목록에 없다 — 일부러다. GOOGLE_CLIENT_ID·D1_DATABASE_ID 는
# wrangler.jsonc 에 값이 이미 커밋돼 있어 이 스크립트가 넘겨줄 필요가 없고,
# GOOGLE_CLIENT_SECRET·SESSION_SECRET 은 `wrangler secret put` 으로 한 번 올리면
# Cloudflare 가 보관하는 값이라 배포마다 이 스크립트가 읽어 넘길 대상이 아니다
# (.env.example 의 같은 키 주석 참고). Worker 배포가 실제로 그 두 시크릿을 요구하게
# 되면(worker/index.ts 가 생기는 시점, T-93) 이 자리에 "시크릿 존재 확인 없으면 rc=1"
# 검사를 추가한다 — 지금은 검사할 Worker 자체가 없어 추가하지 않았다.
#
# D1 마이그레이션도 이 스크립트가 아직 적용하지 않는다 — `wrangler deploy` 는 D1 스키마를
# 건드리지 않는다. 지금은 D1 에 테이블이 없어도 Worker 가 없으니 해가 없지만, Worker 코드가
# 붙는 순간(T-93) 마이그레이션 없이 배포하면 첫 요청에서 `no such table` 로 죽는다. T-93 은
# 이 자리에 `wrangler d1 migrations apply tasky --remote` 를 실제 배포 직전 스텝으로 넣어야
# 한다(마이그레이션 파일 `worker/db/migrations/0001_init.sql` 이 그때 생긴다 — 지금은 없다).
if [ -f .env ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    line=${line%$'\r'} # CRLF 파일의 줄 끝 \r
    case "$line" in '' | \#*) continue ;; esac
    key=${line%%=*}
    val=${line#*=}
    case "$key" in CLOUDFLARE_ACCOUNT_ID | CLOUDFLARE_API_TOKEN | DEPLOY_URL) ;; *) continue ;; esac
    case "$val" in
      \"*\" | \'*\')
        # 따옴표로 감싼 값은 안을 그대로 보존한다(값 안의 =·#·공백은 값이다).
        val=${val#\"}
        val=${val%\"}
        val=${val#\'}
        val=${val%\'}
        ;;
      *)
        # 따옴표가 없을 때만: 공백 뒤의 `#` 부터는 인라인 주석이다. 그 뒤 앞뒤 공백을 턴다.
        # (`abc#d` 처럼 공백 없이 붙은 `#` 는 값의 일부다 — 건드리지 않는다.)
        case "$val" in *[$' \t']'#'*) val=${val%%[$' \t']'#'*} ;; esac
        val=${val#"${val%%[![:space:]]*}"}
        val=${val%"${val##*[![:space:]]}"}
        ;;
    esac
    if [ -z "$val" ]; then
      printf 'WARN: .env 의 %s 값이 비어 있습니다(공백·주석 제거 후) — 무시합니다.\n' "$key" >&2
      continue
    fi
    # `key` 는 바로 위 case 로 세 리터럴 중 하나로 좁혀진 뒤라 eval 에 주입 경로가 없다.
    # case 를 넓힐 때는 이 줄도 같이 본다.
    if [ -z "$(eval "printf '%s' \"\${$key:-}\"")" ]; then export "$key=$val"; fi
  done < .env
fi

# --- 자격증명 검사 ----------------------------------------------------------
# `--dry-run` 은 wrangler 가 네트워크를 타지 않으므로 자격증명을 요구하지 않는다 —
# Cloudflare 계정이 없는 기여자도 업로드 대상·바인딩 해석을 확인할 수 있어야 한다(CLAUDE.md §5).
if [ "$DRY_RUN" -eq 0 ]; then
  missing=0
  note() {
    printf 'ERROR: %s\n' "$1" >&2
    missing=1
  }
  [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ] && note "CLOUDFLARE_ACCOUNT_ID 가 비어 있습니다."
  [ -z "${CLOUDFLARE_API_TOKEN:-}" ] && note "CLOUDFLARE_API_TOKEN 이 비어 있습니다."
  if [ "$missing" -eq 1 ]; then
    cat >&2 <<'MSG'

  로컬: cp .env.example .env  후 .env 의 빈 값을 채우세요(발급 방법은 그 파일 주석에).
  CI  : 레포 Settings → Secrets and variables → Actions 에 같은 이름으로 등록하세요.
  자격증명 없이 설정만 확인하려면: pnpm run deploy:dry-run
MSG
    exit 1
  fi
fi

# --- 산출물 검사 ------------------------------------------------------------
# "빌드가 없는데 배포 성공" 을 막는다. **비어 있는 파일도 없는 것으로 친다** — 빈 index.html 이
# 그대로 올라가면 배포는 성공하고 사이트만 빈다(CI deploy.yml 의 `-s` 와 같은 기준).
for f in dist/client/index.html dist/client/sw.js dist/client/manifest.webmanifest; do
  [ -s "$f" ] || {
    printf 'ERROR: 산출물이 없거나 비어 있습니다: %s — 먼저 pnpm build 를 실행하세요.\n' "$f" >&2
    exit 1
  }
done

# --- 실행 -------------------------------------------------------------------
if [ "$DRY_RUN" -eq 1 ]; then
  exec pnpm exec wrangler deploy --config wrangler.jsonc --dry-run --outdir dist/dry-run
fi
exec pnpm exec wrangler deploy --config wrangler.jsonc
