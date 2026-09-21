<!-- 읽기 조건: `docs/specs/sync.md` 구현 티켓을 발행하기 전에, 프로젝트 소유자가 혼자 자격증명을 발급할 때. -->

# 동기화 자격증명 발급 가이드 (구글 OAuth + Cloudflare D1)

**이 문서가 다루는 것**: 동기화(구글 로그인 + Cloudflare D1)에 필요한 자격증명을 **어디서 발급받고
어디에 넣는지**. 넣는 곳은 서로 다른 **세 곳**이다 — `.env`(로컬 전용, `scripts/deploy.sh`·CI가 읽어
**실제 배포**에 쓴다) · `.dev.vars`(로컬 전용, `wrangler dev`/`pnpm start`가 읽어 **로컬에서 도는
Worker**에 쓴다) · Cloudflare `wrangler secret put`(**배포된 Worker 자체**가 보관 — 한 번 올리면
이후 배포에도 유지된다). **셋은 서로 다른 저장소라 값이 같아도 따로 채워야 한다** — 예를 들어
`GOOGLE_CLIENT_SECRET`을 `.env`에만 적어 두면 로컬 `wrangler dev`도, 배포된 Worker도 그 값을 모른다.
이게 이 발급 과정에서 가장 헷갈리는 지점이므로 각 절마다 "어디에 넣는지"를 명시한다.

근거: `docs/specs/sync.md` §4·§6, `docs/decisions/ADR-0015` §1·결과 4, `.env.example`,
`.dev.vars.example`, `wrangler.jsonc`, `scripts/deploy.sh`, `worker/auth/google.ts`, `worker/router.ts`.
레포 파일은 이 가이드가 고치지 않는다 — 사용자가 채우는 것은 **`.env`·`.dev.vars`(둘 다 git 제외)와
외부 콘솔(Google Cloud Console·Cloudflare 대시보드)뿐**이다.

