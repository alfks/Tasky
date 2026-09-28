<!-- 읽기 조건: 이 레포에서 개발을 시작할 때, 또는 명령어·문서 위치가 기억나지 않을 때. 제품 소개와 배포는 루트 README.md. -->

# 개발 안내

**이 문서는 원래 루트 `README.md` 였다.** 루트 README 가 제품 소개·배포 안내로 바뀌면서
개발자용 내용을 여기로 옮겼다(내용은 그대로 두고 아래 "명령어"·"문서" 절만 최신으로 채웠다).

제품이 무엇인지와 배포 방법은 [README.md](../README.md) 를 본다.
프로젝트 규칙의 단일 소스는 [CLAUDE.md](../CLAUDE.md) 이고, 이 문서는 그것을 대신하지 않는다.

## 시작하기

```bash
bash scripts/setup.sh   # 최초 1회: git author 설정 + 훅 + 의존성
pnpm dev                # 개발 서버
pnpm check              # PR 전 필수 게이트 (11개 검사)
```

워크트리를 새로 만들었으면 그 안에서 **`pnpm install --frozen-lockfile` 부터** 돌린다 — 안 하면 포맷
검사 결과가 조용히 갈린다(이유와 반대 방향의 경고는 [CLAUDE.md](../CLAUDE.md) "현재 상태" 블록).

## 명령어

| 명령                           | 하는 일                                                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                     | 개발 서버                                                                                                                         |
| `pnpm build`                   | 프로덕션 빌드 + 서비스워커 + 산출물 계약 검사                                                                                     |
| `pnpm start`                   | 빌드 산출물을 `wrangler dev` 로 서빙(서비스워커 확인용)                                                                           |
| `pnpm check`                   | `scripts/check.sh` — 금지어·`.env`·AGENTS.md·author·워크트리·아키텍처·worker/db SQL 사용자 격리·lint·typecheck·format·test        |
| `pnpm test`                    | 단위 테스트(vitest). `tests/**` 는 포함하지 않는다                                                                                |
| `pnpm test:e2e`                | E2E(Playwright, 프로덕션 빌드를 띄워서 실행)                                                                                      |
| `pnpm run deploy:dry-run`      | 배포 배선 확인(자격증명 불필요)                                                                                                   |
| `node scripts/social-load.mjs` | Phase 3 로컬 합성 피드 부하 계획만 출력. fixture·명시적 loopback 실행·정리는 [운영 준비 절차](./phase3-social-operations.md) 참고 |

`pnpm deploy` 는 **pnpm 내장 명령**이라 이 레포의 스크립트가 돌지 않는다 — 반드시 `pnpm run deploy`.

`pnpm build`가 재는 번들 예산(값은 [TECH_PLAN.md](./TECH_PLAN.md) §8)의 검사는 **`pnpm check`에
포함되지 않는다** — `scripts/check.sh`(`pnpm check`)는 guard 4개, 워크트리 검사 1개,
arch·worker-sql·lint·typecheck·format·test 6개를 돌고 `pnpm build` 자체를 부르지 않는다.
번들 예산 검사는 **`pnpm build`의 마지막 단계**
(`node scripts/check-dist.mjs`)로만 돈다 — CI가 현재 미작동이라(CLAUDE.md "현재 상태" 블록) 실질
트리거는 사람이 PR 전에 직접 `pnpm build`를 돌리는 것뿐이다. 올릴 때의 정책(언제·어디서·왜
올리는지)은 `scripts/check-dist.mjs`의 `ENTRY_BUDGET`·`NETWORK_BUDGET` 주석이 단일 소스다.
**계측 이름이 T-94(#129)에서 바뀌었다** — "진입 청크 단독"이 아니라 **"진입 폐포(진입 + 정적
위성 청크) 합"** 을 `ENTRY_BUDGET`과 비교한다.

2026-09-28 사용자 승인으로 Phase 3 친구 화면에 필요한 진입 폐포 한도를 164,000 B에서
**168,000 B**로, 첫 로드 JS 합 한도를 210,000 B에서 **230,000 B**로 조정했다. 증가한 예산은
각각 4,000 B와 20,000 B이며, 이전 한도에서 실패한 T-7 `9bb1d7e`의 실측은 각각
165,971 B와 227,146 B였다. T-7 제품 소스 `7a1a41a4`와 T-8 검증 소스를 합친 깨끗한
트리에서 `pnpm build`가 **165,974 B / 227,265 B**로 통과했다(여유 2,026 B / 2,735 B).
기준값 대비 증가는 각각 5,344 B / 21,671 B로 WARN이며, 상한 변경 근거와 비용은
[ADR-0013](./decisions/ADR-0013-plain-vite-react-and-lazy-dexie.md) 및 `scripts/check-dist.mjs`에 남긴다.

