<!-- 읽기 조건: Phase 3 소셜 로컬 검증·운영 모드·롤백을 준비하거나 검증 결과를 기록할 때. -->

# Phase 3 소셜 운영 준비

이 문서는 로컬 재현 절차다. 원격 Worker·D1의 지연, 비용, 삭제 성능, 실제 Google 로그인, 두 실기기 동작은 아직 검증하지 않았다. `docs/phase3-implementation-plan.md` §6의 수치는 출시 목표이며 로컬 결과가 운영 승인을 뜻하지 않는다. 같은 계획 §5의 axe critical/serious 0건은 활성화 접근성 게이트로 **UNVERIFIED**다. 새 axe 의존성은 별도 결정 전 설치하지 않는다. 실제 P3-08 배포·활성화도 별도 단계다.

## 로컬 부하 시나리오

`node scripts/social-load.mjs`는 기본적으로 네트워크와 파일 쓰기가 없는 계획만 출력한다. 기본 목표는 활성 20계정, 계정당 친구 50명, 각 친구당 공유 1,000개(총 50,000개), 5분씩 3회, 30초 간격의 피드 첫 페이지 조회다. 20계정이 같은 합성 친구 50명을 공유한다. 실제 제품은 계정당 공유 보유 1,000개와 하루 생성 20개 제한이 있으므로 fixture는 로컬 D1에 합성 행을 직접 심고 HTTP 측정은 진짜 Worker 경로로 한다. 이 방식은 게시 API 생성 성능을 측정하지 않는다.

작은 smoke를 먼저 만든다. 작업 트리 안에서 Node 22/pnpm 10.33.0과 frozen lockfile 설치를 사용한다. 예시는 Bash 기준이다.

```bash
pnpm install --frozen-lockfile
node scripts/social-load.mjs --actors 1 --friends 1 --posts 1 --duration-ms 100 --interval-ms 100 --rounds 1
node scripts/social-load.mjs --prepare /tmp/tasky-social-smoke --actors 1 --friends 1 --posts 1 --duration-ms 100 --interval-ms 100 --rounds 1
pnpm build
pnpm exec wrangler d1 migrations apply tasky --local --persist-to .wrangler/social-load
for file in /tmp/tasky-social-smoke/seed-*.sql; do
  pnpm exec wrangler d1 execute tasky --local --persist-to .wrangler/social-load --file "$file"
done
pnpm start --port 8787 --var AUTH_STUB:1 --var SESSION_SECRET:local-only-test \
  --var SOCIAL_MODE:enabled \
  --var "SOCIAL_ALLOWLIST:$(cat /tmp/tasky-social-smoke/allowlist.json)" \
  --persist-to .wrangler/social-load
```

마지막 명령은 별도 터미널에 둔다. 같은 작업 트리와 같은 `.wrangler/social-load`를 사용하고, 서버가 `127.0.0.1:8787`에서 준비된 뒤 다음을 실행한다.

```bash
node scripts/social-load.mjs --run --manifest /tmp/tasky-social-smoke/manifest.json \
  --url http://127.0.0.1:8787/ --actors 1 --friends 1 --posts 1 \
  --duration-ms 100 --interval-ms 100 --rounds 1 > /tmp/tasky-social-smoke/report.json
```

서버를 중단한 뒤 합성 행만 지운다.

```bash
pnpm exec wrangler d1 execute tasky --local --persist-to .wrangler/social-load \
  --file /tmp/tasky-social-smoke/cleanup.sql
```

