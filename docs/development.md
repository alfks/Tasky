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
pnpm check              # PR 전 필수 게이트 (10개 검사)
```

## 명령어

| 명령                      | 하는 일                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm dev`                | 개발 서버                                                                                        |
| `pnpm build`              | 프로덕션 빌드 + 서비스워커 + 산출물 계약 검사                                                    |
| `pnpm start`              | 빌드 산출물을 `wrangler dev` 로 서빙(서비스워커 확인용)                                          |
| `pnpm check`              | `scripts/check.sh` — 금지어·`.env`·AGENTS.md·author·워크트리·아키텍처·lint·typecheck·format·test |
| `pnpm test`               | 단위 테스트(vitest). `tests/**` 는 포함하지 않는다                                               |
| `pnpm test:e2e`           | E2E(Playwright, 프로덕션 빌드를 띄워서 실행)                                                     |
| `pnpm run deploy:dry-run` | 배포 배선 확인(자격증명 불필요)                                                                  |

`pnpm deploy` 는 **pnpm 내장 명령**이라 이 레포의 스크립트가 돌지 않는다 — 반드시 `pnpm run deploy`.

`pnpm build`가 재는 번들 예산(값은 [TECH_PLAN.md](./TECH_PLAN.md) §8, 검사는 `pnpm check`에 포함)을
올릴 때의 정책(언제·어디서·왜 올리는지)은 `scripts/check-dist.mjs`의 `NETWORK_BUDGET` 주석이 단일
소스다 — 여기서 다시 적지 않는다.

E2E 브라우저는 설치돼 있다(`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`). `playwright install` 은 쓰지 않는다.

## 동기화(로그인) 로컬 개발

동기화는 Cloudflare Worker(`worker/`)가 붙어야 실제로 동작한다. **`becf8ae` 기준으로 Worker
코드·D1 마이그레이션 파일이 아직 없다**(T-92 의 남은 부분·T-93·T-94). 지금 들어가 있는 것은 둘이다:
배선(`wrangler.jsonc` 의 D1 바인딩 `DB`/`tasky`·`GOOGLE_CLIENT_ID` vars, `.env.example`·
`.dev.vars.example` 의 관련 키 — #109)과 **순수 도메인 계층**(`src/domain/sync/` — 서버 규칙
`updatedAt` LWW·클라이언트 병합·아웃박스·와이어 포맷, #114). 화면(로그인·상태 표시)도 아직 없다. Worker 가 붙은 뒤에는 아래 절차로 로컬에서 로그인·동기화를
확인한다(SYNC_CREDENTIALS_GUIDE.md §2·§9-7).

```bash
cp .dev.vars.example .dev.vars                              # 로컬 전용 — .env 와 별개, 직접 채운다
pnpm exec wrangler d1 migrations apply tasky --local         # 로컬 D1 스키마 적용(마이그레이션 파일이 생긴 뒤)
pnpm start                                                    # wrangler dev, **8787** — Worker + 로컬 D1
```

- **`pnpm dev`(Vite, 5173)만으로는 로그인이 안 된다** — Worker 가 없어 `/auth/*`·`/api/*` 를 받을 곳이
  없다. `vite.config.ts` 의 프록시(`/api`·`/auth` → `127.0.0.1:8787`)로 두 프로세스를 같이 띄워야
  Vite HMR 을 유지한 채 로그인을 탄다. 실제 로그인 왕복을 확인할 때는 `pnpm start`(8787)를 쓴다.
- **`.env` 와 `.dev.vars` 는 별개 파일이다.** 배포 자격증명(`scripts/deploy.sh`·CI 가 읽음)은 `.env`,
  로컬 `wrangler dev` 가 읽는 시크릿은 `.dev.vars` — 값이 같아도 두 파일에 각각 채운다.
- **로컬 스텁 로그인**: `.dev.vars` 의 `AUTH_STUB=1`(호스트가 localhost/127.0.0.1 일 때만 적용)이면
  구글 왕복 없이 로그인 플로우를 확인할 수 있다. 배포된 Worker 의 vars 에는 이 키 자체가 없어야
  한다.
- 자격증명 발급(구글 OAuth·Cloudflare D1)은 `SYNC_CREDENTIALS_GUIDE.md`(로컬 스크래치패드, 레포
  미포함 — 오케스트레이터/프로젝트 소유자가 보관)를 따른다.

## 문서

- **프로젝트 규칙(단일 소스)**: [CLAUDE.md](../CLAUDE.md) · 협업 프로토콜: [AGENTS.md](../AGENTS.md)
- 아키텍처: [ARCHITECTURE.md](./ARCHITECTURE.md) · 디렉토리 맵: [DIRECTORY_MAP.md](./DIRECTORY_MAP.md)
- 결정 기록(ADR): [DECISIONS.md](./DECISIONS.md) · 기능 스펙: [specs/](./specs/)
- 동기화 구현 설계(자료구조·SQL·티켓 분해, 화면 규칙은 [specs/sync.md](./specs/sync.md)가 단일 소스): [SYNC_DESIGN.md](./SYNC_DESIGN.md)
- Phase 2 구현 티켓 백로그(스냅샷): [PHASE2_TICKET_BACKLOG.md](./PHASE2_TICKET_BACKLOG.md) — 실제 단일 소스는 `.worktrees/tickets/`(로컬, 커밋 안 됨)이고 이 문서는 세션 간 인수인계용 기록
- 코드 컨벤션: [conventions/code-style.md](./conventions/code-style.md) · git: [conventions/git-workflow.md](./conventions/git-workflow.md)
- 사용감 실측 기록: [FEEL_REPORT.md](./FEEL_REPORT.md)

## 로드맵

- Phase 1 (MVP): 날짜 스트립, 카테고리별 할 일 CRUD, 체크·달성률, 테마/색상 — **구현됨**
- Phase 2: 클라우드 동기화, 친구·피드·반응

서드파티 고지는 [README.md](../README.md) 에 있다.