> **최초 작성 이후 갱신**: 이 문서는 원래 동기화 구현 **착수 전**에 쓰였다(§9는 그때 남은 미정 항목
> 목록). 지금은 동기화(#114·#121·#123·#126·#129)가 이미 구현·머지돼 있어, §9 항목 대부분은
> **결정이 아니라 이미 코드에 반영된 사실**이 됐다 — 각 항목에 "결정됨"으로 표시하고 근거 파일을
> 적었다. **§ 번호는 5개 파일이 그대로 인용하므로 바꾸지 않았다.**

---

## 0. 스펙이 실제로 요구하는 것 (추측 아님)

| 항목                                      | 근거                                                                                  | 누가 만드나                         | 비밀인가                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------- |
| 구글 OAuth **클라이언트 ID**              | sync.md §6 선행 조건, ADR-0015 결과 4                                                 | 사용자(이 가이드)                   | 아니오(브라우저에 노출됨) |
| 구글 OAuth **클라이언트 시크릿**          | sync.md §4 "클라이언트 시크릿은 서버에만"                                             | 사용자(이 가이드)                   | **예**                    |
| Cloudflare **D1 데이터베이스**(이름 + ID) | sync.md §6, ADR-0015 §2                                                               | 사용자(이 가이드)                   | 아니오(ID는 식별자)       |
| Cloudflare **API 토큰에 D1 권한 추가**    | 기존 토큰은 Workers 배포용뿐(.env.example)                                            | 사용자(이 가이드)                   | **예**                    |
| Worker 세션 서명 키 `SESSION_SECRET`      | worker/auth/session.ts, `.dev.vars.example`, `scripts/deploy.sh` "Worker 시크릿 검사" | 사용자(이 가이드)                   | **예**                    |
| Durable Objects 바인딩                    | ADR-0015 결과 4에 적혀 있었으나 **§3 개정으로 DO 를 쓰지 않는다**                     | **불필요** — 구현도 D1만 쓴다(§9-4) | —                         |

흐름 확정 사항(sync.md R2·§4): **Authorization Code + PKCE, 코드→토큰 교환은 Worker 가 한다.**
즉 구글 콘솔에서 만들 클라이언트는 **"웹 애플리케이션" 유형이고 클라이언트 시크릿이 필요하다**
(PKCE 는 추가 보호일 뿐, 구글의 웹 애플리케이션 클라이언트는 교환 시 시크릿을 요구한다). 시크릿은
`.dev.vars`(로컬)와 Cloudflare `wrangler secret put`(배포)에만 둔다 — `worker/auth/google.ts` 가
실제로 이 방식(서버→서버 코드 교환, PKCE `S256`, 스코프 `openid email`)으로 구현돼 있다.

---

## 1. 준비물

1. 구글 계정(로그인 테스트에도 쓸 계정 — 본인 Gmail).
2. Cloudflare 계정 — `.env.example` 의 `CLOUDFLARE_ACCOUNT_ID` 를 이미 채웠다면 그 계정.
3. 로컬에 `.env` 가 없다면 레포 루트에서 `cp .env.example .env` 를 실행한다. **로컬에서 Worker 를
   띄워 로그인을 확인하려면** `.dev.vars` 도 필요하다 — `cp .dev.vars.example .dev.vars`(§3-5).
4. 배포 주소를 정해 둔다. **결정됨(§9-10)**: 커스텀 도메인을 쓰지 않고 `workers.dev` 서브도메인을
   그대로 쓴다 — 지금 배포 주소는 `https://tasky.<본인-subdomain>.workers.dev`(README.md "지금 상태").
   subdomain 은 dash.cloudflare.com → 왼쪽 메뉴 **Compute (Workers)** → 오른쪽 **Your subdomain** 에서
   본다(없으면 거기서 하나 만든다).

---

## 2. 구글 OAuth 클라이언트 발급

구글 콘솔은 2025년부터 OAuth 메뉴가 **"Google Auth Platform"** 으로 옮겨졌다. 옛 이름("API 및 서비스
→ OAuth 동의 화면")으로 들어가도 같은 곳으로 리디렉션된다. 화면 이름은 구글이 계속 바꾸므로, 아래는
**정확한 메뉴명보다 "무엇을 찾는가"** 로 적는다 — 새 UI("Google Auth Platform")와 구 UI("API 및 서비스
→ 사용자 인증 정보") 어느 쪽에서 시작해도 결국 같은 화면들로 이어진다.

### 2-1. 프로젝트 만들기

1. https://console.cloud.google.com 에 로그인한다.
2. 상단 바 왼쪽의 **프로젝트 선택 드롭다운**(구글 클라우드 로고 옆) → **새 프로젝트** 를 누른다.
3. 프로젝트 이름에 `tasky` 를 넣고 **만들기** 를 누른다(조직·위치는 기본값).
4. 상단 드롭다운에서 방금 만든 `tasky` 프로젝트가 선택돼 있는지 확인한다.

### 2-2. 동의 화면(브랜딩) 구성

1. 왼쪽 햄버거 메뉴(≡) → **API 및 서비스** → **OAuth 동의 화면** 을 누른다(→ Google Auth Platform 으로 이동).
2. **시작하기** 를 누른다.
3. **앱 정보**: 앱 이름 `Tasky`, 사용자 지원 이메일 = 본인 Gmail → **다음**.
4. **대상(Audience)**: **외부** 를 고른다 → **다음**. (내부는 Google Workspace 조직 전용이라 개인 계정에서는 선택 불가.)
5. **연락처 정보**: 본인 Gmail → **다음**.
6. **완료** 체크 → **만들기**.

### 2-3. 테스트 사용자 등록 (지금 단계에서 필수)

앱은 처음에 **"테스트" 게시 상태**다. 이 상태에서는 등록한 사람만 로그인할 수 있다.

1. Google Auth Platform 왼쪽 메뉴 → **대상(Audience)** 을 누른다.
2. **테스트 사용자** 절의 **+ Add users** 를 누른다.
3. 로그인 테스트에 쓸 Gmail 주소(본인, 필요하면 폰용 계정도)를 넣고 **저장**.

> 나중에 아무나 로그인하게 하려면 같은 화면의 **앱 게시** 를 누른다. 이 앱이 쓰는 스코프(`openid`·`email`)는
> 민감하지 않은 스코프라 **구글 심사 없이 게시된다**. 단 게시 시 **홈페이지·개인정보처리방침 URL** 을 요구한다 —
> sync.md §6 이 "범위 밖·배포 전 필요" 로 남긴 항목이고, `public/privacy.html`(배포본:
> `https://tasky.<subdomain>.workers.dev/privacy.html`)이 이미 있으니 게시 자체는 막혀 있지 않다.
> **미확인**: 실제로 "앱 게시" 를 눌렀는지 — 지금 앱이 테스트 상태인지 프로덕션 상태인지는 구글
> 콘솔에서만 확인 가능하다(§9-9).

### 2-4. 스코프 (데이터 액세스)

1. 왼쪽 메뉴 → **데이터 액세스(Data Access)** → **범위 추가 또는 삭제**.
2. 목록에서 다음 두 개만 체크한다 → **업데이트** → **저장**.
   - `openid`
   - `.../auth/userinfo.email` (표시 이름 "이메일 주소 보기")
   - **결정됨(§9-3)**: `profile`(이름·사진)은 추가하지 않는다 — `worker/auth/google.ts` 의
     `authorizeUrl()` 이 `scope: 'openid email'` 만 요청하도록 구현됐다. 설정 화면에 이름/사진을
     보일 계획이 생기면 그때 추가한다(민감 스코프 아님, 심사 불필요).

### 2-5. 클라이언트 ID·시크릿 만들기

1. 왼쪽 메뉴 → **클라이언트(Clients)** → **+ 클라이언트 만들기**.
2. **애플리케이션 유형**: **웹 애플리케이션**.
3. **이름**: `tasky-web`.
4. **승인된 JavaScript 원본** — **+ URI 추가** 로 아래를 각각 한 줄씩 넣는다(끝에 `/` 없이, 경로 없이):

   ```
   http://localhost:5173
   http://localhost:8787
   https://tasky.<본인-subdomain>.workers.dev
   ```

   - `5173` = `pnpm dev`(Vite) · `8787` = `pnpm start`(wrangler dev, Worker 가 실제로 도는 쪽).
     **결정됨(§9-2)**: 로그인 왕복(코드 교환)은 **Worker 가 있어야만** 되므로 `pnpm dev`(5173) 단독으로는
     로그인이 끝나지 않는다 — `vite.config.ts` 가 `/api`·`/auth` 를 `127.0.0.1:8787` 로 프록시해서
     Vite HMR 을 유지한 채 8787 의 Worker 가 실제 왕복을 처리한다(`docs/development.md` "동기화(로그인)
     로컬 개발"). 그래서 두 포트 모두 원본/리디렉션에 등록해 둔다 — 넣어 두는 데 비용이 없다.

5. **승인된 리디렉션 URI** — **+ URI 추가** 로 아래를 각각 넣는다:

   ```
   http://localhost:5173/auth/callback
   http://localhost:8787/auth/callback
   https://tasky.<본인-subdomain>.workers.dev/auth/callback
   ```

   - **결정됨(§9-1)**: 경로는 `/auth/callback` 으로 확정됐다 — `worker/router.ts` 의
     `GET /auth/callback` 라우트와 `worker/auth/handlers.ts` 의
     `new URL('/auth/callback', request.url)` 가 정확히 이 경로를 쓴다. 배포 도메인 쪽은
     **끝 슬래시 없이, `https`** 로 등록한다(위 세 번째 줄). 구글은 리디렉션 URI 를 **문자 단위로
     정확히** 비교하므로 `http`/`https`·포트·끝 슬래시가 다르면 `redirect_uri_mismatch` 가 난다.

6. **만들기** 를 누른다.
7. 팝업에 **클라이언트 ID**(`…….apps.googleusercontent.com`)와 **클라이언트 보안 비밀번호**가 뜬다.
   **클라이언트 ID 와 클라이언트 보안 비밀번호, 그리고 승인된 리디렉션 URI 는 전부 이 같은 화면
   (클라이언트(Clients) → `tasky-web`)에서 본다** — 나중에 다시 보려면 좌측 메뉴 **클라이언트** →
   `tasky-web` 을 누르면 ID·원본·리디렉션 URI 목록이 그대로 다시 뜬다(단 보안 비밀번호 값 자체는
   최초 발급 팝업 이후 다시 표시되지 않는다 — 아래 8).
   - 클라이언트 ID → `.env` 의 `GOOGLE_CLIENT_ID=` 와, 로컬 Worker 개발 시 `.dev.vars` 의
     `GOOGLE_CLIENT_ID=`(값을 바꿀 때만 — §3-5 의 "함정" 참고)에 붙여넣는다. **이 클라이언트 ID 는
     `wrangler.jsonc` 의 `vars.GOOGLE_CLIENT_ID` 에도 커밋된다(§3-3·§9-8) — 시크릿과 반드시 같은
     클라이언트의 것이어야 한다.** 다른 클라이언트의 ID·시크릿을 섞으면 토큰 교환이
     `invalid_client` 로 실패한다.
   - 클라이언트 보안 비밀번호 → `.env` 의 `GOOGLE_CLIENT_SECRET=` 과 `.dev.vars` 의
     `GOOGLE_CLIENT_SECRET=` 에 붙여넣는다. **이 팝업을 닫으면 시크릿을 다시 볼 수 없다** — 클라이언트
     화면(위 좌측 메뉴 경로)에서 **"보안 비밀번호 재설정"(Reset secret)** 을 누르면 **새 비밀번호를
     발급**할 수 있다(예전 값은 무효가 된다). 잃어버렸으면 이 방법뿐이다 — 재설정 후에는
     `.env`·`.dev.vars` 를 새 값으로 갱신하고, 배포된 Worker 에도
     `wrangler secret put GOOGLE_CLIENT_SECRET` 을 **다시** 실행해야 한다(§3-4).
8. "JSON 다운로드" 는 누르지 않는다(레포 안에 떨어뜨리면 커밋 위험만 생긴다).

---

## 3. Cloudflare D1 데이터베이스 + API 토큰 권한

### 3-1. API 토큰에 D1 권한 넣기

기존 `.env.example` 안내대로 만든 토큰("Edit Cloudflare Workers" 템플릿)에는 **D1 권한이 없다.** 배포와 D1 생성이 같은 토큰으로 되게 권한을 더한다.

**이미 토큰이 있으면(수정):**

1. dash.cloudflare.com → 우측 상단 프로필 아이콘 → **My Profile** → 왼쪽 탭 **API Tokens**.
2. 기존 토큰 오른쪽의 **⋯** → **Edit**.
3. **Permissions** 절의 **+ Add more** 를 누르고 드롭다운 세 칸을 `Account` · `D1` · `Edit` 로 맞춘다.
4. 최종 권한 목록이 최소 다음을 포함하는지 확인한다:
   - `Account` · `Workers Scripts` · `Edit` (템플릿에 있음 — 배포·`wrangler secret put`·
     `wrangler secret list`. 이 권한이 없으면 `scripts/deploy.sh` 의 "Worker 시크릿 검사" 단계가
     `wrangler secret list` 실패로 막힌다 — §3-4)
   - `Account` · `D1` · `Edit` (새로 추가 — `wrangler d1 create/execute/migrations apply`)
   - `Account` · `Account Settings` · `Read` (템플릿에 있음 — `wrangler whoami`)
   - `User` · `User Details` · `Read` (템플릿에 있음)
   - 나머지(Workers KV·R2·Tail·Zone Workers Routes)는 템플릿이 넣은 것 — 그대로 둬도 된다.
5. **Continue to summary** → **Update token**. 토큰 문자열은 바뀌지 않는다(`.env` 그대로).

**토큰이 없으면(새로 발급):**

1. 같은 화면에서 **Create Token** → "Edit Cloudflare Workers" 의 **Use template**.
2. **Permissions** 에서 **+ Add more** → `Account` · `D1` · `Edit`.
3. **Account Resources** 는 `Include` · 본인 계정, **Zone Resources** 는 그대로(없어도 됨).
4. **Continue to summary** → **Create Token** → 토큰을 복사해 `.env` 의 `CLOUDFLARE_API_TOKEN=` 에 넣는다. **이 화면을 떠나면 다시 볼 수 없다.**

### 3-2. D1 데이터베이스 만들기 (터미널)

레포 루트에서 실행한다. `.env` 의 값을 셸에 올린 뒤 wrangler 를 부른다. **`wrangler` 는 전역 설치가
아니다 — 반드시 `pnpm exec wrangler` 로 부른다**(그냥 `wrangler ...` 를 치면 `command not found`).

```bash
cd /home/user/Tasky
set -a; . ./.env; set +a          # .env 의 키를 현재 셸 환경변수로 (이 터미널에만)
pnpm exec wrangler d1 create tasky
```

출력 예(값은 다르다):

```
✅ Successfully created DB 'tasky' in region APAC
Created your new D1 database.

{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "tasky",
      "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    }
  ]
}
```

1. `database_id` 값을 `.env` 의 `D1_DATABASE_ID=` 에 붙여넣는다(식별자라 비밀은 아니지만 한곳에 모아 둔다).
2. 대시보드에서도 보인다: dash.cloudflare.com → **Storage & Databases** → **D1 SQL Database** → `tasky`.
3. **결정됨(§9-6)**: 바인딩 이름은 `DB`, DB 이름은 `tasky` 로 확정됐다 — `wrangler.jsonc` 의
   `d1_databases[0]` 에 그대로 커밋돼 있다.

### 3-3. `wrangler.jsonc` 의 바인딩 — 이미 커밋됐다

**결정됨(§9-6·§9-8)**: 아래 모양은 더 이상 "구현 티켓이 할 일"이 아니라 **이미 `wrangler.jsonc` 에
커밋돼 있는 현재 상태**다(`main`, `assets`, `d1_databases`, `vars.GOOGLE_CLIENT_ID` 전부 포함).
새로 D1 을 만들 때 사용자가 할 일은 **`database_id` 값이 다르면 `wrangler.jsonc` 의
`d1_databases[0].database_id` 를 그 값으로 맞추는 것**뿐이다(레포에 이미 있는 프로젝트의 D1 을
그대로 쓴다면 이 단계 자체가 필요 없다). 참고로 실제 커밋된 모양:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "tasky",
  "compatibility_date": "2026-09-15",
  "main": "worker/index.ts",
  "tsconfig": "tsconfig.worker.json",
  "assets": {
    "directory": "dist/client",
    "not_found_handling": "single-page-application",
    "binding": "ASSETS",
    "run_worker_first": ["/api/*", "/auth/*"],
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "tasky",
      "database_id": "<3-2 의 database_id>",
      "migrations_dir": "worker/db/migrations",
    },
  ],
  "vars": {
    "GOOGLE_CLIENT_ID": "<2-5 의 클라이언트 ID>", // 비밀 아님 — 커밋됨
  },
}
```

- `database_id` 와 `GOOGLE_CLIENT_ID` 는 **커밋해도 되는 값**이다(Cloudflare·구글 공식 문서 모두 설정 파일에 두는 값). 계정 ID 를 커밋하지 않는 현재 규칙(`wrangler.jsonc` 주석)은 그대로 유지된다.
- `migrations_dir` 는 `worker/db/migrations/`(`0001_init.sql`)를 가리킨다 — D1 스키마는
  `wrangler d1 migrations apply` 로 적용하며, 실제 배포 시 `scripts/deploy.sh` 가 `--remote` 로
  자동 실행한다(§3-4 아래).

### 3-4. 시크릿을 Worker 에 넣기 (배포된 Worker 용) — `GOOGLE_CLIENT_SECRET` + `SESSION_SECRET`

sync.md §4: 시크릿은 서버에만. Cloudflare 에는 `wrangler secret put` 으로 올리며 **한 번 올리면
이후 배포에도 유지된다**(CI 가 다시 올릴 필요 없음). **결정됨(§9-5)**: 세션 쿠키 서명용 서버 비밀의
이름이 `SESSION_SECRET` 으로 확정됐다(`worker/auth/session.ts`) — 아래처럼 **두 시크릿을 모두**
올려야 한다.

```bash
set -a; . ./.env; set +a
printf '%s' "$GOOGLE_CLIENT_SECRET" | pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
printf '%s' "$SESSION_SECRET" | pnpm exec wrangler secret put SESSION_SECRET
```

`SESSION_SECRET` 값은 `.env`/`.dev.vars` 에 미리 준비해 둔다 — 생성:

```bash
openssl rand -base64 32
```

배포용과 로컬(`.dev.vars`)용을 같은 값으로 둘 필요는 없다.

> **주의(이미 확인됨 — 결정 아님, 실측)**: 이 명령은 `tasky` Worker 가 **한 번은 배포된 뒤**에
> 동작한다(없는 Worker 에는 시크릿을 붙일 수 없다 — "Worker not found" 가 나오면 정상이니 첫 Worker
> 배포 뒤 다시 실행). **그리고 지금은 그냥 "언젠가 필요"가 아니라 필수 관문이다**: `scripts/deploy.sh`
> 가 실제 배포(`--dry-run` 아님) 직전에 `wrangler secret list` 로 `GOOGLE_CLIENT_SECRET`·
> `SESSION_SECRET` 두 시크릿이 **존재하는지만** 확인하고(값은 읽지 않는다), 하나라도 없으면
> **`rc=1` 로 배포를 멈춘다**(읽어서 확인함 — `scripts/deploy.sh` "Worker 시크릿 검사" 절, T-93).
> 이 검사는 `wrangler secret list` 자체가 실패해도(토큰에 `Workers Scripts:Edit` 권한이 없으면)
> 막힌다. `--dry-run` 은 이 검사를 건너뛴다(네트워크를 타지 않는다).
> 로컬 `wrangler dev`(`pnpm start`)는 시크릿을 **`.dev.vars`** 파일에서 읽는다(이미 `.gitignore` 에
> 있음, §3-5).

### 3-5. 로컬 개발용 `.dev.vars` — `.env` 와는 별개 (결정됨, §9-7)

**결정됨(§9-7)**: 로컬 시크릿 저장 위치는 "`.env` 하나로 갈지 `.dev.vars` 를 병행할지" 중
**둘 다 쓰는 쪽**으로 확정됐다 — `.env`(배포·CI 전용)와 `.dev.vars`(로컬 `wrangler dev` 전용)를
**병행**한다. `.env.example`·`.dev.vars.example` 둘 다 레포에 커밋돼 있다.

```bash
cp .dev.vars.example .dev.vars
```

그 뒤 `.dev.vars` 의 빈 값(`GOOGLE_CLIENT_SECRET=`·`SESSION_SECRET=`)을 채운다.
`GOOGLE_CLIENT_ID` 는 `wrangler.jsonc` 에 이미 커밋된 값을 그대로 쓰고 싶으면 **그 줄 자체를
지운다**(아래 함정 참고).

> **`.dev.vars` 의 함정(직접 재현 확인됨)**: `wrangler dev` 는 `.dev.vars` 에 키가 **"존재"하기만
> 해도** 그 값을 쓴다. 즉 `GOOGLE_CLIENT_ID=` 처럼 **값을 비워 둔 줄도 "존재"로 쳐서**,
> `wrangler.jsonc` 의 진짜 값(`vars.GOOGLE_CLIENT_ID`)을 **빈 문자열로 덮어써 로그인이 원인 불명으로
> 깨진다.** `wrangler.jsonc` 의 값을 그대로 쓰려면 **`.dev.vars` 에서 그 줄 자체를 지운다** — 값만
> 비워 두면 안 된다. 다른 값을 쓰고 싶을 때만 그 줄을 채운다.
>
> `AUTH_STUB=1` 을 두면(호스트가 localhost/127.0.0.1 일 때만 적용, `worker/auth/stub.ts`) 구글 왕복
> 없이 로그인 플로우를 확인할 수 있다 — `pnpm test:e2e` 가 이 스텁으로 돈다. 배포된 Worker 의
> `wrangler.jsonc` `vars` 에는 이 키 자체가 없어야 한다(이미 없음 — §3-3 의 커밋된 모양 참고).

---

## 4. `.env` 최종 모습

`.env.example` 형식 그대로다(**이미 7개 키가 커밋돼 있다** — 아래는 그 값을 채운 모습). `.env.example`
자체는 이 가이드가 고치지 않는다.

```bash
# ── Cloudflare ────────────────────────────────────────────────────────────────
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
DEPLOY_URL=

# ── 동기화 (sync.md §4 · ADR-0015/ADR-0018) ────────────────────────────────────
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
D1_DATABASE_ID=
SESSION_SECRET=
```

- `scripts/deploy.sh` 는 `.env` 에서 **처음 세 키(`CLOUDFLARE_ACCOUNT_ID`·`CLOUDFLARE_API_TOKEN`·
  `DEPLOY_URL`)만** 읽는다(스크립트 안의 `case` 목록, 읽어서 확인함). 나머지 네 키는 배포 스크립트가
  읽지 않는다 — `GOOGLE_CLIENT_ID`·`D1_DATABASE_ID` 는 `wrangler.jsonc` 에 이미 커밋돼 있고,
  `GOOGLE_CLIENT_SECRET`·`SESSION_SECRET` 은 `wrangler secret put`(§3-4)으로 Cloudflare 가 보관하기
  때문이다. `.env` 에 적어 두는 것은 참고·백업 목적과, 셸에서 직접 값을 꺼내 쓸 때(§3-2·§3-4·§7-1
  의 `set -a; . ./.env; set +a`)를 위해서다.
- 값에 공백·`#` 가 들어가면 따옴표로 감싼다(`deploy.sh` 파서 규칙). 구글 시크릿은 `GOCSPX-…` 형태라 보통 필요 없다.

---

## 5. CI (GitHub Actions) 에 등록할 것

레포 **Settings → Secrets and variables → Actions** (workflow 가 `environment: production` 을 쓰므로 **Environments → production** 에 넣어도 된다 — 기존 둘을 어디에 넣었든 같은 곳에).

| 종류     | 이름                    | 값                                                | 지금 필요한가                                                                                                                            |
| -------- | ----------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Secret   | `CLOUDFLARE_API_TOKEN`  | §3-1 에서 D1 권한을 더한 토큰(수정했으면 값 동일) | 예(`.github/workflows/deploy.yml` 이 첫 스텝에서 확인)                                                                                   |
| Secret   | `CLOUDFLARE_ACCOUNT_ID` | 계정 ID                                           | 예(위와 같은 스텝)                                                                                                                       |
| Variable | `DEPLOY_URL`            | `https://tasky.<subdomain>.workers.dev`           | 예 — 비면 워크플로가 실패한다(README.md)                                                                                                 |
| —        | `GOOGLE_CLIENT_ID`      | —                                                 | **아니오** — 결정됨(§9-8): CI Variable 이 아니라 `wrangler.jsonc` `vars` 로 커밋됐다                                                     |
| —        | `GOOGLE_CLIENT_SECRET`  | —                                                 | **아니오** — `wrangler secret put` 으로 한 번 올리면 Cloudflare 가 보관. CI 워크플로는 이 값을 넘기지 않는다(`deploy.yml` 에 없음, §3-4) |
| —        | `SESSION_SECRET`        | —                                                 | **아니오** — 위와 같은 이유(§3-4)                                                                                                        |
| —        | `D1_DATABASE_ID`        | —                                                 | 아니오 — `wrangler.jsonc` 에 커밋되는 값                                                                                                 |

원칙: **CI 에는 배포에 필요한 최소만.** `GOOGLE_CLIENT_SECRET`·`SESSION_SECRET` 이 CI 에 없다고 배포가
막히는 것은 아니다 — 대신 `scripts/deploy.sh` 가 **Cloudflare 쪽에 이미 올라가 있는지**를 확인한다
(§3-4). 즉 CI 가 실패한다면 원인은 "CI 시크릿이 없어서"가 아니라 "Cloudflare 에 `wrangler secret put`
을 아직 안 해서"일 가능성이 높다.

---

## 6. 보안 주의

절대 커밋하지 않는 것: `.env`, `.dev.vars`, 구글 "JSON 다운로드" 파일(`client_secret_*.json`), 터미널 출력 캡처.

- `scripts/check-env-secrets.sh` 가 막아 주는 것: **파일 이름이 `.env` 또는 `.env.*` 인 파일**(대소문자·후행 공백 변형 포함, `.env.example` 만 예외)이 스테이징·추적되는 것. pre-commit 훅과 `pnpm check` 둘 다 부른다. `git add -f` 로 억지로 넣어도 여기서 잡힌다.
- **막아 주지 못하는 것**(파일명만 보므로): `.dev.vars`(`.gitignore` 에만 의존 — `.dev.vars.example` 은 예외로 커밋됨), `client_secret_xxx.json`, 다른 이름의 파일이나 코드·주석·테스트 안에 적은 토큰. 이건 사람이 지킨다 — 시크릿은 `.env`·`.dev.vars` 에만 적는다(이 문서에는 적지 않는다).
- `VITE_` 로 시작하는 환경변수는 **브라우저 번들에 그대로 박힌다**(Vite 규칙). 시크릿에 `VITE_` 접두사를 붙이는 순간 sync.md §4 위반이다. 클라이언트 ID 는 붙여도 되지만 시크릿은 절대 안 된다.
- 유출됐다고 의심되면 즉시 갱신: Cloudflare 토큰은 API Tokens → ⋯ → **Roll**, 구글 시크릿은 클라이언트 화면 → **보안 비밀번호 재설정**(Reset secret, §2-5). `SESSION_SECRET` 은 `openssl rand -base64 32` 로 다시 생성한다. 셋 다 갱신 후 `.env`·`.dev.vars` 와 (배포된 Worker 라면) `wrangler secret put` 을 다시 한다 — 세 저장소 중 하나만 갱신하면 나머지는 옛 값을 계속 쓴다.
- 채팅·이슈·PR·핸드오프 문서에 시크릿 원문을 붙여넣지 않는다(§10).

---

## 7. 발급이 제대로 됐는지 확인

### 7-1. Cloudflare — 토큰 권한과 D1 (터미널, 1분)

```bash
cd /home/user/Tasky
set -a; . ./.env; set +a
pnpm exec wrangler whoami       # 계정 이름 + 토큰 권한 목록. "d1 (write)" 가 보여야 한다
pnpm exec wrangler d1 list      # tasky 가 한 줄 보여야 한다
pnpm exec wrangler d1 execute tasky --remote --command "SELECT 1 AS ok"   # ok = 1 이 오면 읽기·쓰기 권한 OK
```

- `whoami` 에 D1 이 없으면 §3-1 로 돌아간다. `d1 list` 가 인증 오류면 `.env` 의 토큰이 잘못 붙었거나(줄 끝 공백·따옴표) `set -a` 를 빼먹은 것이다.
- Worker 시크릿이 올라가 있는지는 `pnpm exec wrangler secret list --config wrangler.jsonc` 로 확인한다
  (이름만 나오고 값은 나오지 않는다) — `scripts/deploy.sh` 의 "Worker 시크릿 검사"와 같은 명령이다.

### 7-2. 구글 — 동의 화면까지 실제로 열리는지 (브라우저, 1분)

Worker 가 아직 없어도 **동의 화면과 리디렉션 등록**은 확인할 수 있다. 아래 주소에서 `<클라이언트ID>` 만 바꿔 브라우저 주소창에 붙여넣는다(한 줄):

```
https://accounts.google.com/o/oauth2/v2/auth?client_id=<클라이언트ID>&redirect_uri=http://localhost:8787/auth/callback&response_type=code&scope=openid%20email
```

- 기대: 구글 계정 선택 → "Tasky 이(가) …에 액세스하려고 합니다" 동의 화면 → 허용하면 `http://localhost:8787/auth/callback?code=…` 로 이동하며 **"연결할 수 없음" 페이지**가 뜬다(Worker 가 아직 안 떠 있으면). Worker 를 띄운 채(`pnpm build && pnpm start`) 열면 실제로 로그인이 끝나 앱 화면으로 넘어간다. 여기까지가 정상이다(주소창에 `code=` 가 붙어 있으면 성공 — 그 code 는 10분 뒤 만료되니 무시).
- `redirect_uri_mismatch` 가 뜨면 §2-5 의 5번 목록과 위 주소의 `redirect_uri` 가 글자 단위로 같은지 본다.
- `access_denied` / "앱이 확인되지 않음 · 테스트 사용자만" 이면 §2-3 에 그 Gmail 이 없는 것이다.
- `invalid_scope` 면 §2-4 스코프 저장이 안 된 것이다.
- **구글 계정 없이 로그인 플로우만 확인**하고 싶으면 `.dev.vars` 의 `AUTH_STUB=1`(§3-5)로 스텁
  로그인을 쓴다 — 이 절은 건너뛰어도 된다.

---

## 8. 발급 완료 체크리스트

- [ ] 구글: 프로젝트 `tasky` · 대상 외부 · 테스트 사용자에 본인 Gmail · 스코프 `openid`+`email` · 웹 애플리케이션 클라이언트 `tasky-web` · 원본 3개 · 리디렉션 URI 3개
- [ ] Cloudflare: 토큰에 `D1:Edit` · `wrangler d1 create tasky` 성공 · `whoami`/`d1 list` 통과
- [ ] `.env` 에 7개 키 모두 값이 있음(`DEPLOY_URL` 은 첫 배포 전이면 비어도 됨)
- [ ] `.dev.vars` 에 `GOOGLE_CLIENT_SECRET`·`SESSION_SECRET` 값이 있음(로컬에서 Worker 로 로그인을 확인할 계획이면)
- [ ] 배포된 Worker 에 `wrangler secret put GOOGLE_CLIENT_SECRET`·`wrangler secret put SESSION_SECRET` 완료(`wrangler secret list` 로 이름 확인) — **안 하면 다음 `pnpm run deploy` 가 `rc=1` 로 멈춘다**(§3-4)
- [ ] `git status` 에 `.env`·`.dev.vars`·`client_secret*.json` 이 **안 보임**
- [ ] §7-2 에서 `code=` 까지 도달(또는 `AUTH_STUB=1` 로 스텁 로그인 확인)

---

## 9. 스펙 미정이었던 것 — 지금은 대부분 결정됨

sync.md 와 ADR-0015 가 애초에 정하지 않아 이 가이드가 **제안값**으로 채웠던 지점의 목록이다.
**동기화가 이미 구현·머지된 지금, 아래 대부분은 "제안"이 아니라 코드에 반영된 "결정"이다** — 각
항목에 결정 여부와 근거를 적었다. **목록 순서(1~10)와 번호는 §2·§9-7 등에서 인용되므로 바꾸지
않았다** — 항목이 이미 결정됐다고 목록에서 빼거나 순서를 옮기지 않는다.

1. **결정됨 — OAuth 리디렉션 경로**: `/auth/callback`(제안값 그대로 확정). 근거:
   `worker/router.ts`·`worker/auth/handlers.ts`(§2-5).
2. **결정됨 — 로컬 개발에서 로그인이 도는 포트**: `wrangler dev`(`8787`, `pnpm start`)가 실제
   왕복을 처리하고, Vite(`5173`)는 `/api`·`/auth` 를 그쪽으로 프록시한다. 둘 다 구글 콘솔에
   등록해 둔다(§2-5).
3. **결정됨 — 스코프**: `openid email`(제안값 그대로 확정, `profile` 미추가). 근거:
   `worker/auth/google.ts` 의 `authorizeUrl()`(§2-4).
4. **결정됨 — ADR-0015 결과 4 의 "DO 바인딩"**: 쓰지 않는다. Durable Objects 는 구현에 없고 D1 만
   쓴다 — §3 개정과 실제 구현이 일치한다.
5. **결정됨 — 세션 서명 비밀 이름**: `SESSION_SECRET`. 생성법(`openssl rand -base64 32`)·저장
   위치(`.dev.vars`/`wrangler secret put`)도 확정됐다(§3-4·§3-5). 근거: `worker/auth/session.ts`,
   `scripts/deploy.sh` "Worker 시크릿 검사".
6. **결정됨 — D1 바인딩 이름 / DB 이름**: `DB` / `tasky`(제안값 그대로 확정). 근거: `wrangler.jsonc`
   `d1_databases[0]`(§3-2·§3-3).
7. **결정됨 — 시크릿의 로컬 저장 위치**: `.env`(배포·CI 용)와 `.dev.vars`(로컬 `wrangler dev` 용)를
   **병행**한다 — 하나로 합치지 않는다. `.env.example`·`.dev.vars.example` 둘 다 커밋돼 있다(§3-5,
   `.env.example`·`.dev.vars.example` 갱신도 이때 함께 됨).
8. **결정됨 — `GOOGLE_CLIENT_ID` 전달 경로**: `wrangler.jsonc` `vars` 로 커밋하는 쪽으로 확정됐다
   (CI Variable 은 쓰지 않는다). 근거: `wrangler.jsonc` `vars.GOOGLE_CLIENT_ID`(§3-3·§5).
9. **미확인 — 구글 앱 "게시"(테스트 → 프로덕션) 시점**: 홈페이지·개인정보처리방침 URL 은 이미
   있다(`public/privacy.html`)지만, 실제로 "앱 게시" 버튼을 눌렀는지는 구글 콘솔에서만 확인
   가능하다 — 이 세션에서는 확인하지 않았다(§2-3).
10. **결정됨 — 커스텀 도메인**: 쓰지 않는다. `https://tasky.<subdomain>.workers.dev` 그대로 쓴다.
    근거: `README.md` "지금 상태"의 배포 주소(§1).

---

## 10. 오케스트레이터에게 전달할 것

**채팅에 붙여넣어도 되는 것**(비밀 아님 — 코드·설정에 그대로 들어간다):

```
GOOGLE_CLIENT_ID = <…….apps.googleusercontent.com>
D1 database_name = tasky
D1 database_id   = <xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx>
DEPLOY_URL       = https://tasky.<subdomain>.workers.dev  (정했다면)
등록한 리디렉션 URI 3개 (§2-5, 경로 /auth/callback)
테스트 사용자로 등록한 Gmail (로그인 E2E 에 쓸 계정 — 비밀번호는 절대 아님)
§7 결과: whoami 에 d1 (write) 보임 / d1 list 에 tasky 보임 / 구글 동의 화면 → code= 도달
wrangler secret list 결과: GOOGLE_CLIENT_SECRET·SESSION_SECRET 이름이 보임(값 아님)
```

**절대 채팅에 붙여넣지 않는 것** — `.env`/`.dev.vars`/`wrangler secret put` 에 직접 넣고
**"넣었다"** 한 줄만 알려 준다:

- `CLOUDFLARE_API_TOKEN`
- `GOOGLE_CLIENT_SECRET`
- `SESSION_SECRET`
- `CLOUDFLARE_ACCOUNT_ID` (엄밀히 비밀은 아니지만 레포가 커밋하지 않는 값이다 — 채팅에도 올릴 이유가 없다)

오케스트레이터는 위 "넣었다" 확인 + §8 체크리스트만 보고 sync.md R2·§4 티켓을 발행한다. 시크릿이 실제로 맞는지는 사용자가 §7 로 직접 확인했으므로 에이전트가 값을 볼 필요가 없다.