**상한 게이트만으로는 여유가 조용히 바닥날 때까지 신호가 없었다(R2-C, 리뷰 라운드1 Major)** —
그래서 `pnpm build`는 매번 진입 폐포 gzip을 `scripts/bundle-baseline.json`의 기준값과 비교해
**증감(delta)**을 같이 찍는다. +2,000 B 이상 늘면 상한을 넘지 않아도 WARN을 찍는다(실패는 아니다 —
PR 본문에 무엇이 늘었는지 근거를 적으라는 안내, calendar-layout.md §7 절차). 새 값을 기준으로
인정하려면(즉 정당한 증가였다고 확정하려면) `node scripts/check-dist.mjs --update-baseline`을
사람이 직접 돌려 `scripts/bundle-baseline.json`을 갱신한다 — 자동 갱신은 하지 않는다.

E2E 브라우저는 설치돼 있다(`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`). `playwright install` 은 쓰지 않는다.

## 동기화(로그인) 로컬 개발

동기화는 **#129 기준으로 화면까지 main 에 있다**: 배선(`wrangler.jsonc` 의 `main: worker/index.ts`·D1
바인딩 `DB`/`tasky`·`GOOGLE_CLIENT_ID` vars, `.env.example`·`.dev.vars.example` — #109), **순수 도메인
계층**(`src/domain/sync/`, #114·#121), **저장소 계층**(`src/repositories/sync-*`·`memory/sync-*` 의 가짜
서버·`src/infra/sync/http-transport.ts`, #123), **Cloudflare Worker + D1**(`worker/` — 구글 OAuth
PKCE·세션·`/api/sync`·`/api/account/delete`, 마이그레이션 `worker/db/migrations/0001_init.sql`, #126,
ADR-0019), 그리고 **클라이언트 화면**(로그인 화면·`AuthGate`·사이드바 계정 블록·30초 폴링 동기화 엔진,
`src/features/sync/`, #129) — `main` 을 빌드하면 로그인 화면부터 뜬다(`syncState.userSub` 가 없으면
그 외 어떤 화면도 그리지 않는다, `AuthGate`). **구글 실왕복은 여전히 검증되지 않았다**(자격증명이 사용자
로컬에만 있다). 로그인 화면 자체는 `pnpm dev`(Vite 단독)에서도 뜨지만, 그 뒤 실제 왕복·`/api/*` 호출을
보려면 Worker 가 필요하다 — 아래 절차로 로컬에서 Worker 를 띄운다(SYNC_CREDENTIALS_GUIDE.md §2·§9-7).
**로그인 왕복(구글 없이)은 `pnpm test:e2e` 하나로 된다** — `playwright.config.ts`의 `webServer`가
`AUTH_STUB=1`로 `pnpm build && pnpm start`(실제 Worker + 로컬 D1)를 직접 띄우고, `tests/e2e/sync.spec.ts`가
`tests/e2e/fixtures/stub-login.ts`의 `/auth/stub-login` 경로로 실제 세션 쿠키·D1 행을 만들어 왕복한다 —
구글만 빠지고 Worker·D1 은 목이 아니다.

```bash
cp .dev.vars.example .dev.vars                              # 로컬 전용 — .env 와 별개, 직접 채운다
pnpm exec wrangler d1 migrations apply tasky --local         # 로컬 D1 스키마 적용
pnpm build && pnpm start                                      # wrangler dev, **8787** — Worker + 로컬 D1 + 빌드 산출물
```

- **`pnpm dev`(Vite, 5173)만으로는 로그인이 안 된다** — Worker 가 없어 `/auth/*`·`/api/*` 를 받을 곳이
  없다. `vite.config.ts` 의 프록시(`/api`·`/auth` → `127.0.0.1:8787`)로 두 프로세스를 같이 띄워야
  Vite HMR 을 유지한 채 로그인을 탄다. 실제 로그인 왕복을 확인할 때는 `pnpm start`(8787)를 쓴다.
- **`.env` 와 `.dev.vars` 는 별개 파일이다.** 배포 자격증명(`scripts/deploy.sh`·CI 가 읽음)은 `.env`,
  로컬 `wrangler dev` 가 읽는 시크릿은 `.dev.vars` — 값이 같아도 두 파일에 각각 채운다.
