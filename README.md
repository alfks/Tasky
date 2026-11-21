<div align="center">

<img src="./assets/seal-icon-master-192.png" alt="Tasky 마스코트" width="120" />

# Tasky

**감성 투두 · 일정 관리 데스크탑 웹앱**

날짜를 고르고, 색깔 있는 카테고리 아래 할 일을 적고, 체크할수록 달성률이 차오릅니다.

[![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-8-646cff?logo=vite&logoColor=white)](https://vite.dev)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers%20%2B%20D1-f38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)
[![PWA](https://img.shields.io/badge/PWA-offline%20ready-5a0fc8?logo=pwa&logoColor=white)](#기능)
[![License](https://img.shields.io/badge/license-미정-lightgrey)](#라이선스)

[**배포본 열기**](https://tasky.millie020524.workers.dev/) ·
[기능](#기능) ·
[빠른 시작](#빠른-시작) ·
[문서](#문서) ·
[기여하기](#기여하기)

</div>

---

## 목차

- [소개](#소개)
- [기능](#기능)
- [빠른 시작](#빠른-시작)
- [여러 기기에서 쓰기 — 동기화](#여러-기기에서-쓰기--동기화)
- [기술 스택](#기술-스택)
- [프로젝트 구조](#프로젝트-구조)
- [직접 배포하기](#직접-배포하기)
- [데이터와 프라이버시](#데이터와-프라이버시)
- [프로젝트 상태](#프로젝트-상태)
- [로드맵](#로드맵)
- [문서](#문서)
- [기여하기](#기여하기)
- [라이선스](#라이선스)
- [서드파티 고지](#서드파티-고지)

## 소개

Tasky 는 **로컬 우선(local-first)** 으로 설계된 투두·일정 관리 웹앱입니다. 오프라인에서도 그대로
쓰이고, PWA 로 설치할 수 있습니다(휴대폰 홈 화면 포함). 화면 코드는 저장소 인터페이스 뒤에서 움직이기
때문에, 저장 계층이 브라우저(IndexedDB)에서 서버 동기화로 넓어져도 UI 는 그대로입니다.

> **로그인 안내** — 지금 main 에서 만드는 버전은 **구글 로그인이 필수**입니다. 로그인 전에는 로그인
> 화면만 뜨고, 로그인하면 데이터의 원본은 서버(Cloudflare D1)에, 브라우저(IndexedDB)에는 오프라인용
> 사본이 남습니다. 배포된 주소가 정확히 어느 버전인지는 [프로젝트 상태](#프로젝트-상태)에 적었습니다.

## 기능

| 기능                    | 설명                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 📅 **날짜 스트립**      | 한 주를 가로로 훑으며 하루를 고릅니다. 각 날짜 칸에 그날의 카테고리 색 점과, 전부 끝낸 날의 ✓ 가 붙습니다.               |
| 🎨 **카테고리별 할 일** | 12가지 파스텔 색으로 묶습니다. 추가·수정·삭제·날짜 이동(드래그), 카테고리 순서도 드래그로 바꿉니다.                      |
| 📈 **달성률**           | 그날 완료 비율을 링과 숫자로, 카테고리별로도 나눠 봅니다.                                                                |
| ⏱️ **집중 타이머**      | 할 일 하나를 골라 집중 세션을 돌립니다.                                                                                  |
| 🔁 **루틴**             | 매주·매달 반복 할 일. 종료일 없이 "계속 반복"도 되고, 순서를 바꿀 수 있습니다.                                           |
| 🎯 **D-day 캘린더**     | 기다리는 날을 등록하면 남은 날짜를 세어 줍니다.                                                                          |
| 📝 **하루 기록**        | 그날의 기분을 이모지 하나와 짧은 글로 남깁니다.                                                                          |
| 📊 **기간 통계**        | 주·월 단위 달성률, 연속 달성 일수, 활동 히트맵.                                                                          |
| 🌗 **테마**             | 라이트/다크 + 강조색. 첫 페인트부터 고른 테마로 떠서 깜빡임이 없습니다.                                                  |
| ⌨️ **커맨드 팔레트**    | `Ctrl/⌘ K`. 검색해서 실행하고, 아무것도 안 걸리면 그 문장을 바로 오늘 할 일로 추가합니다.                                |
| 💾 **백업 · 복원**      | 전체 데이터를 파일로 내보내고 다시 불러옵니다. 로그인 여부와 무관하게 언제나 되는 이사·보험입니다.                       |
| 🙋 **프로필**           | 사이드바 맨 위 카드에서 이름과 한마디를 편집합니다.                                                                      |
| 👥 **친구 공유**        | 초대한 친구에게 선택한 기록을 공유하고 응원을 주고받습니다. **기본 꺼짐** — [친구 공유](#친구-공유와-카테고리-공개-범위) |

모든 동작은 **키보드만으로** 됩니다(추가·체크·수정·삭제·날짜 이동). 한글 조합 중 `Enter` 도 정확히
처리합니다.

## 빠른 시작

**요구 사항**: Node 22 · pnpm 10 (`npm`/`yarn` 은 쓰지 않습니다)

```bash
git clone https://github.com/alfks/Tasky.git
cd Tasky
pnpm install
pnpm dev
```

로그인 흐름까지 로컬에서 확인하려면 Worker 와 D1 이 필요합니다 — [직접 배포하기](#직접-배포하기)와
[docs/development.md](./docs/development.md) 를 보세요. 빌드 결과물을 서비스워커까지 포함해 확인하려면:

```bash
pnpm build && pnpm start
```

### 자주 쓰는 명령어

| 명령어          | 하는 일                                                             |
| --------------- | ------------------------------------------------------------------- |
| `pnpm dev`      | 개발 서버                                                           |
| `pnpm build`    | 프로덕션 빌드 + 번들 예산 검사                                      |
| `pnpm start`    | 빌드 산출물을 `wrangler dev` 로 로컬 서빙                           |
| `pnpm test`     | 단위 테스트(Vitest — 브라우저 쪽과 Worker 쪽을 한 번에)             |
| `pnpm test:e2e` | E2E(Playwright, 프로덕션 빌드를 띄워 실행)                          |
| `pnpm check`    | PR 전 전체 검사(금지어·아키텍처·lint·typecheck·format·test 등 11개) |

## 여러 기기에서 쓰기 — 동기화

- **로그인이 필요합니다.** 로그인 없이 쓰는 모드는 없습니다([ADR-0015](./docs/decisions/ADR-0015-google-auth-and-realtime-sync.md)의
  결정). 구글에는 **계정 식별자와 이메일 주소만** 요청합니다(이름·프로필 사진은 요청하지 않습니다).
  로그인 전에 이 기기에 있던 데이터는 말없이 버리지 않고 "올리기" / "내보내고 지우기" 중에 고르게 합니다.
- **같은 할 일을 여러 기기에서.** 한쪽에서 체크하면 다른 쪽도 곧 따라옵니다. 즉시는 아니고, 앱이 앞으로
  나올 때·온라인이 될 때·보이는 동안 30초 주기로 맞춥니다.
- **데이터는 서버가 원본**이고 IndexedDB 는 오프라인용 사본입니다. 지운 항목은 "삭제됨" 표시로 서버에
  남아 다른 기기에 삭제를 전달합니다.
- **오프라인은 그대로 됩니다.** 쓴 것은 기기에 쌓였다가 온라인이 되면 올라가고, 아직 서버에 없는 상태는
  사이드바 계정 블록에 그대로 표시합니다.
- **여러 기기 동시 로그인이 서로를 끊지 않습니다.** 필요하면 "다른 기기 모두 로그아웃"으로 정리합니다.
  세션은 쓰지 않은 채 30일이 지나면 만료되고, 쿠키는 로그인용 하나뿐이며 스크립트가 읽을 수 없습니다.

| 하고 싶은 일       | 방법                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 데이터 가져가기    | 백업 · 복원의 **내보내기**. 로그인 여부와 무관하게 언제나 됩니다.                                                                                      |
| 이 기기에서 나가기 | **로그아웃** — 이 기기의 데이터를 파일로 내보낸 뒤 지웁니다. 서버와 다른 기기의 데이터는 그대로입니다.                                                 |
| 전부 지우기        | **계정 삭제** — 서버의 계정 정보·앱 데이터·기기 표식을 한 번에 지웁니다(되돌릴 수 없습니다). 재가입 방어용으로 **계정 식별자와 삭제 시각**만 남습니다. |

설계: [docs/specs/sync.md](./docs/specs/sync.md) ·
[ADR-0015](./docs/decisions/ADR-0015-google-auth-and-realtime-sync.md) ·
[ADR-0019](./docs/decisions/ADR-0019-worker-d1-auth.md) ·
[ADR-0020](./docs/decisions/ADR-0020-multi-device-sessions.md)

## 기술 스택

|            |                                                                                    |
| ---------- | ---------------------------------------------------------------------------------- |
| 프론트엔드 | Vite 8 (React 19 SPA, 라우터 없음) · TypeScript strict · Tailwind CSS v4 · Zustand |
| 저장소     | Dexie(IndexedDB, 지연 로드) — **repository 패턴** 인터페이스 뒤에 숨김             |
| PWA        | Serwist 9 — 오프라인 프리캐시, 설치 가능                                           |
| 서버       | Cloudflare Workers(정적 자산 + 동기화 API) · D1 · 구글 OAuth(PKCE)                 |
| 테스트     | Vitest(단위, Miniflare D1 포함) · Playwright(E2E)                                  |
| 도구       | pnpm · ESLint(레이어 경계 린트) · Prettier(버전 고정)                              |

## 프로젝트 구조

```text
src/
├── app/            앱 진입점·페이지
├── features/       기능 단위 모듈(투두·카테고리·날짜 스트립·통계·동기화·소셜 …)
├── components/     공용 UI
├── domain/         순수 규칙(React·Dexie import 금지) — 동기화 서버 규칙 포함
├── repositories/   저장소 인터페이스와 구현(Dexie·메모리·동기화)
└── infra/          외부 연동(HTTP 트랜스포트 등)
worker/             Cloudflare Worker — 구글 로그인·세션·동기화 API·D1 마이그레이션
tests/e2e/          Playwright 스펙
docs/               명세(specs)·결정 기록(ADR)·아키텍처
```

의존 방향은 `features/components → domain → repositories(인터페이스)` 한 방향이고, ESLint 가 경계를
검사합니다. 자세한 구조는 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) 와
[docs/DIRECTORY_MAP.md](./docs/DIRECTORY_MAP.md) 를 보세요.

## 직접 배포하기

Cloudflare Workers 의 정적 자산으로 나갑니다. 계정과 API 토큰이 필요합니다.

```bash
pnpm install
cp .env.example .env     # CLOUDFLARE_ACCOUNT_ID · CLOUDFLARE_API_TOKEN 을 채웁니다
                         # 토큰 발급 방법은 .env.example 주석에 단계별로 있습니다

pnpm build
pnpm run deploy:dry-run  # 올라갈 파일 목록만 확인 (자격증명 없이도 됩니다)
pnpm run deploy          # 실제 배포
```

- **`pnpm deploy` 가 아니라 `pnpm run deploy`** 입니다. `deploy` 는 pnpm 내장 명령이라 그냥 쓰면 이
  레포의 배포 스크립트가 아니라 pnpm 의 워크스페이스 배포가 돕니다.
- `.env` 는 `.gitignore` 에 있어 커밋되지 않습니다. 자격증명이 없으면 스크립트가 **조용히 넘어가지 않고
  실패합니다.**
- 실제 배포(dry-run 이 아닌 경우)는 배포 직전에 Worker 시크릿 `GOOGLE_CLIENT_SECRET`·`SESSION_SECRET`
  존재를 확인하고, 하나라도 없으면 멈춥니다. 먼저 올려 두세요.

  ```bash
  wrangler secret put GOOGLE_CLIENT_SECRET
  wrangler secret put SESSION_SECRET
  ```

  같은 자리에서 `wrangler d1 migrations apply tasky --remote` 도 매 배포마다 돕니다.
  `deploy:dry-run` 은 네트워크를 타지 않아 이 단계들을 건너뜁니다.

- GitHub Actions 로 배포하려면 같은 이름의 레포 Secrets(`CLOUDFLARE_*`)와 Variable(`DEPLOY_URL`)을 넣습니다.
- 배포 뒤 확인하는 법: [docs/development.md](./docs/development.md) 의 "배포 확인" 절.

## 데이터와 프라이버시

- 추적 스크립트는 없습니다. 다만 앱 화면을 열 때마다 **Cloudflare Web Analytics** 가 쿠키·기기 식별자
  없이 익명 페이지뷰 신호(경로·리퍼러·브라우저/기기 종류·로딩 속도·IP 로 추정한 대략적인 국가)를
  Cloudflare 로 보냅니다. 보는 것은 집계 통계뿐이며 할 일 내용·이메일 같은 개인 정보는 담기지 않습니다.
  끄는 스위치는 아직 없고, 브라우저가 비콘을 막아도 앱은 그대로 동작합니다
  ([ADR-0021](./docs/decisions/ADR-0021-cloudflare-web-analytics.md)).
- 로그인하면 데이터의 원본은 서버(Cloudflare D1)에 저장됩니다. 브라우저 데이터를 지우면 이 기기의
  사본만 사라지고, 서버 데이터는 다시 내려받습니다. **그래도 백업 내보내기를 권합니다.**
- 무엇을 저장하고 어떻게 지우는지의 단일 소스는 **[개인정보처리방침](./public/privacy.html)**
  (배포본: <https://tasky.millie020524.workers.dev/privacy.html>)입니다. 이 절은 그 페이지로 갈음하고
  다시 늘리지 않습니다.

## 프로젝트 상태

> 아래는 **2026-09-21 사용자 확인** 기준입니다. 확인되면 이 절을 갱신합니다.

**동작하는 것** — 위 기능 전부가 `pnpm dev` 또는 `pnpm build && pnpm start` 로 동작합니다. 동기화는
서버·저장 계층·화면까지 main 에 들어 있습니다.

**배포 현황** — 배포는 개발자가 로컬에서 수동으로 하고 있습니다. GitHub Actions 배포 워크플로는 한
번도 성공한 적이 없어 자동 배포는 없고, CI 도 현재 러너 배정 단계에서 실패해 **`pnpm check` 통과가 PR 전
실질 게이트**입니다.

| 확인된 것                                                              | 아직 미확인                                      |
| ---------------------------------------------------------------------- | ------------------------------------------------ |
| Worker 가 배포 주소에 붙어 있음 (`GET /api/me` → 401 JSON)             | **구글 로그인 실왕복**(아직 아무도 해 보지 않음) |
| 개발용 로그인 우회가 프로덕션에서 닫혀 있음 (`/auth/stub-login` → 404) | 배포본이 정확히 어느 커밋인지(로그인 화면 포함?) |
| 원격 D1 테이블이 생성돼 있음                                           | 옛 배포본이 로그인 없이 쓰던 버전일 가능성       |

Worker 는 새것인데 화면이 옛것으로 보인다면 `scripts/deploy.sh` 가 산출물이 "있는지"만 보고 "최신인지"는
보지 않기 때문일 수 있습니다 — 배포 전에 `pnpm build` 를 직접 돌리세요.

테스트·번들 크기 같은 실측 수치는 자주 바뀌어 이 README 에 두지 않습니다. 최신 값은
[CLAUDE.md](./CLAUDE.md) 상단 "현재 상태" 와 `pnpm test` · `pnpm build` 출력이 단일 소스입니다.

## 로드맵

- [x] **Phase 1 (MVP)** — 날짜 스트립, 카테고리별 할 일, 체크·달성률, 테마/색상
- [x] **Phase 2** — 통계, 루틴, 다이어리, D-day
- [x] **Phase 2 · 동기화** — 구글 로그인 + 서버 동기화(서버·저장 계층·화면 구현, 구글 실왕복은 미검증)
- [x] **Phase 3 · 소셜** — 초대한 친구·선택한 기록 공유·응원·공개 범위 · 구현됨, **기본 off**.
      [릴리스 판정](./docs/phase3-release.md)의 실제 운영 검증은 미완료

### 친구 공유와 카테고리 공개 범위

Phase 3 의 친구 초대·요청·관리, 완료 기록 공유·응원, 내 공유 정리와 익명 공개 읽기를 구현했습니다.
카테고리는 나만 보기·친구만·모두 공개로 설정하며 이름/색/이모지와 직접 고른 사본만 공개합니다. 원래
할 일과 메모는 공개하지 않습니다. 공개된 이름 변경·삭제와 범위 확대/축소는 서버 확인과 명시적 동의를
거칩니다.

운영 설정은 기본 `SOCIAL_MODE=off` 입니다. 구현/PR 머지는 활성화를 뜻하지 않습니다. 실제 구글 로그인,
독립 두 사람 사용성 검증, 원격 D1 비용과 공개 운영 게이트는 증거가 없으면 UNVERIFIED 로 남깁니다.
전체 명세와 구현 추적은 [릴리스 판정](./docs/phase3-release.md)에 있고, 로컬 브라우저 검증은 별도
enabled 서버와 정확한 테스트 계정 allowlist 를 씁니다.

```bash
TASKY_E2E_SOCIAL=1 pnpm exec playwright test social.spec.ts category-visibility.spec.ts --workers=1
pnpm test:e2e # 기본 off 개인 화면 회귀
```

## 문서

| 읽을 것                                | 문서                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 개발 안내(명령어·배포 확인)            | [docs/development.md](./docs/development.md)                                                      |
| 아키텍처·디렉토리 지도                 | [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) · [docs/DIRECTORY_MAP.md](./docs/DIRECTORY_MAP.md) |
| 기능 명세                              | [docs/specs/](./docs/specs/)                                                                      |
| 결정 기록(ADR)                         | [docs/DECISIONS.md](./docs/DECISIONS.md)                                                          |
| 프로젝트 규칙(브랜치·커밋·코드 스타일) | [CLAUDE.md](./CLAUDE.md) · [docs/conventions/](./docs/conventions/)                               |
| 소셜 운영 절차                         | [docs/phase3-social-operations.md](./docs/phase3-social-operations.md)                            |

## 기여하기

이슈와 PR 을 환영합니다. 시작하기 전에 아래를 확인해 주세요. 전체 규칙은
[CLAUDE.md](./CLAUDE.md) 와 [docs/conventions/git-workflow.md](./docs/conventions/git-workflow.md) 에 있습니다.

1. **환경 준비** — `bash scripts/setup.sh` (커밋 author 설정 + 훅 + `pnpm install`).
2. **브랜치** — `feature|fix|refactor|docs|chore|test/<작업명>` (kebab-case 영문). `main` 에는 직접
   push 하지 않고 PR 로만 들어갑니다(squash merge).
3. **커밋** — `<type>(<scope>): <한국어 제목>`, type ∈ `feat|fix|refactor|docs|chore|test|style|perf|ci`.
   예: `feat(todo): 카테고리별 할 일 체크 토글 추가`
4. **검증** — PR 전에 `pnpm check` 와 `pnpm build` 를 통과시킵니다.
5. **코드 원칙** — 시맨틱 요소만 사용(`div onClick` 금지), 파일 ≤ 300줄, `domain` 은 React·Dexie 를
   import 하지 않습니다. 레이어를 넘는 변경은 ADR 이 먼저입니다.
6. **금지어** — 레퍼런스 앱의 실제 제품명은 코드·문서·커밋 어디에도 쓰지 않습니다
   (`bash scripts/check-forbidden-words.sh`).

## 라이선스

아직 정해지지 않았습니다. `LICENSE` 파일이 없으므로 기본적으로 **모든 권리가 유보**됩니다 — 재배포·수정을
허용하려면 라이선스를 명시해야 합니다.

## 서드파티 고지

- **Pretendard** — SIL Open Font License 1.1 — <https://github.com/orioncactus/pretendard>
  (공식 배포 릴리스에서 서브셋, 전문은 `public/fonts/OFL.txt`)
- **Cloudflare Web Analytics** — 앱 화면(`index.html`)이 `static.cloudflareinsights.com` 의 비콘 스크립트를
  불러옵니다. 번들에 포함되지 않는 외부 런타임 스크립트이고, Cloudflare 가 받는 정보는
  [Cloudflare 개인정보처리방침](https://www.cloudflare.com/privacypolicy/)을 따릅니다.