전체 목표를 로컬에서 시험할 때는 `--actors 20 --friends 50 --posts 1000 --duration-ms 300000 --interval-ms 30000 --rounds 3`을 계획·fixture·실행에 동일하게 명시한다. 새 출력 디렉터리를 사용한다. 계획과 fixture 생성은 미커밋 작업 중에도 가능하며 출력의 `sourceState=HEAD-only-unverified`는 측정 증거가 아니다. 실제 `--run`은 CLI 파일이 현재 작업 트리 안에 있고 작업 트리가 clean commit이며, 현재 HEAD·모든 시나리오 인자·seed SQL/allowlist/cleanup의 SHA-256이 manifest와 일치해야만 시작한다. 따라서 코드 변경을 커밋했다면 fixture를 새로 만든다. fixture 폴더에는 합성 계정 ID와 SQL만 있으며 실사용자의 계정, 쿠키, 토큰, 게시글을 넣지 않는다. 보고서에는 runId·검증된 HEAD·fixture SHA-256·seed·시각·실제 인자·요약 명령·응답 코드 분포·p50/p95/p99와 표본 수·실패 종류만 기록한다. 쿠키, URL 쿼리, 원문 응답은 기록하지 않는다. 검증·로그인·측정 실패도 `status=failed`인 JSON과 0이 아닌 exit로 남기므로 실패 보고서도 지우지 말고 로컬 증거 폴더에 보존한다.

보고서의 `serverIdentity=unverified-loopback`은 해당 포트에서 답한 서버의 빌드 SHA를 CLI가 증명하지 못함을 뜻한다. 실제 Worker 측정으로 기록하려면 서버를 띄운 정확한 작업 트리·HEAD·빌드·migration·명령·포트·시작/종료 시각을 별도 실행 기록에 붙인다. fake loopback 서버의 CLI 안전 테스트 결과를 Worker 성능으로 쓰지 않는다.

CLI는 HTTP loopback URL만 받고 사용자 정보·쿼리·fragment·원격 호스트·리다이렉트를 거절한다. 활성 20, 친구 50, 친구당 게시 1,000, 1회 5분, 3회, 총 피드 6,000요청 및 응답 1 MiB/요청을 넘을 수 없다. 요청은 5초에 중단한다. 429는 별도로 세고 자동 재시도하지 않는다. 외부 서버 프로세스는 CLI가 만들지 않으므로 사용자가 띄운 Wrangler를 직접 종료한다. fixture 준비에 실패하면 그 호출이 만든 출력 디렉터리를 정리하고 기존 디렉터리는 덮어쓰지 않는다.

`worker/social/load-harness.test.ts`는 fake loopback HTTP 서버로 CLI의 기본 계획·URL 차단·리다이렉트·예산·실패 정리 경계를 검증한다. 이는 실제 Worker 성능 수치가 아니다. `worker/social/feed-cost.test.ts`의 Miniflare D1 `rows_read`/`rows_written`과 query plan은 쿼리 비용의 별도 증거다. HTTP 왕복에는 로그인·세션·한도 쓰기·직렬화·네트워크가 더해지므로 D1 비용 수치에서 p95를 추론하지 않는다.

main 소스에서 실제 Worker 에 대한 smoke 와 20계정 목표 처리량(p95/p99)·원격 성능은 아직 측정하지 않았다 — **UNVERIFIED**. 측정하면 실행 기록(HEAD·명령·포트·시각)과 함께 이 문서가 아니라 `docs/phase3-release.md` 의 로컬 검증 기록에 적는다.

## 로컬 두 계정 브라우저 검증

검증할 소스를 커밋하고 같은 소스에서 프로덕션 빌드(`pnpm build`)를 만든 뒤 실행한다. `CI=1`은 Playwright가 기존 3100 포트의 개발 서버를 재사용하지 못하게 한다. 실행 전 해당 포트가 비어 있어야 한다. 명령과 HEAD/tree, 빌드 exit, Playwright 로그를 한 실행 기록에 붙인다.

```bash
CI=1 pnpm exec playwright test tests/e2e/social-modes.spec.ts tests/e2e/sync.spec.ts --workers=1 --retries=0
```

빌드 산출물 검사나 예산이 실패하면 위 기본 러너는 시작하지 않는다. 이미 생성된 자산으로 화면 결함을 진단할 때만 추적 가능한 **검증용 외부 Playwright 설정**에서 기본 빌드 기동을 제외할 수 있다. 이 경우 원래 빌드 실패는 별도 `FAIL`로 남기고, 설정 파일·실행 명령·자산 SHA-256 목록·served `index.html` SHA-256·포트·출처 커밋을 같은 기록에 보존한다. 이 진단 결과는 `pnpm build` 통과나 출시 승인이 아니다.

