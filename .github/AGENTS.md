<!-- 읽기 조건: CI가 실패했을 때, 워크플로/템플릿/라벨/CODEOWNERS를 수정할 때. PR을 "만들기만" 할 때는 템플릿이 자동 삽입되므로 읽지 않아도 된다. -->

# .github/ — AGENTS

## 목적

GitHub 자동화와 양식. 규칙을 사람이 기억하지 않아도 되게 만드는 곳.

## 여기 있는 것

`workflows/` 에는 워크플로가 **셋** 있다(`ci.yml`·`deploy.yml`·`e2e.yml`). 파일을 더하거나 지우면 이 목록도 같이 고친다.

- `workflows/ci.yml`: `guard`(금지어·자격증명 파일(`.env`)·AGENTS.md 구조·author/트레일러 + `wt.sh` 스모크 — 항상 / 브랜치명·PR 제목·PR 본문 — PR 일 때만) + `build`(lint·레이어 경계 린트 + 아키텍처 2차 패스·typecheck·format:check·test·build·산출물 금지어, `package.json` 있을 때만) + `perf`(느린 스위트 `pnpm test:slow`). **`perf` 는 `main` push 에서만 돈다 — 일부러 PR 게이트에 붙이지 않았고 `scripts/check.sh` 도 거치지 않는다**(이유는 그 잡의 주석).
- `workflows/e2e.yml`: `e2e`(Playwright chromium 스모크). PR·`main` push 양쪽에서 돈다. 브라우저를 깔고 `pnpm test:e2e` 를 부르는 것까지만 하고, 포트·서버 기동의 단일 소스는 `playwright.config.ts` 의 `webServer`(`pnpm build && pnpm start`)다. `ci.yml` 과 나눈 이유는 파일 머리 주석에 있다.
- `workflows/deploy.yml`: `main` push·수동 실행 시 Cloudflare Workers 배포(ADR-0013 — ADR-0010 을 supersede 하되 **배포 대상·PWA 통합은 그대로 승계**). 시크릿 확인 → `scripts/check.sh` → `pnpm build` → 빌드 산출물 존재·금지어 확인 → `pnpm run deploy:dry-run` → 배포 → 스모크(`vars.DEPLOY_URL` 이 비면 실패).
- `pull_request_template.md`, `ISSUE_TEMPLATE/{feature_request,bug_report}.md`, `ISSUE_TEMPLATE/config.yml`
- `CODEOWNERS`: 전 경로 `@alfks`(규칙·아키텍처 문서 경로도 같은 소유자로 재지정)
- `labels.yml`: 라벨 정의(`type:*`, `area:*`, `review:round-N`, `status:*`, `size:large`, `phase:2`, `adr`)

## 규칙

1. CI 스텝은 `scripts/check-*.sh`를 **호출**한다. 로직을 yml에 중복 구현하지 않는다(로컬과 CI가 같은 스크립트).
2. 워크플로 변경은 `ci(...)` 커밋, PR에 실행 로그 링크 첨부.
3. 액션은 메이저 버전 태그(`@v4`)로 고정. 서드파티 액션 추가는 사용자 확인.
4. 배포 **시크릿**은 `CLOUDFLARE_API_TOKEN`·`CLOUDFLARE_ACCOUNT_ID` 둘뿐이다(ADR-0013 이 ADR-0010 에서 승계). 늘리려면 ADR. 스모크용 `DEPLOY_URL` 은 시크릿이 아니라 레포 **Variable** 이다.
5. 배포 스텝에 `if:`·`continue-on-error`를 붙이지 않는다 — 조건부 스킵은 "시크릿 없는데 초록불"을 만든다. 시크릿·빌드 산출물 확인 스텝은 실패하도록 둔다. E2E 의 브라우저 설치 스텝도 같은 이유로 실패하도록 둔다.
6. 템플릿 문구에 AI 언급·제품명 금지.
7. 라벨 변경은 `labels.yml` 수정 → 상단 주석의 명령으로 동기화.

## 관할: workflows/

## 관할: ISSUE_TEMPLATE/

`.github/workflows/`와 `.github/ISSUE_TEMPLATE/`에는 별도 `AGENTS.md`를 두지 않는다(이 문서가 관할, CLAUDE.md §1-4의 면제 조건).

1. `workflows/*.yml` 수정은 위 "규칙" §1~§3과 동일하게 따른다.
2. `ISSUE_TEMPLATE/*.md` 문구 규칙: AI 언급·제품명 금지(§6과 동일). 새 템플릿 추가 시 `config.yml`에 등록.

## 검증

```bash
ls .github/workflows/                     # 위 "여기 있는 것" 목록과 한 줄씩 대조
gh pr checks <n>                         # 상태
gh run view <run-id> --log-failed | tail -60
act -j guard 2>/dev/null || echo "act 미설치: bash scripts/check-forbidden-words.sh 로 대체"
```

## 자주 하는 실수

- `fetch-depth: 0` 없이 author 검사 → 커밋 범위가 비어 통과처럼 보임. 유지할 것.
- `build` 잡의 `pkg` 스텝("package.json 존재 확인")과 각 스텝의 `if: steps.pkg.outputs.present` 제거 → 스캐폴딩 전 PR 전부 실패. (줄 번호로 가리키지 않는다 — 워크플로가 바뀌면 바로 틀린다.)
- 워크플로를 새로 만들고 위 목록을 안 고침 → 이 문서가 거짓이 된다(CLAUDE.md §11). owns 밖이면 후속 티켓으로라도 남긴다.
- **레포 실제 라벨 ≠ `labels.yml`.** 동기화 명령은 `--force` 로 정의된 라벨을 만들 뿐 정의에 없는 라벨을 지우지 않는다. `labels.yml` 에 없는 라벨(예: `area:command`·`area:shell`·`area:ui`·`area:timer`·`area:docs`·`size:small`)이 PR 에 붙어 쌓여 있다 — 라벨을 고를 땐 `gh label list` 로 실물을 확인한다.
- CI가 현재 계정/레포 차원에서 아예 실행되지 않는다(체크아웃조차 안 됨, 잡 로그 404) — **워크플로를 고쳐도 해결되지 않는다.** 실질 게이트는 `bash scripts/check.sh`(CLAUDE.md 현재 상태 참고).