- **`.dev.vars` 의 `GOOGLE_CLIENT_ID` 를 빈 값으로 남겨 두지 마라.** `wrangler dev` 는 키가 "존재"하기만
  해도 그 값을 쓴다 — `GOOGLE_CLIENT_ID=`(빈 값)도 존재로 쳐서 `wrangler.jsonc` 의 진짜 값을 빈
  문자열로 **덮어써 로그인이 원인 불명으로 깨진다**(직접 재현 확인, `.dev.vars.example` 주석 참고).
  `wrangler.jsonc` 의 값을 그대로 쓰려면 값만 비우지 말고 **그 줄 자체를 지운다**.
- **로컬 스텁 로그인**: `.dev.vars` 의 `AUTH_STUB=1`(호스트가 localhost/127.0.0.1 일 때만 적용)이면
  구글 왕복 없이 로그인 플로우를 확인할 수 있다. 배포된 Worker 의 vars 에는 이 키 자체가 없어야
  한다.
- **Worker 테스트는 `pnpm test` 안에 있다** — `vitest.config.ts` 의 `worker` 프로젝트가 Miniflare D1 위에서
  `worker/**/*.test.ts` 를 순차 실행한다. `--project=worker` 로 그것만 돌릴 수 있다. 서버 규칙 벡터
  (`src/domain/sync/server-rules.vectors.ts`)를 도메인·메모리 가짜 서버·Worker 셋이 같은 파일로 돈다 —
  벡터를 복사하지 마라(CLAUDE.md "현재 상태").
- 자격증명 발급(구글 OAuth·Cloudflare D1, `.env`·`.dev.vars`·배포된 Worker 시크릿 셋의 차이 포함)은
  [SYNC_CREDENTIALS_GUIDE.md](./SYNC_CREDENTIALS_GUIDE.md)를 따른다.