`social-modes.spec.ts`는 `tests/e2e/fixtures/social.ts` 로 서버를 직접 띄우며(기본 러너의 3100·3101 서버와 별개), 이 fixture는 빈 loopback 포트와 일회용 D1 폴더를 만들고 실제 Wrangler를 `SOCIAL_MODE=enabled`, 두 합성 계정 allowlist, `AUTH_STUB=1`로 띄운다. 같은 폴더의 `social.spec.ts`(`TASKY_E2E_SOCIAL=1`, 3101, 세 계정 allowlist)는 공개 범위·복구·IME 를 따로 잰다. 두 계정은 동일 출처의 별도 브라우저 컨텍스트로 접속한다. 스텁은 Google 신원 쿠키만 대체하며 초대·관계·공유·피드·응원은 실제 로컬 Worker/D1을 지난다. fixture는 깨끗한 Git HEAD/tree(작업 트리가 더러우면 시작하지 않는다)와 빌드 `index.html`의 SHA-256을 읽고, 해당 포트가 서빙하는 파일과 비교하며, 모드 전환 때 자신의 Wrangler 프로세스만 정리·재시작한다. 테스트 로그의 `social-e2e source` 행이 출처 기록이다. 비교 실패나 프로세스 정리 실패를 성공으로 표기하지 않는다.

브라우저는 360·390·1024·1280px의 가로 넘침과 탭 포커스, CSS `zoom: 2`의 가로 넘침을 확인한다. 이 CSS 확대는 실제 운영체제/브라우저 설정의 200% 배율 검증과 구분한다. `src/test/sw.test.ts`는 SW의 정적 프리캐시 구성을, 브라우저 검증은 피드 요청 뒤 CacheStorage에 `/api/social/*`가 없는지를 확인한다. 브라우저 실패 경로는 피드 요청 한 번만 차단하며, 그 밖의 소셜 요청은 모의 처리하지 않는다. 이 검증은 실제 Google OAuth, 두 실기기, 원격 D1, 프로덕션 서버를 증명하지 않는다.

## 보존·한도 관측

`pnpm exec vitest run worker/social/operations-readiness.test.ts`는 독립 로컬 D1에서 만료 경계와 실제 행 삭제를 확인한다. 근거는 `docs/social-design.md` §8이다: 초대 만료 7일 뒤, command receipt 48시간 뒤, 종료된 limiter window 48시간 뒤부터 정리하고 1회 총 500행이다. 회차 초과분은 다음 cron에서 남고, 재실행은 지워진 행을 다시 지우지 않는다. UTC 고정 분/일 window는 경계에서 새 카운터를 만든다.

실운영에서는 cron 호출별 삭제 행수·오류·잔존 만료행, 경로별 응답 코드·지연, D1 rows_read/rows_written, 429, 피드 첫 페이지 p95를 수집해 비교한다. 본문·별명·이메일·원문 sub·초대 토큰·세션 ID를 로그에 남기지 않는다. 원격 D1 비용·GC 경합·계정 삭제 최악 비용은 별도 승인된 disposable 계정/데이터와 예산으로 검증한다.

## 활성화와 중단

서버 모드 기본값은 `off`이고 `enabled`·`read-only`도 내부 계정 allowlist가 없으면 `off`가 된다. 활성화 순서·중단·롤백·남은 게이트는 [phase3-release.md](phase3-release.md) 가 단일 소스다. 로컬 E2E(`social-modes.spec.ts`)에서는 서버를 `off`로 재시작하고 새로고침한 뒤에도 보낸 응원을 찾아 철회하는 경로가 통과한다. 실제 모드 변경, 배포, 원격 SQL, 공개 모집은 이 문서의 로컬 검증에 포함되지 않는다.
