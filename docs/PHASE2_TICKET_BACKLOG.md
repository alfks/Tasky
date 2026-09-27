<!-- 읽기 조건: Phase 2(캘린더 D-day·통계·루틴·다이어리) 구현에 착수하기 전, 또는 다른 세션에서 이 작업을 이어받을 때. -->

# Phase 2 구현 티켓 백로그 (스냅샷)

> **이 문서의 기준 시점**: `origin/main` **089086b**(#126, 2026-09-21 T-95 에서 재대조 — 동기화 표는 이 시점 기준이고, T-78~T-86 표는 그 전 a62da2b 시점 대조를 그대로 둔다. `git log --oneline origin/main` 기준). 아래 표의 status 열은 이 커밋 시점까지 `git log`/`git show --stat`로 실제 대조한 값이다 — main 이 더 움직이면 다시 대조하고 고친다. **로컬 `main` 브랜치는 무관한 커밋을 가리키므로 비교 기준으로 쓰지 않는다 — 항상 `origin/main`.**

이 문서는 **기록용 스냅샷**이다. 실제 오케스트레이션의 단일 소스는 언제나 `.worktrees/tickets/T-<n>.md` + `.worktrees/BOARD.md`([.worktrees/AGENTS.md](../.worktrees/AGENTS.md), [conventions/agent-collaboration.md](./conventions/agent-collaboration.md) §1~§2) — 그 디렉토리는 로컬 전용이라 커밋되지 않는다. 이 파일은 컨테이너 세션이 끝나면 그 로컬 파일들이 사라지는 문제를 메우려고, 2026-09-20에 만들어진 티켓 8개를 그대로 옮겨 적어 git에 남겨 둔다.

**사용법**: 새 세션에서 이 작업을 이어받으면, 아래 각 티켓 블록을 그대로 `.worktrees/tickets/T-<n>.md`로 복사하고 BOARD 표를 `.worktrees/BOARD.md`에 붙여넣은 뒤(`bash scripts/wt.sh init`으로 헤더가 없으면 먼저 만든다) 평소대로 오케스트레이터 역할을 계속한다. 구현이 시작되면 이 스냅샷은 낡아진다 — 그때부터는 `.worktrees/BOARD.md`가 다시 단일 소스다.

**진행 현황(2026-09-20 갱신)**: 아래 보드 표는 최초 스냅샷이 아니라 이 시점까지의 실측이다 — 티켓 원문(체크리스트)은 그대로 두고 status 열과 의존 그래프만 고쳤다. 상세는 각 행 status 열 참고.

**진행 현황(2026-09-21 재갱신)**: 2026-09-20 갱신 시점엔 T-78~~T-86 status 열이 대부분 `todo`/`진행 중`으로 남아 있었는데, `git log --oneline origin/main` 대조 결과 **T-78~T-86 전부 머지 완료**다(커밋 해시·PR head 커밋 제목까지 대조). 티켓 원문(체크리스트)은 그대로 두고 status·pr 열만 고쳤다. 그 뒤 추가된 동기화 티켓(T-90~~T-95)도 새 절로 더했다. (이 id 들이 문서 하단 "후속 백로그" 절의 기존 T-90~~T-92 와 한때 겹쳤으나, 동기화 번호가 이미 레포 밖(PR #114 본문·브랜치 커밋 메시지 등)으로 퍼져 있어 후속 백로그 쪽을 T-96~~T-98 로 재번호해 해소했다 — 해당 절 참고.)

**진행 현황(2026-09-21 T-95 재갱신)**: 동기화 트랙 T-90~~T-93 은 **전부 origin/main 에 머지됐다**(#114·#121·#123·#126 — 아래 표의 "확인 근거" 열에 커밋 본문·코드 주석으로 티켓 id 를 맞춘 방법을 적었다). T-94 는 `origin/feature/sync-client` 에서 진행 중(PR 없음), T-95 는 이 문서를 고친 커밋 자신이다. 티켓 원문은 이 문서에 없던 것(T-90~~T-95 는 인수인계 메시지의 제목만 있었다)이라 status·근거 열만 고쳤다. Phase 2 리뷰에서 나왔으나 미뤄진 항목은 문서 하단 "후속 백로그" 에 **T-99~T-103** 으로 더했다.

**진행 현황(2026-09-21 T-105/post-t94 재갱신)**: T-95 가 이 절을 쓴 뒤 **T-94 가 실제로 머지됐다**(#129, T-95 의 #130 보다 늦게). 그래서 T-95(#130)가 "T-94 가 머지되면 고칠 것"으로 남긴 CLAUDE.md·README·privacy.html·development.md·이 문서·FEEL_REPORT 의 서술이 이미 낡아 있었다 — 이 세션이 전부 **재실측**해서 고쳤다(테스트 2,946건/233파일 · E2E 43건/12스펙 · `pnpm check` 11개 · 진입 폐포 gzip 157,932/160,000 · 네트워크 합 200,943/210,000, `bash scripts/check.sh` 로 확인). T-94·T-95 행을 `merged`로 바꾸고, T-95 가 남긴 "T-94 머지 직후 고칠 문서 목록" 절은 전부 처리해 지웠다. 구글 실왕복·Worker 실배포·배포 상태 자체는 여전히 **미확인**(이 컨테이너는 배포 주소로 나가는 요청이 막혀 있다) — 그 서술은 지우지 않고 유지했다.

**진행 현황(2026-09-21 배포 상태 정정)**: 위 절이 "구글 실왕복·Worker 실배포·배포 상태 자체는 여전히 미확인"이라 적은 것 중 **"배포 상태 자체"는 사용자 본인이 이 세션에서 정정했다** — 배포는 사용자가 로컬에서 계속 수동으로 해 왔다(GitHub Actions 자동 배포는 런 124회 전부 실패로 여전히 0회). 다만 **지금 배포본이 어느 커밋인지는 여전히 미확인이다** — 동기화(#126·#129)가 오늘 막 머지됐으므로 그 뒤 재배포하지 않았다면 배포본에는 아직 없을 수 있다. **구글 실왕복·배포된 Worker 의 실제 동작은 여전히 미확인**으로 남겨 둔다. 상세는 `CLAUDE.md` "현재 상태" 블록·`README.md` [지금 상태](../README.md#지금-상태)가 단일 소스다.

**진행 현황(2026-09-21 실환경 확인)**: 사용자가 배포 주소에서 직접 확인해 알려줬다 — `GET /api/me` → `{"error":"unauthorized"}`(401 JSON, Worker 가 붙어 있고 `/api/*` 라우팅이 실환경에서 동작한다), `GET /auth/stub-login?sub=x&email=x@y.z` → **not found(404)**(개발용 로그인 우회 `AUTH_STUB` 이 프로덕션에서 닫혀 있다 — #126 보안 리뷰가 "Cloudflare 엣지가 `Host` 스푸핑 우회를 워커로 라우팅하는지"만 배포본이 없어 미확인으로 남겨 뒀던 구멍이 이제 해소됐다). Worker 는 #126 에서 처음 붙었으므로 **배포본은 #126 이후**다. **다만 넘겨짚지 말 것**: 정확히 어느 커밋인지(#129 클라이언트까지 포함하는지)는 여전히 미확인이다 — `/api/me` 401 은 Worker 존재만 말해 준다. **여전히 미확인으로 남은 것**: 구글 로그인 실왕복(아직 아무도 로그인해 보지 않았다), D1 테이블이 원격에 실제로 생성됐는지(마이그레이션 적용 결과 — 사용자가 확인 중, 확인 명령은 [development.md](./development.md) 참고). 상세는 `CLAUDE.md` "현재 상태" 블록·`README.md` [지금 상태](../README.md#지금-상태)가 단일 소스다.

**진행 현황(2026-09-21 D1 확인·낡은 정적 자산 위험 발견)**: 위 절이 미확인으로 남긴 **"D1 테이블이 원격에 실제로 생성됐는지"는 사용자가 직접 확인해 줬다 — 원격 D1 에 테이블이 생성돼 있다.** 남은 미확인은 구글 로그인 실왕복·배포본이 정확히 어느 커밋인지뿐이다. 같은 확인 과정에서 사용자가 "Worker 는 401(새것)·D1 테이블도 있는데 로그인 화면이 안 뜬다"고 보고했고, 추적한 결과 `scripts/deploy.sh` 의 산출물 검사(146~151행)가 `dist/client` 파일이 **존재·비어 있지 않은지만** 보고 **최신인지는 보지 않아**, pull 이전의 낡은 `dist/client` 가 남아 있으면 Worker·D1 은 최신으로 올라가고 **정적 자산만 옛것**으로 남을 수 있다는 것을 찾았다(**아직 추정 — 사용자가 `pnpm build` 후 재배포해 확인해야 확정**). 후속 티켓 **T-106**으로 남겼다(아래 "후속 백로그" 절). `docs/development.md` "배포 확인" 절에 이 증상의 진단법(Worker 는 새것인데 화면이 옛것이면 `dist/client` 가 낡은 것, 시크릿 창으로 서비스 워커 캐시와 구분)을 추가했고, `CLAUDE.md` §5·`docs/development.md` 의 실배포 명령에 `pnpm build &&` 를 넣어 빌드 누락을 줄였다. `scripts/deploy.sh` 자체는 owns 밖이라 고치지 않았다.

**전제**: 관련 스펙 5개(`docs/specs/calendar.md`·`stats.md`·`routine.md`·`diary.md`·`sync.md`)는 전부 `상태: approved`. `docs/decisions/ADR-0016-schema-v3-dday-diary-routine.md`도 `accepted`. `sync.md` 구현만 별도로 구글 OAuth·Cloudflare D1 자격증명 발급이 선행돼야 한다(sync.md §6). **2026-09-21 정정**: 아래 문장은 2026-09-20 시점엔 맞았지만 지금은 낡았다 — sync.md 구현 티켓(T-90~T-95)이 실제로 생겼다. 아래 표에 추가했다.

## 작업 보드 스냅샷

| id   | title                       | branch                     | owner(model) | status                                                                                                                                                                                                                  | owns                                                                                                                                                     | pr   | round  |
| ---- | --------------------------- | -------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------ |
| T-78 | IndexedDB 스키마 v3 ADR     | docs/adr-schema-v3         | opus         | **merged**(origin/main 6d1b8d3. PR #95 — refs/pull/95/head=3be4410, 제목 일치로 대조 확인. ADR-0016 accepted, 리뷰로 `routines: 'id, active'` → `'id'` 정정 — 불리언 색인 불가. db.ts 실제 적용은 T-79 커밋에서 완료됨) | docs/decisions/\*\*, docs/DECISIONS.md, src/infra/indexeddb/db.ts, migration.test.ts                                                                     | #95  | 1      |
| T-79 | D-day 카드(캘린더)          | feature/calendar-dday      | sonnet       | **merged**(origin/main 24452a8, 38 files changed — db.ts 스키마 v3 적용 포함)                                                                                                                                           | src/features/calendar/\*\*, src/domain/dday/\*\*, dday-repository.\*, memory/repositories.ts, container.ts, indexeddb/repositories.ts, ShellInsights.tsx | #99  | 2      |
| T-80 | 다이어리                    | feature/diary              | sonnet       | **merged**(origin/main 94b0269, 30 files changed)                                                                                                                                                                       | src/features/diary/\*\*, src/domain/diary/\*\*, diary-repository.\*, memory/repositories.ts, container.ts, indexeddb/repositories.ts, ShellMain.tsx      | #105 | 미확인 |
| T-81 | 루틴 도메인+저장소          | feature/routine-domain     | sonnet       | **merged**(origin/main 399e425, 41 files changed — ADR-0017 지연 생성 워터마크 포함)                                                                                                                                    | routine.rules.ts, routine-repository.\*, memory/repositories.ts, container.ts, indexeddb/repositories.ts, todo.ts                                        | #102 | 미확인 |
| T-82 | 루틴 다이얼로그+지연생성    | feature/routine-indefinite | sonnet       | **merged**(origin/main 28f0ed7, 19 files changed — ADR-0017 신규 포함)                                                                                                                                                  | RoutineDialog.tsx, useRoutineForm.ts, todo-actions.ts, TodoItem.tsx, useWeekSummaries.ts                                                                 | #103 | 미확인 |
| T-83 | 루틴 관리 화면              | feature/routine-manager    | sonnet       | **merged**(origin/main dcd812a, 23 files changed)                                                                                                                                                                       | RoutineManager.tsx(신규), ShellSidebar.tsx                                                                                                               | #104 | 미확인 |
| T-84 | chore: 히트맵 토큰          | chore/theme-heatmap-tokens | sonnet       | **merged**(origin/main 3eecb1e, 5 files changed — 히트맵을 파란 램프에서 무채색 잉크 램프로 교체, 카테고리 `sky` 와 충돌 회피)                                                                                          | theme.md, tokens.css                                                                                                                                     | #97  | 1      |
| T-85 | 통계 화면                   | feature/reports            | sonnet       | **merged**(origin/main 30d58e9, 47 files changed)                                                                                                                                                                       | src/features/reports/\*\*, streak.ts, focus-summary.ts, focus-session-repository.\*, CommandPaletteCommands.tsx                                          | #101 | 미확인 |
| T-86 | chore: 백업 v3 payload 확장 | chore/backup-v3-payload    | sonnet       | **merged**(origin/main 5af72c1, 36 files changed) — Dday·DiaryEntry·Routine 세 테이블이 이제 백업에 직렬화된다                                                                                                          | src/domain/backup/\*\*, src/features/backup/\*\*                                                                                                         | #108 | 미확인 |

### 동기화(sync.md) 구현 티켓

이 표의 id는 2026-09-21 인수인계 메시지가 그대로 준 번호다. 한때 문서 하단 "후속 백로그" 절의 T-90~~T-92(코드리뷰에서 나온 별개 항목)와 겹쳤으나, 그쪽을 T-96~~T-98 로 재번호해 해소했다(이력은 해당 절 참고) — 아래 T-90~T-95 는 전부 동기화 트랙만 가리킨다.

| id                    | title                                                                        | branch                                      | 확인 근거                                                                                                                                                                                                                                                                                        | status                                                                                               | pr        |
| --------------------- | ---------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | --------- |
| T-90(동기화)          | ADR-0018(동기화 로컬 스키마·포트)                                            | feature/sync-schema-v4                      | `docs/decisions/ADR-0018-sync-local-schema-and-ports.md` 가 origin/main **68acfdb(#121)** 에서 처음 생겼다(`git log --oneline origin/main -- <파일>`). DECISIONS.md 표에 accepted(2026-09-21)                                                                                                    | **merged**(#121 에 실려 들어옴 — 별도 PR 이 아니었다)                                                | #121      |
| T-91(동기화)          | 동기화 도메인 계층                                                           | feature/sync-domain                         | origin/main **530f803(#114)**. 그 커밋 본문이 "domain/routine 분리는 … T-92 가 받는다" 로 다음 티켓을 지목하므로 이 커밋이 T-91. **68acfdb(#121)** 본문 첫 줄 "T-91 이 함수만 만들고 배선하지 못한 슬롯 id 를 실제 채우기 경로에 잇는다" — #121 은 T-91 의 후속 배선                             | **merged**(#114 + 후속 #121)                                                                         | #114·#121 |
| T-92(동기화)          | 저장소 포트+메모리 가짜 서버+IndexedDB v4+공용 마운트 배선                   | feature/sync-schema-v4 · feature/sync-ports | 스키마 v4·`fillFloor`·슬롯 id 배선은 **68acfdb(#121)**, 포트·메모리 가짜 서버·아웃박스 적재·HTTP 트랜스포트는 **d0f1ca2(#123)**. #123 본문에 티켓 id 가 없다 — 코드 주석이 이 묶음을 `T-92`·`T-92b` 로 부른다(`src/repositories/routine-fill.contract.ts`, `src/domain/routine/routine-fill.ts`) | **merged**(#121 + #123. 티켓 원문 항목별로 어느 PR 이 닫았는지는 **미확인** — 원문이 이 문서에 없다) | #121·#123 |
| T-93(동기화)          | Cloudflare Worker + D1(OAuth·세션 쿠키·/sync·계정 삭제)                      | feature/sync-worker                         | origin/main **089086b(#126)** — `worker/**`·`worker/db/migrations/0001_init.sql`·ADR-0019·`scripts/check-worker-sql.sh`. `scripts/check.sh`·`vitest.config.ts`·`wrangler.jsonc` 주석이 이 변경을 T-93 으로 부른다                                                                                | **merged**(단, 커밋 본문대로 **구글 실왕복·실배포는 미검증**)                                        | #126      |
| T-94(동기화)          | 클라이언트 UI + e2e(지연 로드·폴링 30초)                                     | feature/sync-client                         | origin/main **ee7925a(#129)** — 로그인 화면·`AuthGate`·사이드바 계정 블록·업로드/삭제/전환 다이얼로그·30초 폴링 동기화 엔진·번들 계측을 "진입 폐포" 로 바꾸고 예산 상향(160,000/210,000)·`tests/e2e/sync.spec.ts`(5건)                                                                           | **merged**                                                                                           | #129      |
| T-95(동기화)          | 문서                                                                         | docs/phase2-close                           | origin/main **9154019(#130)** — CLAUDE.md 현재 상태·README·privacy.html·development.md·이 문서·FEEL_REPORT §10                                                                                                                                                                                   | **merged**                                                                                           | #130      |
| T-105(문서, post-t94) | T-94(#129) 머지 직후 문서 정리(아래 "T-94 머지 직후 고칠 문서 목록" 절 실행) | docs/post-t94                               | 이 문서를 고친 브랜치 자신 — CLAUDE.md 현재 상태·README·privacy.html·development.md·이 문서·FEEL_REPORT §11·TECH_PLAN §8 확인                                                                                                                                                                    | **merged**(이 커밋)                                                                                  | -         |

**의존 관계**:

```
T-78(ADR — accepted, db.ts 적용은 T-79 커밋에서 완료)
 └→ T-79(D-day) → T-80(다이어리) → T-81(루틴 도메인+저장소)
                                       ├→ T-82(루틴 다이얼로그) ─┐ 서로 다른 파일, 병렬 가능
                                       └→ T-83(루틴 관리 화면) ─┘
T-84(chore: 히트맵 토큰, 독립) → T-85(통계 화면)
```

**갱신(2026-09-20)**: 이후 의존 관계 권고가 스키마 → **T-81 먼저** → (T-82 ∥ T-83 ∥ T-79) → T-80 으로 바뀌었다(임계 경로 5→3). T-86(백업 v3 payload 확장, 신규·독립)은 세 테이블이 모두 존재해야 하므로 T-79·T-80·T-81 이후 아무 때나.

T-79·T-80·T-81이 `src/repositories/container.ts`·`src/repositories/memory/repositories.ts`·`src/infra/indexeddb/repositories.ts`(공용 파일)를 같이 건드려서 순서대로 직렬화했다(agent-collaboration.md §1.1 owns 교집합 검사). T-82·T-83은 서로 다른 파일만 건드려 T-81 이후 병렬 가능.

**갱신(2026-09-21) — 동기화 티켓 추가**: T-78~T-86(위 8+1개)은 전부 머지돼 임계 경로에서 빠졌다. 그 위에 동기화 트랙이 새로 생겼다(id 번호 충돌 주의는 위 표 참고):

**재갱신(2026-09-21 T-95)** — 아래 사슬은 git 으로 다시 대조한 결과다:

```
T-90(동기화, ADR-0018) ── merged (#121 에 동승)
 └→ T-91(동기화, 동기화 도메인) ── merged (#114, 후속 배선 #121)
     └→ T-92(동기화, 저장소 포트+가짜 서버+IndexedDB v4) ── merged (#121 + #123)
         └→ T-93(동기화, Worker+D1) ── merged (#126) — 실왕복·실배포 미검증
             └→ T-94(동기화, 클라이언트 UI+e2e) ── merged (#129)
                 └→ T-95(동기화, 문서) ── merged (#130, T-94 가 아직 브랜치일 때 쓴 문서)
                     └→ T-105(문서, post-t94) ── merged (이 커밋 — T-94 가 실제로 머지된 뒤 T-95 의 서술을 다시 맞춘다)
```

선후관계 자체(T-91 → T-92 → T-93)는 커밋 순서(#114 → #121 → #123 → #126)와 일치한다. `chore/sync-scaffolding`(PR #109, 머지됨)은 "설정·의존성 기초 배선"만 했고 이 사슬의 어느 티켓 소관도 아니다(#109 본문에 티켓 id 없음).

## 티켓 원문

아래 각 블록은 `.worktrees/tickets/T-<n>.md`에 그대로 붙여넣을 수 있는 원문이다(프론트매터 포함).

### T-78

```markdown
---
id: T-78
title: IndexedDB 스키마 v3 ADR — Dday·DiaryEntry·Routine 테이블
type: docs
branch: docs/adr-schema-v3
worktree: .worktrees/adr-schema-v3
spec: none # ADR 자체가 산출물. calendar.md §4·diary.md §4·routine.md §4가 요구사항
owns:
  - docs/decisions/**
  - docs/DECISIONS.md
  - src/infra/indexeddb/db.ts # ADR-0016 규칙 2 — 세 테이블을 한 PR에서 한 번에 선언(순서대로 나눠 열지 않는다)
  - src/infra/indexeddb/migration.test.ts
reads:
  - docs/decisions/ADR-0011-schema-v2-focus-sessions.md # 직전 스키마 버전업 ADR, 같은 모양
  - docs/decisions/ADR-0005-entity-meta-and-sync-readiness.md
  - docs/decisions/AGENTS.md
  - docs/specs/calendar.md
  - docs/specs/diary.md
  - docs/specs/routine.md
depends_on: []
model: opus
size: S
---

## 목표 (1~3줄)

calendar.md·diary.md·routine.md가 각각 새 저장 엔티티(`Dday`·`DiaryEntry`·`Routine`)를 도입한다. 셋 다 IndexedDB 스키마 버전업(신규 테이블)이라 ADR-0011과 같은 이유로 ADR이 필요하다(docs/decisions/AGENTS.md "ADR이 필요한 변경"). 한 번에 세 테이블을 추가하는 스키마 v3로 묶는다 — 세 번 따로 올리면 마이그레이션이 세 스텝으로 쪼개져 테스트 표면만 늘어난다. **`db.ts`도 이 티켓에서 같이 바꾼다** — `version(3)` 블록은 머지되는 순간 불변이 되므로, 세 테이블을 나중 티켓들이 순서대로 나눠 추가할 수 없다(ADR-0016 규칙 2).

## 완료 조건 (체크리스트, 검증 가능한 문장)

- [x] `docs/decisions/ADR-0016-schema-v3-dday-diary-routine.md` 작성(맥락·결정·마이그레이션 전략·대안·재검토 트리거, ADR-0011 형식). 독립 리뷰 1라운드 반영 완료(request-changes → 인덱스 과설계 제거, routineId 동시 생성 경합을 재검토 트리거에 추가, 인용 오류 정정). **상태 accepted, PR #95로 머지 완료.**
- [x] `docs/DECISIONS.md` 인덱스에 행 추가(PR #95).
- [ ] `db.ts`: `STORES_V2` 신설(기존 `STORES` 보존), `db.version(3)`에 `ddays: 'id'`·`diaryEntries: 'id, date'`·`routines: 'id, active'` 동시 선언, `DB_VERSION = 3`. `.upgrade()` 없음. **(보류 — 사용자 요청으로 구현 미착수)**
- [ ] `migration.test.ts`: v2 픽스처 → v3로 열기 → 기존 로우 값 불변 확인(ADR-0011의 v1→v2 케이스와 같은 모양). **(보류)**

## 범위 밖 (명시적으로 하지 않을 것)

- 세 저장소(DdayRepository·DiaryRepository·RoutineRepository) 인터페이스·구현(T-79·T-80·T-81이 한다 — 이 티켓은 빈 테이블만 연다).
- FocusSessionRepository.listByDateRange 추가(신규 테이블이 아니라 기존 인터페이스 확장이라 별개 판단, stats.md §4 참고 — 이 ADR의 범위 밖).

## 참고 (스펙 섹션, 리서치 문서 섹션 헤더만)

- calendar.md §4, diary.md §4, routine.md §4
- ADR-0011(선례), ADR-0005(Meta·소프트 삭제 규약 — 세 테이블 모두 이 규약을 따른다)
```

### T-79

```markdown
---
id: T-79
title: D-day 카드(캘린더 스펙)
type: feature
branch: feature/calendar-dday
worktree: .worktrees/calendar-dday
spec: docs/specs/calendar.md
owns:
  - src/infra/indexeddb/db.ts # 기존 파일 — db.version(3) 추가(ADR-0016), STORES_V2 신설
  - src/infra/indexeddb/migration.test.ts # 기존 파일 — v2→v3 마이그레이션 케이스 추가(ADR-0016 규칙 2·3)
  - src/features/calendar/** # 새 디렉토리
  - src/domain/dday/** # 새 디렉토리 — Dday 타입, D-n 계산, 정렬
  - src/repositories/dday-repository.ts
  - src/repositories/dday-repository.contract.ts
  - src/repositories/memory/dday-repository.ts
  - src/repositories/memory/repositories.ts # 기존 파일 — 신규 필드 배선(마운트 지점)
  - src/repositories/container.ts # 기존 파일 — Repositories 타입에 dday 필드 추가(마운트 지점)
  - src/infra/indexeddb/dday-indexeddb-repository.ts
  - src/infra/indexeddb/repositories.ts # 기존 파일 — 신규 필드 배선(마운트 지점)
  - src/features/shell/components/ShellInsights.tsx # 기존 파일 — D-day 카드 삽입(app-shell.md R6 순서: 집중→달성률→카테고리별→D-day→단축키)
reads:
  - docs/conventions/code-style.md
  - src/features/AGENTS.md
  - src/domain/AGENTS.md
  - src/repositories/AGENTS.md
  - src/features/date-strip/AGENTS.md # onSelect 선택 동작을 그대로 재사용(calendar.md R6) — 새 이동 로직 금지
  - docs/decisions/ADR-0016-schema-v3-dday-diary-routine.md # db.version(3) 배선 지침(인덱스 문자열 단일 소스)
depends_on: [T-78] # 스키마 v3 ADR
model: sonnet
size: M
---

## 목표 (1~3줄)

미리 정해 둔 날짜(생일·발표일 등)까지 며칠 남았는지 인사이트 패널에 항상 보이게 한다(calendar.md). 새 달력 그리드·새 연도 선택기는 만들지 않는다 — date-strip이 이미 가진 날짜 선택 동작만 그대로 부른다.

## 완료 조건 (체크리스트, 검증 가능한 문장)

- [ ] `db.version(3)` 추가, `STORES_V2` 신설(기존 `STORES` 내용 보존), `ddays: 'id'` 인덱스(ADR-0016). v2→v3 마이그레이션 테스트(기존 로우 값 불변 확인).
- [ ] calendar.md R1~R6 전부 테스트로 검증(D-day CRUD, D-n 표기 경계, 정렬, 접근성).
- [ ] `[+ D-day 추가]` 폼으로 제목+날짜 등록, 목록에 임박순으로 뜬다.
- [ ] 항목 클릭 시 날짜 스트립의 선택 날짜가 그 날짜로 바뀐다(기존 date-strip 선택 로직 재사용 — 새 로직 작성 금지, 이것이 확인 포인트).
- [ ] `✕` 버튼으로 삭제 + 6초 되돌리기 토스트.
- [ ] ShellInsights의 카드 순서가 app-shell.md R6과 일치(집중→달성률→카테고리별→**D-day**→단축키).
- [ ] 키보드만으로 추가·삭제·되돌리기.
- [ ] 라이트/다크 스크린샷(D-day 0개/여러 개).

## 범위 밖 (명시적으로 하지 않을 것)

- 달력 그리드, 연도 선택기(calendar.md §6 — date-strip에 이미 있음).
- D-day 반복(매년), 다른 사람과 공유.

## 참고 (스펙 섹션, 리서치 문서 섹션 헤더만)

- calendar.md §1~§7 전체
- app-shell.md R2·R6(인사이트 패널 폭·순서)
- date-strip.md §2-A-2·§3-A(재사용 대상 선택 동작)
```

### T-80

```markdown
---
id: T-80
title: 다이어리(하루 기록)
type: feature
branch: feature/diary
worktree: .worktrees/diary
spec: docs/specs/diary.md
owns:
  - src/features/diary/** # 새 디렉토리
  - src/domain/diary/** # 새 디렉토리 — DiaryEntry, mood-emoji.ts, 검증
  - src/repositories/diary-repository.ts
  - src/repositories/diary-repository.contract.ts
  - src/repositories/memory/diary-repository.ts
  - src/repositories/memory/repositories.ts # 기존 파일 — 신규 필드 배선(마운트 지점, T-79와 같은 파일 — 직렬화)
  - src/repositories/container.ts # 기존 파일 — 마운트 지점(T-79와 같은 파일 — 직렬화)
  - src/infra/indexeddb/diary-indexeddb-repository.ts
  - src/infra/indexeddb/repositories.ts # 기존 파일 — 마운트 지점(T-79와 같은 파일 — 직렬화)
  - src/features/shell/components/ShellMain.tsx # 기존 파일 — 다이어리 카드를 TodoList 아래에 마운트(diary.md §2)
reads:
  - docs/conventions/code-style.md
  - src/features/AGENTS.md
  - src/domain/AGENTS.md
  - src/repositories/AGENTS.md
  - src/features/category/AGENTS.md # R4-a 이모지 라디오그룹 패턴 재사용(diary.md R3)
depends_on: [T-78, T-79] # 스키마 v3 ADR + container.ts/repositories.ts 공유 파일 직렬화(T-79 먼저)
model: sonnet
size: M
---

## 목표 (1~3줄)

하루를 마치며 기분 이모지 하나와 짧은 글(최대 500자)로 남긴다(diary.md). 스티커·AI 자동 생성 없음(product-overview.md §7 비목표).

## 완료 조건 (체크리스트, 검증 가능한 문장)

- [ ] diary.md R1~R6 전부 테스트(하루 1개 유일성, 500자 경계, 이모지+텍스트 둘 다 빈 경우 저장 불가, 삭제+되돌리기).
- [ ] 날짜 화면 하단에 카드(빈 상태 "오늘 하루 어땠나요?" → `[+ 기록하기]`, 작성됨 → 이모지+텍스트+`[수정]`).
- [ ] 작성/수정 모달: 기분 이모지 24개 제공 목록(radiogroup, 방향키), 텍스트 영역, 글자 수 `aria-live`.
- [ ] 모달 Esc 닫기 + 포커스 트랩 + 닫힌 뒤 원래 위치로 포커스 복귀(diary.md §5).
- [ ] 키보드만으로 작성 → 수정 → 삭제 → 되돌리기.
- [ ] 라이트/다크 스크린샷(빈 상태·작성됨·모달).

## 범위 밖 (명시적으로 하지 않을 것)

- 스티커·캐릭터 이미지, AI 자동 일기, 사진 첨부(product-overview.md §7).
- 날짜 스트립 셀에 기분 이모지 표시(diary.md R6, 선택 항목 — 이 티켓은 다루지 않는다).

## 참고 (스펙 섹션, 리서치 문서 섹션 헤더만)

- diary.md §1~§7 전체
- category.md R4-a(이모지 피커 조작 패턴)
```

### T-81

```markdown
---
id: T-81
title: 루틴 도메인+저장소(Routine 엔티티, 무기한 반복 기반)
type: feature
branch: feature/routine-domain
worktree: .worktrees/routine-domain
spec: docs/specs/routine.md
owns:
  - src/domain/todo/routine.rules.ts # 기존 파일 — endDate 선택형으로, shouldMaterialize 추가
  - src/domain/todo/routine.rules.test.ts
  - src/repositories/routine-repository.ts
  - src/repositories/routine-repository.contract.ts
  - src/repositories/memory/routine-repository.ts
  - src/repositories/memory/repositories.ts # 기존 파일 — 마운트 지점(T-79·T-80과 같은 파일 — 직렬화)
  - src/repositories/container.ts # 기존 파일 — 마운트 지점(T-79·T-80과 같은 파일 — 직렬화)
  - src/infra/indexeddb/routine-indexeddb-repository.ts
  - src/infra/indexeddb/repositories.ts # 기존 파일 — 마운트 지점(T-79·T-80과 같은 파일 — 직렬화)
  - src/domain/todo/todo.ts # 기존 파일 — Todo.routineId? 필드 추가만(다른 필드 변경 금지)
reads:
  - docs/conventions/code-style.md
  - src/domain/AGENTS.md
  - src/repositories/AGENTS.md
  - src/features/todo/hooks/useRoutineForm.ts # 기존 R21 구현 — 반환값(TodoId[]|false) 계약 확인용, 이 티켓에서 수정하지 않음(T-82가 함)
depends_on: [T-78, T-80] # 스키마 v3 ADR + container.ts/repositories.ts 직렬화(T-79·T-80 다음)
model: sonnet
size: M
---

## 목표 (1~3줄)

routine.md의 도메인·저장소 계층만 먼저 놓는다 — 화면(다이얼로그·관리 화면)은 T-82·T-83이 잇는다. 기존 R21(todo.md, `expandRoutineDates`)은 한 글자도 안 바뀐다: `createRoutine`의 입력에서 `endDate`만 선택형으로 바뀌고, 반환(`TodoId[] | false`)은 그대로다.

## 완료 조건 (체크리스트, 검증 가능한 문장)

- [ ] **회귀 없음**: 기존 R21 테스트(`RoutineDialog.test.tsx`, `todo-routine.test.ts`, 22건)가 이 티켓 이후에도 그대로 통과(이 티켓은 그 파일들을 수정하지 않는다 — `owns` 밖).
- [ ] `RoutineRecurrence` 타입 변경 없음(routine.md R1 — daily 유형 추가 안 함).
- [ ] `Routine = Meta & { title, memo?, categoryId?, recurrence, startDate, endDate?, active }` 도메인 타입 + 저장소 CRUD(routine.md §4).
- [ ] `shouldMaterialize(routine, date) → boolean` 순수 함수(routine.md R6, 시각 의존 없음 — `today` 주입 테스트).
- [ ] R3 구간 보정 로직 단위 테스트: 즉시 채우기 결과가 0건이어도(패턴 자체가 유효하면) 등록이 실패하지 않음(routine.md R4·R5, 이번 라운드에서 잡힌 버그 — 반드시 회귀 테스트로 고정). 시작일이 보이는 범위 끝보다 뒤인 경우의 구간 보정(`max`)도 테스트.
- [ ] `(routineId, date)` 중복 생성 방지 계약 테스트(memory·indexeddb 양쪽).

## 범위 밖 (명시적으로 하지 않을 것)

- 다이얼로그 UI("계속 반복" 체크박스), 지연 생성을 date-strip 방문 시점에 실제로 호출하는 배선(T-82).
- 관리 화면(사이드바 진입점, 목록, 중지/재개/삭제 UI)(T-83).

## 참고 (스펙 섹션, 리서치 문서 섹션 헤더만)

- routine.md §3(R1~R12) 전체, §4
- todo.md R21(기존 계약, 회귀 기준선)
```

### T-82

```markdown
---
id: T-82
title: 루틴 등록 다이얼로그 확장("계속 반복") + 지연 생성 연동
type: feature
branch: feature/routine-indefinite
worktree: .worktrees/routine-indefinite
spec: docs/specs/routine.md
owns:
  - src/features/todo/components/RoutineDialog.tsx # 기존 파일 — "계속 반복" 체크박스 추가
  - src/features/todo/hooks/useRoutineForm.ts # 기존 파일 — endDate 선택형, R4 0건-비오류 분기
  - src/features/todo/store/todo-actions.ts # 기존 파일 — createRoutine 입력 시그니처(endDate 선택)
  - src/features/todo/components/TodoItem.tsx # 기존 파일 — 🔁 배지(routine.md §2)
  - src/features/date-strip/hooks/useWeekSummaries.ts # 기존 파일(또는 동급 훅) — 보이는 범위 조회 시 지연 생성 호출(routine.md R6) — 정확한 훅 파일명은 src/features/date-strip/AGENTS.md 확인
reads:
  - docs/conventions/code-style.md
  - src/features/todo/AGENTS.md
  - src/features/date-strip/AGENTS.md
  - docs/specs/date-strip.md # §4(listByDateRange 조회 시점 — 지연 생성 배선 지점)
depends_on: [T-81]
model: sonnet
size: M
---

## 목표 (1~3줄)

T-81이 놓은 도메인·저장소 위에 화면을 잇는다: 다이얼로그에 "계속 반복" 체크박스를 더하고, 날짜 스트립이 새 범위를 읽을 때마다 무기한 루틴의 미생성 날짜를 조용히 채운다(routine.md R6).

## 완료 조건 (체크리스트, 검증 가능한 문장)

- [ ] "계속 반복" 체크박스 체크 시 종료일 입력 `disabled`+빈값, 제출 시 `endDate` 없이 `createRoutine` 호출.
- [ ] 종료일 비운 등록: `Routine` 레코드 저장 + 즉시 채우기(보이는 범위, routine.md R3) + 결과 0건이어도 성공 토스트("곧 반복이 시작돼요") — 이 배선이 T-81의 버그 수정을 실제로 화면에서 체감 가능하게 만드는 지점이므로 통합 테스트 필수.
- [ ] 날짜 스트립으로 미래 날짜를 열면(즉시 채우기 밖 범위) 그 방문 시점에 지연 생성이 일어나고(토스트 없음), 새로고침 없이 목록에 뜬다.
- [ ] 루틴에서 나온 투두에 🔁 배지, hover 시 "매주 금·토 반복" 등 텍스트.
- [ ] 키보드만으로 무기한 루틴 등록 → 날짜 이동 → 인스턴스 등장 → 체크.
- [ ] 라이트/다크 스크린샷(다이얼로그 "계속 반복" 체크, 🔁 배지 투두).

## 범위 밖 (명시적으로 하지 않을 것)

- 관리 화면(사이드바 진입점, 목록, 중지/재개/삭제)(T-83).
- 두 번째 진입점("+ 루틴 추가", 항목 없이 생성)(T-83, routine.md R12-b).

## 참고 (스펙 섹션, 리서치 문서 섹션 헤더만)

- routine.md §2(다이얼로그 와이어프레임), R2~R6
- date-strip.md §4(listByDateRange 조회 시점)
```

### T-83

```markdown
---
id: T-83
title: 루틴 관리 화면(사이드바 진입점, 중지/재개/삭제)
type: feature
branch: feature/routine-manager
worktree: .worktrees/routine-manager
spec: docs/specs/routine.md
owns:
  - src/features/todo/components/RoutineManager.tsx # 신규
  - src/features/todo/components/RoutineManager.test.tsx # 신규
  - src/features/shell/components/ShellSidebar.tsx # 기존 파일 — "루틴" 진입점 추가(category.md 목록 아래, 정확한 위치는 category.md §2-A 참고)
reads:
  - docs/conventions/code-style.md
  - src/features/todo/AGENTS.md
  - src/features/shell/AGENTS.md
  - docs/specs/category.md # §2-A 사이드바 구조 재사용 패턴
depends_on: [T-81]
model: sonnet
size: M
---

## 목표 (1~3줄)

무기한 루틴을 보고 멈출 수 있는 화면을 더한다(routine.md R7·R7-a·R10·R12-b). T-81의 저장소 위에서 동작하며 T-82(다이얼로그 확장)와는 독립적으로 병렬 가능하다(둘 다 T-81에만 의존).

## 완료 조건 (체크리스트, 검증 가능한 문장)

- [ ] 사이드바 "루틴" 진입점 → 다이얼로그(category.md 구조 재사용) — 목록에 무기한 루틴("계속") + 종료일 있는 루틴("~10/4", 기록용) 모두 표시.
- [ ] 무기한 루틴 행의 `⋯`: 중지·재개·삭제. 종료일 있는 루틴 행의 `⋯`: **삭제만**(routine.md R7-a — 중지·재개 메뉴 자체가 없음, 비활성화가 아니라 없음).
- [ ] 중지 → 그 루틴의 지연 생성이 멈춤(이미 만든 인스턴스는 유지) → 재개 → 다시 이어짐(소급 없음, 멈춰 있던 구간은 채우지 않음).
- [ ] 삭제 → 과거 인스턴스의 `routineId` 연결 유지(기록 보존, 🔁만 사라짐), 이후 생성 중단.
- [ ] "+ 루틴 추가"(두 번째 진입점, routine.md R12-b): 항목 없이 카테고리부터 골라 새 루틴 생성 — T-82의 다이얼로그를 재사용하되 시작 항목(제목·메모 기본값)이 없는 변형.
- [ ] 빈 상태 "아직 계속 반복되는 루틴이 없어요"(종료일 있는 기록은 여기 안 셈, routine.md §2 상태).
- [ ] 키보드만으로 관리 화면 진입 → 중지 → 재개 → 삭제.
- [ ] 라이트/다크 스크린샷(관리 화면 목록, 빈 상태).

## 범위 밖 (명시적으로 하지 않을 것)

- 다이얼로그 자체의 "계속 반복" 체크박스·지연 생성 배선(T-82가 이미 함 — 이 티켓은 재사용만).
- 인스턴스 일괄 재수정(routine.md §6).

## 참고 (스펙 섹션, 리서치 문서 섹션 헤더만)

- routine.md §2(관리 화면 와이어프레임), R7·R7-a·R10·R12
- category.md §2-A(사이드바 목록 구조 패턴)
```

### T-84

```markdown
---
id: T-84
title: 'chore: 히트맵 진하기 4단계 토큰'
type: chore
branch: chore/theme-heatmap-tokens
worktree: .worktrees/theme-heatmap-tokens
spec: docs/specs/theme.md
owns:
  - docs/specs/theme.md # 기존 파일 — §3-A 또는 신규 §3-D류 절에 토큰 추가(스펙이 단일 소스, 규칙5)
  - src/styles/tokens.css # 기존 파일 — 공용 파일, 이 티켓이 끝나기 전 다른 티켓이 손대면 충돌
reads:
  - docs/specs/theme.md
  - docs/specs/stats.md # R6이 요구하는 4단계(0% / 1~49% / 50~99% / 100%, 투두 0개는 5번째 톤)
depends_on: []
model: sonnet
size: XS
---

## 목표 (1~3줄)

stats.md R6(활동 히트맵)이 쓸 진하기 5단계(0% / 1~~49% / 50~~99% / 100% / 기록 없음) 토큰이 아직 theme.md에 없다. 라이트/다크 각각의 HEX를 theme.md에 먼저 확정한다 — stats.md는 스펙 포맷 규칙5(수치는 theme.md 단일 소스)에 따라 값을 만들지 않았다.

## 완료 조건 (체크리스트, 검증 가능한 문장)

- [ ] theme.md에 5단계 토큰 추가(예: `--heatmap-0`~`--heatmap-4`, 이름은 기존 토큰 명명 규칙을 따른다) — 강조색(§3-B) 계열의 명도 단계로, 카테고리 팔레트(§3-C)와는 겹치지 않는 축.
- [ ] 라이트/다크 각각 대비 확인(WCAG 인접 단계 구분 가능 — 명도차 최소 기준은 theme.md 기존 규칙 참고).
- [ ] `src/styles/tokens.css`에 동일 값 반영.
- [ ] `bash scripts/check.sh` 통과(다른 티켓과 충돌 없이 단독 머지 가능한 크기).

## 범위 밖 (명시적으로 하지 않을 것)

- 히트맵 컴포넌트 자체(T-85가 한다). 이 티켓은 토큰 값만 정한다.

## 참고 (스펙 섹션, 리서치 문서 섹션 헤더만)

- theme.md §3-A~§3-C(기존 토큰 명명 패턴)
- stats.md R6
```

### T-85

```markdown
---
id: T-85
title: 통계 화면(기간 달성률·카테고리 비율·스트릭·집중 시간·히트맵)
type: feature
branch: feature/reports
worktree: .worktrees/reports
spec: docs/specs/stats.md
owns:
  - src/features/reports/** # 새 디렉토리 — 이름 주의: src/features/stats/ 는 이미 completion-rate.md(오늘 하루) 구현체라 재사용 불가, 충돌 방지로 다른 이름을 쓴다
  - src/domain/todo/streak.ts # 신규 — computeStreak(isAllDoneByDay, from)
  - src/domain/todo/streak.test.ts
  - src/domain/todo/focus-summary.ts # 신규 — summarizeFocusSeconds(sessions, by)
  - src/domain/todo/focus-summary.test.ts
  - src/repositories/focus-session-repository.ts # 기존 파일 — listByDateRange(from, to) 추가만(다른 메서드 변경 금지)
  - src/repositories/focus-session-repository.contract.ts
  - src/repositories/memory/focus-session-repository.ts
  - src/infra/indexeddb/focus-session-indexeddb-repository.ts
  - src/features/command/components/CommandPaletteCommands.tsx # 기존 파일 — "통계 보기" 명령 추가
reads:
  - docs/conventions/code-style.md
  - src/domain/AGENTS.md
  - src/repositories/AGENTS.md
  - src/features/AGENTS.md
  - src/domain/todo/day-summary.ts # summarizeDays 재사용 대상 — 새로 만들지 않는다(이번 라운드에서 잡힌 중복 버그, 반드시 이 파일을 읽고 시작)
  - docs/specs/completion-rate.md # §4(summarizeByCategory 재사용)
depends_on: [T-84] # 히트맵 토큰 선행
model: sonnet
size: M
---

## 목표 (1~3줄)

completion-rate.md의 "오늘" 한 장을 기간(지난 7일/30일/올해/지정)으로 넓힌다(stats.md). **새 요약 함수를 만들지 않는다** — `day-summary.ts`의 `summarizeDays`와 `completion-rate.ts`의 `summarizeByCategory`를 그대로 쓴다. 신규 로직은 스트릭과 집중 시간 합계 둘뿐이다.

## 완료 조건 (체크리스트, 검증 가능한 문장)

- [ ] stats.md R1~R8 전부 테스트(추이·카테고리 비율은 기존 함수 재사용 확인, 스트릭 경계, 히트맵 4단계, R7 조회 1회씩).
- [ ] **회귀/중복 방지**: `summarizeDays`·`summarizeByCategory`를 그대로 호출하는지 — 새 동명 함수를 만들지 않았는지가 이 티켓의 리뷰 핵심(Blocker 이력 있음, 참고).
- [ ] `FocusSessionRepository.listByDateRange` 추가가 기존 메서드 시그니처를 바꾸지 않았는지 계약 테스트로 확인.
- [ ] 커맨드 팔레트 "통계 보기"로 화면 진입(메인 컬럼 전체 대체).
- [ ] 카테고리 비율 막대는 completion-rate.md R5와 같은 `progressbar` 패턴 재사용(새 패턴 금지).
- [ ] 히트맵은 T-84 토큰만 쓴다(HEX 직접 사용 금지, theme.md R1).
- [ ] 키보드만으로 기간 전환 → 카드 갱신. `role=img`·대체 `table`·`progressbar` 스크린리더 낭독 확인.
- [ ] 라이트/다크 스크린샷(빈 상태·일반·히트맵).

## 범위 밖 (명시적으로 하지 않을 것)

- 엑셀·CSV 내보내기, 다른 사용자와 비교, AI 인사이트(product-overview.md §7).
- 새 차트 라이브러리(stats.md R8 — SVG/CSS로 직접 그린다).

## 참고 (스펙 섹션, 리서치 문서 섹션 헤더만)

- stats.md §1~§7 전체
- completion-rate.md §4, timer.md §4(FocusSession 재구성 원칙)
```

## 후속 백로그 (T-79 리뷰 라운드 2 검증에서 나옴, 아직 티켓 원문 없음)

> **2026-09-21**: 이 절의 T-90~~T-92 를 동기화 트랙과의 id 충돌로 T-96~~T-98 로 옮김(동기화 번호는 PR #114 본문·브랜치 커밋 메시지·ADR-0017·다른 세션의 작업 지시에 이미 퍼져 있어, 이 문서 한 곳에만 있는 쪽을 옮겼다).

- **T-87**: `focus-fallback.ts`(`src/features/shell/lib`)와 `calendar/lib/removal-focus.ts` 의 R14 로직
  중복을 `src/lib/`(`FEATURE_ALLOW` 에 이미 있는, 순환 없는 레이어 — `a11y.ts`·`ime.ts` 와 같은 성격)
  로 통합한다. 지금은 `shell` 이 `AppShell`→`ShellInsights` 를 거쳐 `calendar` 를 조립하므로 원본을
  옮기지 않고는(그리고 `useRemovalReturnFocus` 훅도 같이 옮기지 않고는) D-day 삭제가 그 훅을 직접
  재사용할 수 없다(`import/no-cycle` 실측, T-79 리뷰 라운드 1 Major-1) — `shell/lib/focus-fallback.ts`
  수정은 T-79 owns 밖이라 이번 라운드는 이식(`removal-focus.ts`)으로 우회했다. 이식본은 `region`
  (목록이 통째로 사라졌을 때의 `<nav>` 폴백) 이 빠져 원본과 완전히 같지 않다 — 통합하며 그 차이도
  없앤다(리뷰 라운드 2 Minor).
  - 같이 정리: `src/repositories/memory/repositories.ts` 의 `createMemoryRepositories(tables, ddayTable)`
    가 `ddayTable` 을 별도 인자로 받는 것도 임시 우회다(리뷰 라운드 1 Minor-6) — `live.ts` 의
    `MemoryTables` 에 `ddays`·`diaryEntries`·`routines` 를 흡수하면(T-86 과 묶어도 된다) 다른
    다섯 저장소처럼 `tables` 하나만으로 공유되게 정리할 수 있다.

- **T-88**(T-87 PR #107 리뷰에서 나옴, 아직 티켓 원문 없음): `DdayPanelSection.tsx`(두 곳)와
  `CategoryRemoveDialog.tsx`가 `document.querySelector(\`[${OVERLAY_ALWAYS_LIVE_ATTR}] button\`)`로`@/lib/focus-fallback#toastActionButton`을 **손수 재구현**하고 있다 — T-87 이전엔 그 함수가
shell 에 갇혀 있어 이 컴포넌트들이 직접 셀렉터를 짜야 했지만, 지금은`@/lib/focus-fallback`을
아무 feature 나 import 할 수 있으니 통일 가능하다. **의미가 미묘하게 다르다는 점을 먼저 고친다**:
lib 판은 뷰포트를`reverse()`해 **마지막**(가장 최근) 토스트의 버튼을 고르고, 인라인 재구현
둘은`querySelector`라 문서 순서 **첫** 뷰포트를 고른다 — 토스트가 겹치는 경로(연달아 삭제)에서
결과가 갈릴 수 있다. 셋을`toastActionButton(document)` 호출로 교체하기 전에 그 차이가 실제
  버그인지(아니면 지금 동작이 의도된 것인지) 확인하고, 필요하면 테스트로 고정한 뒤 통일한다.

- **T-89**(T-83 PR #104 리뷰 Nit 에서 나옴, 아직 티켓 원문 없음): `RoutineManager` 가 `categories` 를
  `AppShell` → `ShellSidebar` → `RoutineManager` 로 두 단계 prop-drilling 받는다 — `todo` feature 가
  `@/features/category` 배럴을 직접 import 하면 `category → todo`(이미 `useTodoGroup` 으로 존재)와
  겹쳐 순환이 생기기 때문이다(`RoutineManager.tsx` 주석). 지금 규모(2단계)는 감당할 만해 이번
  라운드는 옮기지 않았다. 더 나은 수는 `RoutineManager`(와 형제 컴포넌트들)를 **아무도 조립하지
  않는** 새 feature(`features/routine/` 또는 `shell` 자신)로 옮기는 것 — 그러면 `@/features/category`
  배럴을 직접 써도 순환이 안 난다(todo 가 아니라 셸 쪽에 두므로). 옮길 때 `todo/index.ts` 의
  `RoutineManager` export·`ShellSidebar.tsx` 의 import 경로·`routine-schedule-label.ts` 동반 이동도
  같이 정리한다.

- **T-96**(T-83 PR #104 리뷰 라운드2에서 나옴, 아직 티켓 원문 없음): **삭제 후 포커스 이동 패턴
  통일.** `src/lib/AGENTS.md`(§ "삭제 뒤 포커스 이동 타이밍")가 방금 표준(effect 의존성, 깃발은
  쓰기 전에)을 명문화했지만, main 에는 그 규칙 확립 전에 짜인 타이밍 추측 코드가 그대로 남아
  있다 — `DiaryCard.tsx` 의 `queueMicrotask`, `useTodoItemFocus`·`useFlipRows`·
  `useFocusStartReset` 의 `requestAnimationFrame`. 문서만으로는 안 옮겨진다: `DiaryCard` 를
  effect 패턴으로 옮기고, 나머지 rAF 셋은 "포커스 이동이 아니라 다른 문제(그려지는 순서를
  기다리는 것)"인지 하나하나 판정해 규칙의 예외로 명시하거나 같이 옮긴다. 세 번째 사람이 또
  `DiaryCard` 를 보고 rAF/microtask 를 고르지 않도록, 규칙이 남기는 것과 옮기는 것을 갈라 적는다.

- **T-97**(e2e 흔들림 수정 리뷰 라운드에서 나옴, 아직 티켓 원문 없음): `CategoryList.tsx:68-71` 의
  `empty` 판정이 `status === 'ready'` 만 보고 `idle`/`loading`/`error` 를 걸러내지 않아, 주석("아직
  안 읽힌 목록 위에서 만들기를 열면 R2·R6 이 빈 모집단으로 돈다")과 달리 `idle` 프레임에서도
  "+ 카테고리 추가" 버튼이 그려질 수 있다. 실해는 작다(`useCategoryForm.ts:79` 가 제출 시점에
  `byId` 를 다시 읽으므로 빈 모집단으로 저장되진 않는다) — 이번 라운드는 고치지 않는다.

- **T-98**(같은 리뷰 라운드에서 나옴, 아직 티켓 원문 없음): `todo` 스토어가 같은 패턴이다 —
  `loadDate` 는 조회만으로 `ready` 를 찍고, 루틴 지연 생성(`materializeRoutines`)은
  `ShellHeader.tsx:194`·`DateStrip` 효과로 별도로 돈다. 날짜를 방문할 때 같은 종류의 뒤늦은
  삽입(그려진 뒤 항목이 끼어드는 것)이 가능하다 — #103 이 방금 머지돼 범위가 커지므로 이번
  라운드는 고치지 않는다.

## 후속 백로그 — Phase 2 동기화 리뷰에서 나온 것 (2026-09-21 T-95 기록, 아직 티켓 원문 없음)

T-96~T-98 은 위 절에서 이미 쓰였으므로 **T-99 부터** 잇는다. 아래 실측 수치는 Phase 2 리뷰(#123·#126 라운드)에서 나온 값을 T-95 가 인수인계받아 옮겨 적은 것이다 — T-95 가 다시 재지는 않았다(재현 조건은 각 항목에 적었다).

- **T-99 — 아웃박스 쓰기 상각.** `src/infra/indexeddb/query.ts#put`·`#bulkPut` 이 엔티티 한 건마다 `syncOutbox` 에 로우 단위로 적재해(ADR-0018 §B-4 의 서브트랜잭션), `DatasetRepository.write`(`src/infra/indexeddb/dataset-indexeddb-repository.ts`)와 `SyncRepository.enqueueAll`(`src/infra/indexeddb/sync-indexeddb-repository.ts`)이 로우 수만큼 서브트랜잭션을 연다. **리뷰 실측: 서브트랜잭션 1,566회가 962 ms, 아웃박스 적재만 빼면 459 ms**(같은 데이터셋·같은 기기, 재현은 `todo-perf.slow.test.ts` 류의 `VITEST_SLOW=1` 경로). 아웃박스 적재를 모아 **한 번의 `bulkPut`** 으로 상각한다. 완료 조건: 같은 측정에서 아웃박스 유무 차이가 100 ms 미만, 계약 테스트(`dataset-repository.contract.ts`·`sync-repository.contract.ts`) 초록.

- **T-100 — 메모리 가짜 서버의 번들 배제를 규칙으로.** 지금 `src/repositories/memory/sync-server.ts`·`sync-transport.ts` 가 앱 번들에 실리지 않는다는 근거는 `src/repositories/AGENTS.md` 규칙 8 의 산문 한 줄("테스트 전용 … 리뷰 체크")뿐이다. 검사로 만든다 — (a) `scripts/check-dist.mjs` 가 `dist/client/assets/*.js` 에서 가짜 서버 고유 식별자를 grep 해 걸리면 FAIL(진입 청크의 `Dexie` 검사와 같은 문법), 또는 (b) ESLint `no-restricted-imports` 로 `src/app/**`·`src/features/**`·`src/infra/**` 에서 `@/repositories/memory/sync-server` import 를 막는다. 둘 중 하나가 아니라 **둘 다** 가 안전하다(빌드 산출물 검사는 동적 import 우회까지 잡고, 린트는 PR 단계에서 먼저 잡는다).

- **T-101 — `gc_floor` GC: 계산과 물리 삭제를 반드시 한 커밋에.** `users.gc_floor` 를 **올리는** 코드는 지금 0건이다(`worker/**` grep — `gcFloor()` 읽기만 있다, `worker/db/entities.ts`). `worker/sync/handler.ts` 는 `cursor < gc_floor` 이면 `resync` 를 돌려주도록 이미 준비돼 있지만, floor 가 영영 0 이라 그 분기가 실전에서 열리지 않는다. 위험: **운영자가 `entities` 의 툼스톤(`deleted = 1`)만 손으로 지우면** 그 seq 를 아직 못 받은 커서의 기기는 `resync` 도 받지 못한 채 삭제를 영구히 놓친다 — 지운 할 일이 그 기기에서 되살아나 다시 올라온다. 그래서 (1) `docs/development.md` "운영 주의" 에 **"`entities` 를 손으로 지우지 마라"** 를 적었고(이 티켓 전까지의 런북), (2) 이 티켓은 `gc_floor` 계산(모든 `devices.last_seq` 의 최소값 — 여기서 비로소 `last_seq` 를 읽는 자리가 생긴다, T-102 참고)과 `DELETE FROM entities WHERE sub = ? AND deleted = 1 AND seq <= ?` 를 **한 커밋·한 `db.batch()`** 에 넣는다. 오래 안 온 기기(`seen_at` 기준)를 floor 계산에서 빼는 정책은 ADR 로 남긴다(DECISIONS.md "예정").

- **T-102 — 유휴 폴링 이중 쓰기.** `worker/sync/handler.ts` 가 요청마다 `touchDevice`(`devices.seen_at` upsert)와 `setDeviceLastSeq`(`devices.last_seq` UPDATE)를 **변경 0건·새 풀 결과 0건인 유휴 폴링에서도** 무조건 2행 쓴다(핸들러 주석에 후속으로 미뤄 둔 것을 명시). 인수인계 계산(T-95 미재검증): D1 무료 쓰기 한도가 읽기보다 **25배 먼저** 닿고, 기기당 하루 8시간 사용(30초 폴링)이면 **약 52 기기-일**에 한도다. 고치는 방향: 커서·`seen_at` 이 바뀌었을 때만 쓰거나(조건부 UPDATE), `seen_at` 갱신을 N분 단위로 양자화한다. `last_seq` 를 읽는 자리가 T-101 에서 생기므로 **T-101 과 같은 사람이 이어서** 하는 편이 낫다.

- **T-103 — `docs/specs/routine.md` §4 서술 정정.** §4 가 "2026-09-21 정정 … 지금은 배경 채우기(`planRoutineFill`)도 이 값(`fillFloor`)을 전진시킨다 — `SyncRepository.existingIds` 가 배선될 때까지의 임시 조치" 라고 적고 있는데, origin/main 의 코드는 그 반대다 — `src/domain/routine/routine-fill.ts` 머리 주석: "**`fillFloor` 는 이 함수가 옮기지 않는다**(ADR-0018 §결정 3, 최종 설계로 복귀)", `fillFloor` 를 바꾸는 곳은 `routine.rules.ts` 의 `createRoutine`·`resumeRoutine` 둘뿐이고 `existingIds` 는 이미 배선됐다(#123). 스펙의 그 문장을 코드에 맞춰 고치고(채우기는 `fillFloor` 를 바꾸지 않는다, 임시 조치는 끝났다), ADR-0018 "## 정정" 절과 어긋나지 않는지 같이 본다. `docs/specs/**` 는 T-95 owns 밖이라 여기 기록만 남긴다.

- **T-106 — `scripts/deploy.sh` 가 낡은 정적 자산을 배포할 수 있다.** `scripts/deploy.sh:146-151` 의
  산출물 검사는 `dist/client/index.html`·`sw.js`·`manifest.webmanifest` 가 **존재하고 비어 있지 않은지만**
  본다 — **최신인지는 보지 않는다.** Worker(`worker/index.ts`)는 소스에서 바로 번들되고 D1 마이그레이션도
  매 배포마다 돌지만, 정적 자산은 이 검사만 통과하면 그대로 올라간다. 그래서 pull 이전에 만든 낡은
  `dist/client` 가 남아 있는 채로 `pnpm run deploy` 를 돌리면 **Worker 는 새것·D1 스키마도 최신인데 화면
  (정적 자산)만 옛것**인 상태로 "성공"할 수 있다 — 부분적으로 성공하므로 무엇이 잘못됐는지 알기 어렵다.
  (2026-09-21, 사용자가 배포 뒤 로그인 화면이 안 뜬다고 보고해 추적하며 나온 발견. **원인이 이것이라는
  것은 아직 추정이다** — 사용자가 `pnpm build` 후 재배포해서 확인해야 확정된다.) 고치는 방향은 이 티켓에서
  정할 일 — 존재 검사 대신 **`pnpm build` 를 스크립트가 직접 돌리거나**, **산출물이 현재 커밋보다
  오래됐으면 멈추거나** 중 무엇을 택할지는 여기서 미리 정하지 않는다.

- **T-104 — `wt.sh` mkdir 폴백 락의 stale 회수 경합(1/8 재현).** 기존 `scripts/check.sh` 전체 실행의 스모크 15번(new 8개 동시)에서 BOARD 행 7/8이 한 번 실패했고, 그 뒤 7번(단독 1·전체 check.sh 1·연속 5)은 8/8이었다. T-3의 최종 `928935f` 재확인에서도 7/8이 다시 나왔다. 이 실패는 #79(T-62, `check-arch.sh` 픽스처 경합)와 별개다. `scripts/wt.sh#board_lock_acquire`의 mkdir 폴백에는 대기자가 옛 PID를 읽은 뒤 새 소유자가 같은 락을 획득해도 옛 PID를 근거로 새 락을 재귀 삭제할 수 있는 TOCTOU가 있다. 관측 7/8과 양립하지만 그 실행의 직접 원인은 자식 종료 상태를 기록하지 않아 확정하지 못했다. `flock`이 있는 환경은 이 폴백을 타지 않는다.
  T-3에서 선택한 보수는 stale 자동 회수를 없애고 기존 20초 대기 뒤 실패로 닫는 것이다. PID 기록 실패는 임계 구역 진입 전에 거절하고, 반납은 현재 소유자 PID를 확인한 뒤 `pid` unlink와 빈 디렉토리 `rmdir`만 한다. 죽은 소유자의 락도 자동 회수하지 않아 수동 확인이 필요해지는 운영 비용을 수용한다. 스모크는 동시 자식 종료 상태와 8개 branch·worktree·BOARD 행을 각각 확인하고, 살아있거나 죽은 보유자의 락과 BOARD가 보존되는지를 결정적으로 검증한다. 원래 실패 로그는 T-95 세션 스크래치패드에만 있었고, T-3의 재발 로그는 로컬 `.worktrees/evidence/T-3/tasky-t3-final-928935f-wt.log`에 보존했다. T-3의 고정 소스 `01f5ae3`에서 `bash -n scripts/wt.sh scripts/test-wt.sh`와 격리 `bash scripts/test-wt.sh`가 각각 exit 0으로 통과했다(동시 자식 8개 각 정상 종료·BOARD/워크트리 정확 1개, 정상 락 잔여물 없음, live/dead owner 락·BOARD 보존). 기존 7/8 실패 두 기록은 보존하며 단일 스모크 통과가 모든 스케줄의 부재를 증명하지는 않는다. 최초 `ensure_board`의 BOARD 생성 경합은 이번 범위 밖이며 별도 후속으로 남긴다.

- **T-107 — 진입 폐포에서 `ShellInsights`(타이머·D-day·통계 섹션)·`DiaryCard` 를 `lazy()` 경계로 뺀다.** R2-C(번들 예산 운영 개선, 2026-09-22) 리뷰에서 나온 제안 — 이번 PR 은 예산·delta 리포트만 다뤘고 `src/**` 는 건드리지 않았다. 지금 진입 폐포 gzip 이 160,070 B 로 예산(164,000 B, R2-C 갱신)의 대부분을 이미 쓰고 있어(여유 3,930 B, `scripts/bundle-baseline.json` 실측 2026-09-23), 다음 기능 PR 이 여유를 또 소진하기 전에 미리 회수해 두는 편이 낫다. 두 컴포넌트 다 날짜 진입 직후 반드시 보여야 하는 화면이 아니라(`ShellInsights` 는 포커스 타이머·D-day·기간 통계처럼 펼쳐야 보이는 2차 섹션, `DiaryCard` 는 다이어리 탭 전환 뒤에야 보인다) `lazy()` + `Suspense` 경계로 빼기 좋은 후보다. 추정 회수량 3~5 kB(gzip) — **추정치이며 이 티켓을 맡는 사람이 `pnpm build` 로 재측정해 근거를 남긴다.** 완료 조건: 진입 폐포 gzip 감소를 `pnpm build` 출력(delta 리포트)으로 확인, 기존 e2e(`tests/e2e/`)가 로딩 스피너·전환 흔들림 없이 그대로 통과, `check-dist.mjs` 의 sync 마커 검사류처럼 "지연 청크로 분리됐는지" 확인이 필요하면 같은 방식으로 검사 추가.