- **실제 배포(`pnpm run deploy`, `--dry-run` 아님)는 `wrangler deploy` 직전에 `wrangler d1 migrations apply
tasky --remote` 와 시크릿(`GOOGLE_CLIENT_SECRET`·`SESSION_SECRET`) 존재 검사(`wrangler secret list`)를
  돈다 — 시크릿이 하나라도 없으면 `rc=1` 로 멈춘다(`wrangler secret put <이름>` 으로 먼저 올려야 한다).
  `--dry-run` 은 이 둘을 건너뛴다.** 배포 자체(수동 여부·지금 배포본 내용)는 [README.md](../README.md)
  [지금 상태](../README.md#지금-상태)가 단일 소스다.

### 배포 확인 (실환경에서 사용자가 확인한 방법, 2026-09-21)

```bash
curl -s https://tasky.millie020524.workers.dev/api/me
# 401 JSON({"error":"unauthorized"})이면 Worker 가 붙은 것, SPA index.html(200, HTML)이면 정적 자산만

curl -s https://tasky.millie020524.workers.dev/auth/stub-login?sub=x&email=x@y.z
# 반드시 404(not found) — AUTH_STUB 이 닫혀 있다는 뜻. 200/302 가 오면 즉시 롤백한다.

pnpm exec wrangler d1 execute tasky --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table'"
# 기대: users · sessions · devices · entities · deleted_users · d1_migrations
```

**`wrangler` 는 전역 설치가 아니다 — 반드시 `pnpm exec wrangler` 로 부른다**(사용자가 실제로
`command not found` 를 밟았다). 2026-09-21 확인 결과: `/api/me` → 401 JSON(Worker 붙음, 배포본은
#126 이후), `/auth/stub-login` → 404(AUTH_STUB 프로덕션에서 닫혀 있음), **D1 테이블도 원격에 생성돼
있는 것이 확인됐다**(사용자 확인). **구글 로그인 실왕복·배포본이 정확히 어느 커밋인지(#129 클라이언트
포함 여부)는 여전히 미확인**이다 — [README.md](../README.md) [지금 상태](../README.md#지금-상태)·
[CLAUDE.md](../CLAUDE.md) "현재 상태" 블록이 단일 소스다.

**증상: Worker 는 새것(`/api/me` 401)인데 로그인 화면이 안 뜬다면 `dist/client` 가 낡은 것부터 의심한다.**
`scripts/deploy.sh` 의 산출물 검사는 `dist/client` 의 파일이 **존재하고 비어 있지 않은지만** 보고
**최신인지는 보지 않는다** — pull 이전에 만든 낡은 `dist/client` 가 남아 있으면 `pnpm run deploy` 를
그대로 돌려도 검사를 통과해, Worker·D1 마이그레이션은 새로 나가고 **정적 자산만 옛것**으로 배포될 수
있다(추적 중 발견 — 이것이 실제 원인인지는 `pnpm build` 후 재배포해 봐야 확정된다, 후속 티켓
[PHASE2_TICKET_BACKLOG.md](./PHASE2_TICKET_BACKLOG.md) T-106). **먼저 `pnpm build` 를 돌린 뒤 재배포한다**
(`scripts/deploy.sh` 자체는 고치지 않는다 — owns 밖이고 고치는 방식은 T-106 에서 정한다).

**두 번째 용의자: 서비스 워커 캐시.** PWA 라 23개 URL 을 프리캐시하므로, 배포본이 실제로 새것이어도 브라우저에
남은 옛 서비스 워커가 캐시된 옛 화면을 계속 내줄 수 있다. **구분법**: 시크릿(사생활 보호) 창에서 배포
주소를 열어 본다 — 거기서 새 화면이 뜨면 캐시 문제고, 개발자도구 → Application → Service Workers →
Unregister 로 푼다. 시크릿 창에서도 옛 화면이면 위의 낡은 `dist/client` 쪽을 본다.

### 운영 주의 — D1 을 손으로 만지기 전에

- **`entities` 행을 손으로 지우지 마라(툼스톤 포함).** 지금 `users.gc_floor` 를 올리는 코드는 0건이다
  (`worker/` grep — 읽는 곳 `gcFloor()` 만 있다). 운영자가 `deleted = 1` 행을 직접 지우면, 그 seq 를 아직 받지
  못한 커서의 기기는 `resync` 도 받지 못한 채(`cursor < gc_floor` 판정이 영영 참이 되지 않는다) **삭제를
  영구히 놓친다 — 지운 할 일이 그 기기에서 되살아나 다시 올라온다.** 툼스톤 GC 는 `gc_floor` 계산과 물리
  삭제를 **한 커밋에** 넣는 T-101 이 맡는다([PHASE2_TICKET_BACKLOG.md](./PHASE2_TICKET_BACKLOG.md) 후속
  백로그). 그 전까지 D1 정리는 계정 삭제(`POST /api/account/delete`)뿐이다.
- `sessions` 만료 행은 세션 검증 경로가 지연 청소한다(`worker/auth/session.ts`) — 손으로 지워도 해는
  없지만 필요도 없다.

## 문서

- **프로젝트 규칙(단일 소스)**: [CLAUDE.md](../CLAUDE.md) · 협업 프로토콜: [AGENTS.md](../AGENTS.md)
- 아키텍처: [ARCHITECTURE.md](./ARCHITECTURE.md) · 디렉토리 맵: [DIRECTORY_MAP.md](./DIRECTORY_MAP.md)
- 결정 기록(ADR): [DECISIONS.md](./DECISIONS.md) · 기능 스펙: [specs/](./specs/)
- 동기화 구현 설계(자료구조·SQL·티켓 분해, 화면 규칙은 [specs/sync.md](./specs/sync.md)가 단일 소스): [SYNC_DESIGN.md](./SYNC_DESIGN.md)
- 동기화 자격증명 발급 가이드(구글 OAuth·Cloudflare D1): [SYNC_CREDENTIALS_GUIDE.md](./SYNC_CREDENTIALS_GUIDE.md)
- T-94 지연 로드 경계(진입/지연 청크 파일 단위 확정, 번들 예산 실측): [T94_LAZY_BOUNDARY.md](./T94_LAZY_BOUNDARY.md)
- Phase 2 구현 티켓 백로그(스냅샷): [PHASE2_TICKET_BACKLOG.md](./PHASE2_TICKET_BACKLOG.md) — 실제 단일 소스는 `.worktrees/tickets/`(로컬, 커밋 안 됨)이고 이 문서는 세션 간 인수인계용 기록
- 코드 컨벤션: [conventions/code-style.md](./conventions/code-style.md) · git: [conventions/git-workflow.md](./conventions/git-workflow.md)
- 사용감 실측 기록: [FEEL_REPORT.md](./FEEL_REPORT.md)
- Phase 3 로컬 검증·운영 준비: [phase3-social-operations.md](./phase3-social-operations.md)

## 로드맵

- Phase 1 (MVP): 날짜 스트립, 카테고리별 할 일 CRUD, 체크·달성률, 테마/색상 — **구현됨**
- Phase 2: D-day·다이어리·루틴·기간 통계 — **구현됨**. 구글 로그인 필수 + 서버 동기화 — **서버·저장
  계층·화면 전부 구현됨(#114·#121·#123·#126·#129). 배포는 사용자가 로컬에서 수동으로 계속하지만, 지금
  배포본에 이 버전이 올라가 있는지·구글 실왕복·Worker 가 실제로 동작하는지는 미검증**
- Phase 3: 친구·피드·반응

서드파티 고지는 [README.md](../README.md) 에 있다.
