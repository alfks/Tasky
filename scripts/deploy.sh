#!/usr/bin/env bash
# 읽기 조건: 배포를 실행하거나, 배포가 자격증명 문제로 실패했을 때.
# 원칙: 자격증명이 없으면 "조용히 성공" 하지 않는다 — 무엇이 왜 없는지 말하고 rc=1 로 멈춘다.
#       CI(.github/workflows/deploy.yml)와 로컬이 같은 wrangler 명령을 타도록 여기 한 곳에 모은다.
#       안전 플래그의 오타(`--dryrun`)가 진짜 배포로 바뀌지 않도록 **모르는 인자는 거절**한다.
set -euo pipefail
cd "$(dirname "$0")/.."

usage() {
  cat >&2 <<'MSG'
사용법: bash scripts/deploy.sh [--dry-run] [--skip-build]

  (인자 없음)   Cloudflare Workers 에 실제로 배포한다.
  --dry-run     업로드 대상·바인딩만 해석하고 배포하지 않는다(자격증명 불필요).
  --skip-build  실제 배포 전 자동 `pnpm build` 를 건너뛴다(방금 직접 빌드했을 때만).

  pnpm run deploy / pnpm run deploy:dry-run 이 이 스크립트를 부른다.
  (`pnpm deploy` 는 pnpm 내장 명령이다 — 반드시 `pnpm run deploy`.)
MSG
}

DRY_RUN=0
SKIP_BUILD=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
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
# (.env.example 의 같은 키 주석 참고). **T-93 부터 Worker(worker/index.ts)가 실제로 그 두
# 시크릿을 요구한다** — 아래 "Worker 시크릿 검사" 절이 `wrangler secret list` 로 존재만 확인한다
# (값은 절대 읽지 않는다 — 존재 여부만).
#
# D1 마이그레이션은 `wrangler deploy` 가 건드리지 않으므로 이 스크립트가 실제 배포 직전에
# `wrangler d1 migrations apply tasky --remote` 로 직접 적용한다(아래 실제 배포 절, T-93/#126 —
# 마이그레이션 파일은 `worker/db/migrations/0001_init.sql`). Worker 가 붙은 뒤로 마이그레이션 없이
# 배포하면 첫 요청이 `no such table` 로 죽기 때문이다. `--dry-run` 은 이 스텝과 위 시크릿 검사를
# 둘 다 건너뛴다(네트워크를 타지 않는다) — 그래서 dry-run 초록은 D1·시크릿 상태를 보증하지 않는다.
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

# --- Worker 시크릿 검사(T-93) ------------------------------------------------
# GOOGLE_CLIENT_SECRET·SESSION_SECRET 은 `wrangler secret put` 으로 한 번 올리면 Cloudflare 가 보관하는
# 값이라(.env.example 참고) 이 스크립트가 넘기지 않는다 — 대신 **존재만** 확인한다. 없으면 첫 요청에서
# `env.GOOGLE_CLIENT_SECRET`/`env.SESSION_SECRET` 이 undefined 인 채로 배포가 "성공"해 버리고, 로그인·
# 세션 검증이 배포 뒤에야 원인 불명으로 깨진다 — 조용히 건너뛰지 않는다(CLAUDE.md §5 원칙).
# `--dry-run` 은 네트워크를 타지 않으므로 이 검사도 건너뛴다(자격증명 검사와 같은 이유).
if [ "$DRY_RUN" -eq 0 ]; then
  secrets_json="$(pnpm exec wrangler secret list --config wrangler.jsonc --format json 2>/dev/null)" || {
    printf 'ERROR: wrangler secret list 를 실행하지 못했습니다 — CLOUDFLARE_API_TOKEN 권한(Workers Scripts:Edit)을 확인하세요.\n' >&2
    exit 1
  }
  secrets_missing=0
  for name in GOOGLE_CLIENT_SECRET SESSION_SECRET; do
    # JSON 파싱은 node 로 한다 — grep 의 공백 유무 가정(`"name":"x"` vs `"name": "x"`)에 기대지 않는다.
    if ! printf '%s' "$secrets_json" | node -e '
let s = "";
process.stdin.on("data", (d) => (s += d));
process.stdin.on("end", () => {
  let list;
  try { list = JSON.parse(s); } catch { process.exit(1); }
  process.exit(Array.isArray(list) && list.some((x) => x && x.name === process.argv[1]) ? 0 : 1);
});
' "$name"; then
      printf 'ERROR: Cloudflare Worker 시크릿 %s 가 없습니다.\n' "$name" >&2
      printf '       wrangler secret put %s\n' "$name" >&2
      secrets_missing=1
    fi
  done
  [ "$secrets_missing" -eq 0 ] || exit 1
fi

# --- 빌드(T-106) ------------------------------------------------------------
# 실제 배포는 여기서 직접 빌드한다 — 낡은 dist/client 가 Worker·D1 만 최신으로 올라간 채 정적 자산만
# 옛것으로 나가는 사고를 막는다. dry-run 은 네트워크·빌드 없이 현행 산출물만 본다.
if [ "$DRY_RUN" -eq 0 ] && [ "$SKIP_BUILD" -eq 0 ]; then
  pnpm build || {
    printf 'ERROR: pnpm build 에 실패했습니다 — 배포를 멈춥니다.\n' >&2
    exit 1
  }
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

# D1 마이그레이션은 Worker 코드보다 **먼저** 적용한다 — 마이그레이션 없이 새 Worker 코드부터
# 나가면 그 사이의 첫 요청들이 `no such table` 로 죽는다(worker/db/migrations/0001_init.sql,
# T-93). `wrangler d1 migrations apply` 는 이미 적용된 마이그레이션을 다시 적용하지 않는다
# (자체 `d1_migrations` 추적 테이블) — 안전하게 매 배포마다 부른다.
pnpm exec wrangler d1 migrations apply tasky --config wrangler.jsonc --remote || {
  printf 'ERROR: D1 마이그레이션 적용에 실패했습니다(worker/db/migrations/*.sql) — 배포를 멈춥니다.\n' >&2
  exit 1
}

# 배포본이 어느 커밋인지 GET /api/version 으로 확인할 수 있게 짧은 SHA 를 넣는다(없으면 Worker 가 'dev').
BUILD_SHA=$(git rev-parse --short HEAD 2>/dev/null || printf 'dev')
exec pnpm exec wrangler deploy --config wrangler.jsonc --var "BUILD_SHA:${BUILD_SHA}"
