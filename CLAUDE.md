<!-- 읽기 조건: 모든 에이전트, 모든 세션 시작 시 무조건. 이 파일 외의 문서는 아래 "읽기 규칙"에 해당할 때만 연다. -->

# Tasky — 루트 헌법

**Tasky**: 레퍼런스 앱(국내 인기 감성 투두 앱)의 GUI/UX/기능을 매우 흡사하게 재현하는 **감성 투두/일정 관리 데스크탑 웹앱**. React SPA(Vite) + TypeScript + PWA, **로컬 우선(IndexedDB, repository 패턴)**. SNS(친구·피드·반응)는 Phase 2.
1차 MVP: 날짜 스트립 + 카테고리별 투두 CRUD + 체크/달성률 + 테마/색상.

> **현재 상태(단일 소스 — 상태가 바뀌면 여기만 고친다)**
>
> 아래 수치는 전부 **다기기 세션 수정(ADR-0020) 반영 직후 실측**이다(2026-09-21, #129 이후 문서 정리 세션) — 테스트 **2,971건**(234파일 — `pnpm test`, worker 프로젝트 포함) / E2E **44건**(12스펙 — `pnpm exec playwright test --list`) / `pnpm check` **11개 검사**(개수는 #126 이후 그대로 — 이번 수정도 검사를 추가하지 않았다, `bash scripts/check.sh` 실행으로 확인) / 진입 폐포 gzip **158,119 B**(예산 160,000, 여유 1,881 B) / 첫 로드 네트워크 JS gzip 합 **201,182 B**(예산 210,000, 여유 8,818 B) / 프리캐시 **23 URL**. **계측 이름 자체가 바뀌었다 — 옛 값과 새 값을 그냥 비교하지 마라.** #126 시점 문서는 "진입 청크 단독"(`index.js` 파일 하나)을 쟀지만, T-94(#129)가 `scripts/check-dist.mjs` 의 계측을 **"진입 폐포(진입 + 정적 위성 청크) 합"** 으로 바꿨다(`entryClosure`, 동기화 지연 청크들을 재귀로 더한다) — 옛 **148,976 B**(청크 단독, 예산 150,000)와 새 **158,119 B**(폐포 합, 예산 160,000)는 서로 다른 것을 잰 값이다. 참고로 `index.js` 파일 단독 gzip 은 152,356 B(예산 없음, `pnpm build` 출력의 "index.js 단독" 줄). 기준을 커밋 해시가 아니라 **PR 번호**로 적는다 — 해시는 재는 시점과 머지 시점이 달라 머지되는 순간 이미 틀린 값을 가리킨다(#125 에서 실제로 그랬다). main 이 움직이면 다시 재서 고친다.
>
> - **앱이 동작한다(배포는 사용자가 로컬에서 수동으로 계속한다 — 배포본 내용은 아래 별도 항목, 미확인).** Phase 1 의 9개(투두·카테고리·날짜 스트립·달성률·테마·포커스 타이머·백업/복원·PWA·커맨드 팔레트)에 Phase 2(캘린더=D-day·다이어리·기간 통계; 루틴은 투두 feature 안에 통합)와 **동기화 클라이언트(`sync`, T-94/#129)** 가 더해져 **13개 feature**가 앱 셸에 조립돼 있고 `src/app/page.tsx` 가 실제 앱을 그린다(`src/features/` 디렉토리는 14개 — 나머지 하나 `shell/` 은 조립 지점이지 feature 가 아니다). `pnpm dev` 로 바로 쓸 수 있다. Dexie+repository 지연 로드 청크는 33,453 B gzip.
> - **동기화가 화면까지 붙었다 — origin/main 에 전부 있다(#129, 2026-09-21).** 순수 도메인(`src/domain/sync/` — 서버 규칙 `updatedAt` LWW·클라이언트 병합·아웃박스·와이어 포맷, #114) → 스키마 v4·슬롯 id·`fillFloor` 배선과 ADR-0018(#121) → 저장소 포트·메모리 가짜 서버·아웃박스 적재·HTTP 트랜스포트(`src/repositories/sync-*`·`memory/sync-*`·`src/infra/sync/`, #123) → **Cloudflare Worker + D1**(`worker/` — 구글 OAuth PKCE·HMAC 서명 세션 쿠키·`POST /api/sync`·`POST /api/account/delete`·D1 마이그레이션 `worker/db/migrations/0001_init.sql`, #126, ADR-0019) → **클라이언트 UI**(`src/features/sync/` — 로그인 화면 `LoginScreen`·전체 화면 게이트 `AuthGate`·사이드바 계정 블록 `AccountBlock`·업로드/계정 삭제/기기 전환 다이얼로그(`UploadDialog`·`AccountDeleteDialog`·`AccountDeletedNotice`·`AccountSwitchedNotice`)·30초 폴링 동기화 엔진(`sync-engine.ts`), e2e `tests/e2e/sync.spec.ts`(6건), #129)까지 머지됐다. **구글 실왕복은 여전히 검증되지 않았고, 지금 배포본에 이 Worker 코드가 실제로 올라가 있는지도 미확인이다** — 배포 자체는 사용자가 로컬에서 수동으로 계속하지만(아래 "배포 상태" 항목), #126·#129 가 오늘 막 머지된 뒤 다시 배포했는지는 이 레포로는 알 수 없다. `scripts/deploy.sh` 는 실제 배포 직전에 `wrangler d1 migrations apply --remote` 와 시크릿(`GOOGLE_CLIENT_SECRET`·`SESSION_SECRET`) 존재 검사를 돌린다 — 시크릿이 없으면 배포가 `rc=1` 로 멈춘다(아래 "배포 상태" 항목 참고).
> - **다기기 로그인이 서로를 끊지 않는다(ADR-0020, 2026-09-21).** 사용자 보고("웹앱과 웹사이트를 같은 계정으로 동시에 열면 한쪽이 로그아웃된다")의 원인은 `worker/auth/handlers.ts`·`worker/auth/stub.ts` 가 **로그인마다 무조건** `DELETE FROM sessions WHERE sub = ?` 를 돌린 것 — 원래 재가입(계정 삭제 후 같은 계정으로 재로그인) 탈취 세션 방어용이었지 다기기를 막으려던 게 아니었다. 두 로그인 경로를 공유 함수 `worker/auth/session.ts#signIn` 으로 합치고, 세션 전량 폐기를 `deleted_users` 존재 여부로 조건화했다(`… WHERE sub = ? AND EXISTS (SELECT 1 FROM deleted_users WHERE sub = ?)`, batch 로 만료 청소·표식 삭제·upsert 와 함께 원자적으로). **스키마·마이그레이션·클라이언트 프로토콜 변경 없음 — 기존 프로덕션 세션 쿠키는 그대로 유효하다.** 옛 무조건 폐기가 우연히 주던 "아무 기기에서나 재로그인하면 전부 로그아웃" 취소 수단이 없어진 자리는 새 **`POST /auth/logout-others`**("다른 기기 모두 로그아웃" — `worker/auth/session.ts#destroyOtherSessions`, 계정 블록 버튼 + 확인 대화상자, `SyncTransport.logoutOthers()` 포트 추가)가 메운다. e2e `sync.spec.ts` 의 "두 기기" 셋업은 쿠키 복사·D1 직접 조작 대신 **진짜 두 번째 `stubLogin`** 으로 바뀌었다.
> - **로그인이 필수다**(sync.md R1 — 사용자 결정, ADR-0015) — **그리고 이제 origin/main 에서 실제로 그렇다.** 로컬 표식(`syncState.userSub`)이 없으면 로그인 화면 외 **어떤 화면도 보여주지 않는다**(`AuthGate`). main 을 빌드하면 곧바로 "구글 로그인 뒤 쓰는 앱"이다 — README·`public/privacy.html` 은 그 전제로 이미 써 있었다. **다만 배포본이 이 코드를 쓰는지는 별도(아래 "배포 상태" 항목)가 미확인이라 여기서 보증하지 않는다** — 배포된 주소가 아직 옛 빌드를 서빙 중이라면 그 배포본에는 로그인 화면이 없을 수 있다.
> - **이 레포의 핵심 방어 장치: 서버 규칙 벡터를 세 계층이 같은 파일로 돈다.** `src/domain/sync/server-rules.vectors.ts` 하나를 도메인 단위 테스트(`server-rules.test.ts`)·메모리 가짜 서버(`src/repositories/memory/sync-server.test.ts`)·**실 D1 위의 Worker**(`worker/sync/apply.test.ts`, Miniflare D1)가 **복사하지 않고 import** 한다. 벡터를 복사하지 않았으니 셋이 갈라질 수 없다 — 규칙이 바뀌면 벡터를 고치고, 벡터가 바뀌면 세 계층이 함께 빨개진다. #126 리뷰가 생성 경로의 미래 시각 클램프 누락(Blocker)을 잡은 방식도 "벡터 하나 추가"였다. **벡터를 복사해 어느 한 계층에만 두거나, 한 계층만 벡터를 건너뛰는 PR 은 이 장치를 무너뜨린다 — 리뷰에서 막아라.**
> - **번들 예산이 T-94 에서 올라갔다(#129) — 그래도 여유는 다시 좁다.** 계측이 "진입 청크 단독" → **"진입 폐포(진입 + 정적 위성 청크) 합"** 으로 바뀌었고, 예산도 150,000/200,000 → **160,000/210,000** 으로 올랐다(`scripts/check-dist.mjs` 의 `ENTRY_BUDGET`·`NETWORK_BUDGET` 주석이 단일 소스, #117 결정에 따라 T-94 PR 안에서 올렸다). 실측(다기기 세션 수정 반영): 진입 폐포 gzip **158,119 B** / 예산 160,000 B(여유 1,881 B) · 네트워크 합 **201,182 B** / 예산 210,000 B(여유 8,818 B). **옛 이름·옛 값("진입 청크 단독 148,976/150,000")으로 리뷰하면 지금은 틀렸다** — `docs/development.md` 도 같이 갱신했다.
> - **E2E 스모크가 있다**(`tests/e2e/`, `pnpm test:e2e` — 12개 스펙 **44건**). 카테고리 생성 → 한글 투두 → 체크 → 편집 → 삭제 → 날짜 이동 → 새로고침 유지 외에 선택 링·강제 색 모드·루틴 관리 메뉴·휴대폰 폭(360·375·390) 가로 스크롤·카테고리 순서 드래그·행 호버 면과 손잡이 색(theme R29)·**동기화 두 기기 시나리오·계정 삭제 안내·다기기 로그인 회귀 가드·인증 엔드포인트**(`sync.spec.ts` 6건, T-94/#129 + ADR-0020)도 커버한다. 셀렉터는 **역할·접근 이름만** 쓴다(클래스·색 0건). `pnpm test`(vitest)는 `tests/**` 를 집지 않는다.
> - **`prettier` 는 `3.9.6` 고정이다**(#120). `^3` 같은 부동 범위면 마이너 릴리스 하나에 온 레포가 한꺼번에 포맷 위반이 된다. 올릴 때는 버전 변경과 그로 인한 포맷 변경을 **한 PR** 에 같이 싣는다.
> - **워크트리를 만들면 반드시 `pnpm install --frozen-lockfile` 부터.** 안 하면 `prettier-plugin-tailwindcss` 가 빠진 채 `pnpm format`/`format:check` 가 돌아 **검사와 결과가 조용히 갈린다**(#120 사고 — 포맷을 "고쳤는데" main 에서는 위반). `bash scripts/wt.sh new` 는 설치를 시도하지만 실패해도 WARN 만 찍고 계속 간다. 이것은 §9 의 경고(오래된 워크트리의 `node_modules` **잔재**가 가짜 초록불을 만든다)와 **같은 부류의 반대 방향**이다 — 잔재는 없어야 하고, 설치는 있어야 한다. 둘 다 지켜라.
> - **문서 구조**: 루트 `README.md` 는 **제품 소개·배포 안내(외부용)** 이고, 개발자용 명령어·문서 지도는 **`docs/development.md`** 에 있다(#78 에서 갈랐다). 이 파일(`CLAUDE.md`)은 여전히 **프로젝트 규칙의 단일 소스**다. 사용자에게 공개되는 글(README·`public/privacy.html`)은 구현과 어긋나면 **방침을 고치지 코드를 고치지 않는다** — T-95 가 `worker/` 실제 값과 대조했다.
> - **사용감(감성) 실측은 `docs/FEEL_REPORT.md`** 하나에 모인다 — §1~§8 은 T-25 의 기록, §9 는 T-60 의 재측정, §9-5·§9-6 은 그 뒤 후속, **§10 은 Phase 2 가 더한 것의 목록**(측정한 것과 아직 안 잰 것을 가른다 — 동기화는 실기기에서 돌려 본 적이 없다). **측정값은 덮어쓰지 않고 절을 더한다.** 지금 판정: 셋 중 "상태의 언어" 와 "면" 은 닫혔고 **밀도는 스펙이 의도한 여백**이다(app-shell.md §2-A-2 — 채우지 않기로 한 결정이지 미완이 아니다).
> - **배포는 일어나고 있다 — 사용자가 로컬에서 수동으로 계속한다(사용자 본인이 2026-09-21 이 세션에서 알려줌 — 확정 사실).** 확정된 것: (a) `Deploy` 워크플로 런 **124회 전부 `failure`**(GitHub API `actions/workflows/deploy.yml/runs`, #1~#124 — CI 미작동 항목과 같은 원인)라 **GitHub Actions 를 통한 자동 배포는 한 번도 성공한 적이 없다.** (b) 그래서 배포는 전부 **사용자가 로컬에서 손으로 `pnpm run deploy` 를 돌려서** 이뤄진다. **넘겨짚지 말 것 — 여기서 확정되는 건 "배포가 일어난다"는 것뿐이다.** 사용자는 "계속 수동 배포한다"고 했을 뿐 **지금 배포본이 어느 커밋인지는 말하지 않았다.** 동기화(Worker + D1 + 클라이언트, #126·#129)는 오늘(2026-09-21) 막 머지됐다 — 그 뒤에 다시 배포하지 않았다면 **지금 배포본에는 동기화가 아직 없을 수 있다.** 이 컨테이너는 배포 주소로 나가는 요청이 프록시에 막혀(`curl` → 000) 직접 확인할 수 없다 — 확인할 수 있는 사람은 그 주소에 `GET /api/me` 를 쳐서(정적 자산만이면 SPA 의 `index.html`(200, HTML)이, Worker 가 붙어 있으면 401 JSON 이 온다) 이 항목을 갱신해라. (c) **다음 배포부터는 조건이 하나 늘었다(T-93/#126, `scripts/deploy.sh` 읽어서 확인함)**: 실제 배포(`--dry-run` 아님) 직전에 `wrangler secret list` 로 `GOOGLE_CLIENT_SECRET`·`SESSION_SECRET` 존재를 확인하고, 하나라도 없으면 **`rc=1` 로 멈춘다**(올리는 법: `wrangler secret put GOOGLE_CLIENT_SECRET` / `wrangler secret put SESSION_SECRET`) — **이 두 시크릿을 아직 안 올렸다면 다음 `pnpm run deploy` 는 실패한다.** 같은 자리에서 `wrangler d1 migrations apply tasky --remote` 도 매 실제 배포마다 돈다. `--dry-run` 은 이 둘을 다 건너뛴다(네트워크를 타지 않는다). **여전히 미확인으로 남은 것**: 구글 로그인 실왕복, 배포된 Worker 가 실제로 동작하는지 — 배포가 일어난다는 사실과 그것이 동작한다는 사실은 다르다. 자격증명은 **`.env`**(git 제외, `cp .env.example .env` 후 채움)에서 읽는다 — `CLOUDFLARE_ACCOUNT_ID`·`CLOUDFLARE_API_TOKEN`, 선택 `DEPLOY_URL`. 발급 방법은 `.env.example` 주석에 있다. CI 는 같은 이름의 레포 Secrets/Variables 를 쓴다. **`pnpm deploy` 는 pnpm 내장 명령이라 우리 스크립트가 돌지 않는다 — 반드시 `pnpm run deploy`.**
> - 문서 `<head>`(메타·`theme-color`·폰트 preload·첫 페인트 테마 스크립트)의 단일 소스는 **루트 `index.html`** 이다. PWA manifest 는 **`public/manifest.webmanifest` 정적 파일**이고 프리캐시(**23 URL**, T-94/#129 가 동기화 지연 청크를 더해 17→23)에 들어간다. iOS 홈 화면 아이콘만은 manifest 밖이다 — `<link rel="apple-touch-icon">` + 불투명 `public/icon-apple-touch-180.png`(pwa.md R1-a).
> - **검사 도구가 한동안 꺼져 있었다(T-43, PR #42).** `eslint-config-next` 프리셋이 `next` 패키지를 요구하는데 그것이 Vite 전환(#25)에서 빠져, **깨끗한 설치에서는 lint 와 아키텍처 2차 패스가 계속 죽어 있었다** — 통과하던 것은 워크트리 `node_modules` 의 `next` 잔재 덕분이었다. 지금은 플러그인을 직접 등록해 고쳤고 `import/no-unresolved` 를 카나리로 켜 두었다. → **린트 결과가 의심스러우면 `rm -rf node_modules && pnpm install --frozen-lockfile` 로 다시 확인해라.** 워크트리를 오래 쓰면 잔재로 속을 수 있다.
> - **`check.sh` 가 부하에서 거짓 빨간불을 내던 것은 고쳤다(T-62, #79).** 같은 워크트리에서 `check-arch.sh` 둘이 겹치면 서로의 픽스처를 지워 한쪽이 죽었다(2초 차 4쌍 → 8개 중 7개 실패). 이제 mkdir 스핀락으로 직렬화하고, 요약이 **실패한 검사 이름**을 찍는다. 예전에는 `__arch__ 잔여물…` 안내가 **어떤 실패에나 무조건** 붙어 원인을 오도했다 — 옛 로그를 근거로 arch 를 의심하지 마라.
> - **CI 임시 미작동(여전함, #99~#126 재확인)**: #126 의 main push 가 만든 CI·E2E·Deploy 런 셋이 2026-09-21 11:17 UTC 에 전부 **4초 만에 `failure`** 로 끝났다(러너 배정 자체가 안 됨). 계정/레포 차원의 Actions 실행 불가가 맞다(워크플로 자체는 정상 — PR의 빨간 X는 코드 문제가 아니다). #129(T-94)·#130(T-95) 의 main push 는 이번 문서 갱신에서 **다시 확인하지 않았다 — 미확인**(이 컨테이너는 GitHub API 로 나가는 요청이 프록시에 막혀 있다). **`bash scripts/check.sh` 통과가 PR 전 실질 게이트**이며, CI 초록불을 머지 조건으로 삼지 않는다. 복구되면 이 항목을 지운다.

## 0. 절대 금지어 (최우선 규칙)

기록으로 남는 **모든 것**(파일명·본문·코드·주석·테스트·커밋·PR·이슈·브랜치)에 레퍼런스 앱의 **실제 제품명을 쓰지 않는다.**

- 금지 토큰: 영문 `to`·`do`·`mate` 조합(대소문자/공백/`_`/`-` 변형 전부), 한글 `투두`·`메이트` 조합(띄어쓰기 변형 전부).
- 항상 **"레퍼런스 앱"**(영문 `reference app`)으로 지칭. 리서치 문서를 인용할 때도 동일.
- 검사: `bash scripts/check-forbidden-words.sh` — pre-commit 훅과 CI가 자동 실행, 위반 시 실패.

## 1. 4대 필수 규칙

1. **커밋 author는 항상 `alfks <millie020524@gmail.com>`.** AI 명의 author, `Co-Authored-By: Claude…`, `Generated with Claude Code`, 세션 URL 등 **AI 흔적을 커밋·PR에 남기지 않는다.** 강제: `bash scripts/setup.sh`(레포 로컬 config + 훅). 임시: `git -c user.name=alfks -c user.email=millie020524@gmail.com commit …`.
   - **예외(PR 본문 말미 자동 서명만)**: GitHub 플랫폼이 PR **본문 맨 끝**에 자동으로 붙이는 서명 한 줄(예: `_Generated by [Claude Code](...)_`)은 API로 지워도 서버가 즉시 재부착해 제거가 불가능하다 — 이 한 줄만 예외로 둔다. 그 밖의 모든 곳 — 커밋 메시지·author·코드·주석·테스트·이슈·브랜치명, 그리고 **PR 제목과 본문 내용 자체** — 에는 이 예외가 적용되지 않으며 AI 흔적을 여전히 남기지 않는다.
2. **병렬 작업은 반드시 `.worktrees/<작업명>/` 워크트리에서.** 메인 워킹트리(`/home/user/Tasky`)에서 동시 편집 금지. 생성: `bash scripts/wt.sh new feature/<작업명>`.
3. **브랜치명은 `feature|fix|refactor|docs|chore|test/<작업명>`** (kebab-case 영문). `claude/…`, `opus/…`, `sonnet/…` 등 **에이전트 이름 기반 브랜치 금지.**
4. **트래킹된 파일이 있는 모든 디렉토리는 `AGENTS.md` 필수.** 예외: 상위 디렉토리의 `AGENTS.md`가 본문에 `관할: <하위디렉토리명>/` 형태로 **명시적으로 관할을 선언**한 하위 디렉토리는 면제. 그 디렉토리의 규칙/맥락은 **거기에만** 적는다(루트에 중복 금지). 에이전트는 **그 디렉토리를 실제로 읽거나 수정할 때만** 해당 `AGENTS.md`를 읽는다. 디렉토리를 새로 만들면 `AGENTS.md`도 같이 만든다(템플릿: `docs/conventions/templates/AGENTS.template.md`).

## 2. 디렉토리 맵 / 아키텍처 (단일 소스 — 여기서 중복 기재하지 않는다)

파일 위치: [docs/DIRECTORY_MAP.md](docs/DIRECTORY_MAP.md) · 레이어·의존 방향·확장 지점: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · 각 디렉토리 규칙: 그 디렉토리의 `AGENTS.md`.

## 3. 읽기 규칙 — 무엇을 언제 읽는가

| 상황                         | 읽을 것                                                                                                     | 읽지 말 것                                 |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 세션 시작                    | 이 파일만                                                                                                   | `AGENTS.md` 전부 훑기                      |
| 역할이 오케스트레이터/리뷰어 | [AGENTS.md](AGENTS.md) → [docs/conventions/agent-collaboration.md](docs/conventions/agent-collaboration.md) | 코드 컨벤션(리뷰 시엔 diff 보며 필요 절만) |
| 코드 작성 시작               | [docs/conventions/code-style.md](docs/conventions/code-style.md) + 대상 디렉토리 `AGENTS.md`                | 무관한 디렉토리 `AGENTS.md`                |
| 커밋/PR/워크트리             | [docs/conventions/git-workflow.md](docs/conventions/git-workflow.md)                                        | —                                          |
| 핸드오프 문서 작성           | [.worktrees/AGENTS.md](.worktrees/AGENTS.md)                                                                | —                                          |
| 레이어 경계를 넘는 변경      | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) + 관련 ADR                                                     | 전체 ADR                                   |
| 파일 위치를 모를 때          | [docs/DIRECTORY_MAP.md](docs/DIRECTORY_MAP.md) → Glob/Grep                                                  | 디렉토리 전체 Read                         |
| 기능 요구사항 확인           | `docs/specs/<feature>.md`                                                                                   | 리서치 문서 전문(섹션만 grep)              |
| 토큰이 부족하다고 느낄 때    | [docs/conventions/token-efficiency.md](docs/conventions/token-efficiency.md)                                | —                                          |

원칙: **맵 → Glob → Grep → 범위 Read**. 300줄 초과 파일은 전문 Read 금지(범위 지정). 상세: token-efficiency.md.

## 4. 커밋 / 브랜치 / PR 요약 (상세: git-workflow.md)

- 커밋: `<type>(<scope>): <한국어 제목>` — type ∈ `feat|fix|refactor|docs|chore|test|style|perf|ci`. 본문 한국어, 트레일러 없음. 예: `feat(todo): 카테고리별 투두 체크 토글 추가`
- 브랜치: `main` ← PR only, **squash merge**. 보호 설정은 레포 최초 1회 수동 필요([git-workflow.md §1.1](docs/conventions/git-workflow.md)) — 미설정 상태에선 CI 실패 PR도 머지될 수 있음. 동기화는 `git rebase main` (merge 커밋 금지).
- PR: 템플릿 필수, 라벨 `type:*` + `area:*`, 리뷰 라운드 ≤ 3, 종료 기준 (Blocker+Major) ≤ 3.
- 한 PR = 한 티켓 = 한 워크트리. 300줄(diff) 초과 시 분할 검토.

## 5. 자주 쓰는 명령어

```bash
bash scripts/setup.sh                     # 최초 1회: author config + 훅 + pnpm install
bash scripts/wt.sh new feature/<name>     # 워크트리 생성(+브랜치) → .worktrees/<name>
bash scripts/wt.sh list                   # 워크트리/보드 상태
bash scripts/wt.sh rm <name>              # 머지 후 워크트리+브랜치 정리
pnpm check                                # = bash scripts/check.sh (금지어·.env·AGENTS.md·author·wt·arch·worker-sql·lint·typecheck·format·test — 11개). PR 전 필수
bash scripts/check-forbidden-words.sh     # 금지어 검사
bash scripts/check-env-secrets.sh         # .env 계열이 추적/스테이징됐는지 (pre-commit 이 --staged 로도 호출)
bash scripts/check-author.sh main         # main 이후 커밋 author 검증
bash scripts/check-agents-md.sh           # AGENTS.md 누락 검사
bash scripts/check-arch.sh                # 레이어 경계 린트 + 아키텍처 2차 패스(스캐폴딩 후)
node scripts/make-icons.mjs               # PWA 아이콘 4종 재생성(그림 원본은 assets/seal-sheet.png — 코드로 다시 그리지 않는다, pwa.md R2-a)
pnpm dev | pnpm build | pnpm test -- <pattern>
pnpm start                                # 빌드 산출물(dist/client)을 wrangler dev 로 로컬 서빙(서비스워커 확인용)
pnpm build && pnpm run deploy:dry-run     # CI 배포와 **같은 명령**을 --dry-run 으로(업로드 파일 목록 확인). 자격증명 불필요 — `--dry-run` 은 네트워크를 타지 않아 스크립트가 자격증명 검사를 건너뛴다. 단 빌드 산출물은 있어야 한다
CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… pnpm run deploy   # 실제 배포. 평소엔 main push 시 워크플로가 한다
```

`pnpm deploy` 는 **pnpm 내장 명령**이라 우리 스크립트가 아니라 워크스페이스 배포가 돈다 — 반드시 `pnpm run deploy` 로 쓴다(`deploy:dry-run` 은 콜론이 있어 충돌 없음).

## 6. 코드 원칙 압축판 (상세: code-style.md)

- 의존 방향: `app/features/components → domain → repositories(인터페이스)`; `infra`는 인터페이스만 구현. **`domain`은 react/next/dexie import 금지**(ESLint가 막음).
- 컴포넌트는 `features/<f>/components/`, 공용은 `components/ui/`. 상태는 `features/<f>/store/` Zustand. 컴포넌트에서 Dexie 직접 호출 금지.
- 파일 ≤ 300줄, 컴포넌트 ≤ 200줄, 함수 ≤ 50줄. 넘으면 분할.
- 모든 인터랙션은 `button/input/a` 등 시맨틱 요소. `div onClick` 금지. 키보드 조작 가능해야 함.
- 테스트: `domain` 함수와 `repositories` 메서드는 반드시 단위 테스트. 스냅샷 테스트 금지.

## 7. 절대 하지 말 것

1. 금지어 사용 (§0).
2. AI 명의 author / AI 트레일러 / 세션 URL을 커밋·PR에 남기기(예외: §1-1 의 PR 본문 말미 자동 서명 한 줄뿐).
3. 메인 워킹트리에서 병렬 편집, `.worktrees/` 밖에 워크트리 생성.
4. 에이전트 이름 브랜치(`claude/…` 등), `main` 직접 push, `--force` (허용: `--force-with-lease` 본인 브랜치만).
5. 티켓에 `owns:`로 명시되지 않은 파일 수정(충돌 방지 락 규칙, AGENTS.md §4).
6. `node_modules/`, `.next/`, `pnpm-lock.yaml`, `coverage/` 읽기·요약·수정. lockfile은 `pnpm install`이 갱신.
7. `AGENTS.md` 없는 디렉토리 생성, 루트 문서에 디렉토리별 규칙 중복 기재.
8. `docs/research/` 문서 수정(읽기 전용, 갱신은 별도 `docs/` 티켓으로).
9. 사용자 확인 없이 의존성 추가, ADR 없이 레이어/저장소 구조 변경.
10. 리뷰 피드백을 "확인했습니다"로만 처리 — 반영하거나 근거를 적어 거절.
11. 응답에 코드 전문 재인용, 읽은 파일 요약 나열(토큰 낭비). 최종 보고는 15줄 이내.
12. 기존 문서와 중복되는 새 문서 작성 — 링크로 대체.

## 8. 역할 프로토콜 요약 (상세: [AGENTS.md](AGENTS.md))

- **오케스트레이터**: 티켓 발행(`.worktrees/tickets/T-<n>.md`) → 구현 에이전트 배정 → 리뷰 라운드 운영 → 머지 → 워크트리 정리.
- **구현**: 티켓의 `owns:` 파일만 수정, 워크트리에서 작업, `pnpm check` 통과 후 PR, 핸드오프 문서 작성.
- **리뷰**: diff만 읽음, 페르소나 체크리스트, 심각도 태그(Blocker/Major/Minor/Nit), 템플릿 형식으로만 보고.
- **리서치**: 결과는 `docs/research/`에 파일로, 응답은 경로 + 10줄 요약.

## 9. 환경

Node 22 / pnpm 10 / **Vite 8**(순수 Vite + React SPA, 라우터 없음) / React 19 / TypeScript 5 strict / Tailwind CSS 4 / Zustand / Dexie(지연 로드) / Vitest 5 / Playwright / Serwist 9(PWA) / Cloudflare Workers 정적 자산(배포). **`next`·`vinext` 계열 의존은 런타임에도 린트에도 없다**(ADR-0013). `eslint-config-next` 프리셋은 T-43 에서 걷어냈다 — 그 프리셋이 `next` 패키지 자체를 요구해서, next 의존을 뺀 뒤로 **깨끗한 설치에서는 `pnpm lint` 와 아키텍처 2차 패스가 통째로 죽어 있었다**(워크트리에 남은 `node_modules` 잔재로만 통과하던 가짜 초록불). 지금은 파서·플러그인을 `eslint.config.mjs` 가 직접 등록한다: `@typescript-eslint/parser`·`@typescript-eslint/eslint-plugin`·`eslint-plugin-react`·`eslint-plugin-react-hooks`·`eslint-plugin-jsx-a11y`·`eslint-plugin-import`, 그리고 `@/*` 별칭 해석용 `eslint-import-resolver-typescript`(빠지면 경계·순환 검사가 조용히 무력화되므로 `import/no-unresolved` 카나리가 지킨다) — 전부 직접 devDependency 다. 린트가 의심스러우면 `rm -rf node_modules && pnpm install --frozen-lockfile` 후 다시 재 본다. 패키지 매니저는 **pnpm만** (`npm`, `yarn` 금지). 경로 별칭 `@/*` → `src/*`. E2E 브라우저는 이미 설치돼 있다(`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`) — `playwright install` 은 네트워크 정책에 막히므로 쓰지 않는다. 상세·제약: [ADR-0013](docs/decisions/ADR-0013-plain-vite-react-and-lazy-dexie.md).

## 10. 티켓 수명주기 (한눈에)

```
오케스트레이터: 티켓 작성(.worktrees/tickets/T-<n>.md, owns: 명시) → BOARD.md 등록
구현 에이전트 : wt.sh new → 구현 → pnpm check → 커밋(author 검증) → PR(템플릿) → 핸드오프 문서
리뷰 에이전트 : 병렬 리뷰(백엔드/프론트/사용자/접근성) → 심각도 태그 → 집계
오케스트레이터: (Blocker+Major) ≤ 3 ? 반영 후 머지 : 다음 라운드(최대 3) → wt.sh rm → BOARD.md 갱신
```

## 11. PR 전 셀프 체크 (구현 에이전트)

- [ ] `pnpm check` 통과, `bash scripts/check-forbidden-words.sh` 통과
- [ ] `git log --format='%an <%ae>' main..HEAD` 전부 `alfks <millie020524@gmail.com>`
- [ ] 티켓 `owns:` 밖 파일을 건드리지 않았음 (`git diff --stat main..HEAD`)
- [ ] 새 디렉토리마다 `AGENTS.md` 존재, 변경한 디렉토리의 `AGENTS.md`가 여전히 참
- [ ] PR 본문 템플릿 채움, 라벨 부착, 핸드오프 문서 경로 기재

## 12. 용어 통일 (코드 식별자 ↔ 한국어)

| 한국어      | 코드                  | 의미                                                        |
| ----------- | --------------------- | ----------------------------------------------------------- |
| 투두        | `Todo`                | 특정 날짜·카테고리에 속한 할 일 한 건                       |
| 카테고리    | `Category`            | 색상을 가진 투두 묶음 (예: 공부, 운동)                      |
| 날짜 스트립 | `DateStrip`           | 상단 가로 스크롤 날짜 선택 UI                               |
| 달성률      | `completionRate`      | 해당 날짜 투두 중 완료 비율 (0~1)                           |
| 테마        | `Theme`               | 라이트/다크 + 강조색(`accentColor`)                         |
| 레퍼런스 앱 | `reference app`       | 벤치마킹 대상 (제품명 금지)                                 |
| 이슈        | GitHub Issue (`#<n>`) | 외부/사용자가 등록하는 요청·버그(레포에 커밋됨)             |
| 티켓        | `T-<n>`               | 에이전트 작업 단위(`.worktrees/tickets/`, 로컬, 커밋 안 함) |
