<!-- 읽기 조건: src/features/sync/** · eslint.config.mjs · vite.config.ts · scripts/check-dist.mjs 의 T94_LAZY_BOUNDARY.md § 인용을 따라갈 때. -->

# T-94 지연 로드 경계 — 파일 단위 확정 (아키텍트 산출물)

**이 문서가 무엇인가**: T-94(동기화 클라이언트 UI)를 구현하기 **전에**, 어떤 파일을 진입 청크에
정적으로 두고 어떤 파일을 지연(`await import(...)`) 청크로 뗄지 실측(스텁 빌드 9개)으로 정한
설계 문서다. 10개 커밋된 파일(`eslint.config.mjs`·`vite.config.ts`·`scripts/check-dist.mjs`·
`src/features/sync/**`·`src/features/theme/store/theme-store.ts`)이 이 문서의 § 번호를 인용한다.

**지금도 유효한가 — 대체로 그렇다.** 이 설계(§A~§D)는 실제로 그대로 구현·머지됐다(#129) — 진입/지연
경계, `lazy-boundary.test.ts`, `check-dist.mjs` 마커까지 이 문서가 그린 그림 그대로다. 다만 이 문서는
**구현 전 스텁 실측**이라 (1) 예산 숫자는 추정치였고 실물 실측과는 약간 다르며, (2) §E 의 "사용자에게
물을 것" 두 항목은 그때는 미결이었지만 지금은 **둘 다 결정돼 #129 에 반영됐다**. 아래 각 절에 **"갱신
(#129 반영)"** 표시로 실측·결정을 덧붙였다 — **§ 번호는 코드가 그대로 인용하므로 바꾸지 않았다.**
원문의 표·추정치는 "그때 무엇을 근거로 결정했는가"의 기록이라 지우지 않고 그대로 둔다.

- 기준: **`origin/main` `d0f1ca2`**(T-92b #123 머지 후, #124·#125 문서 포함). 코드 인용은 전부 이 리비전이다. `/home/user/Tasky` 워킹트리는 `claude/friendly-dijkstra-g5ovx2`(`3aed4c0`, main 보다 26커밋 뒤)라 **`git show origin/main:<path>`** 와 `git archive` 스냅샷으로 읽었다. 레포 파일은 하나도 고치지 않았고 워크트리도 만들지 않았다.
- 실측 방법: `git archive <rev> | tar -x -C <scratchpad>/t94/<이름>` 으로 스냅샷을 만들고 `/home/user/Tasky/node_modules` 를 심링크한 뒤 **`pnpm build`**(= vite build + serwist + `scripts/check-dist.mjs`)를 돌렸다. 청크 크기는 `check-dist.mjs` 와 같은 방법(`zlib.gzipSync({level:9})`)으로 `dist/client/assets/*.js` 를 하나씩 쟀다. 모든 스냅샷·로그·산출물은 `scratchpad/t94/` 에 남아 있다(`build-*.log`).
- 예산이 넘는지 보려고 **T-94 의 진입 쪽 코드를 스텁으로 실제로 써서 빌드했다**(`scratchpad/t94/o5/src/features/sync/**` 등). 스텁은 진입 쪽(스토어·게이트·런처·로그인 화면)은 거의 완성 모양이고, 지연 쪽(엔진·auth-actions·계정 블록·업로드 다이얼로그)은 **모양만 있고 로직이 얇다** — 그래서 아래 수치는 "실물의 하한" 이고, 실물 추정은 §B-4 에서 따로 한다.

## 0. 실측 표 (이 문서의 근거 전부)

| 스냅샷   | 무엇                                                                                  | `index-*.js` (check-dist 가 재는 값) |       **진입 폐포**¹ | `/assets/*.js` 합 (`NETWORK_BUDGET` 이 재는 값) | check-dist                   |
| -------- | ------------------------------------------------------------------------------------- | -----------------------------------: | -------------------: | ----------------------------------------------: | ---------------------------- |
| `m`      | main `68acfdb` (T-92b 직전)                                                           |                              148,030 |              153,793 |                                         191,692 | PASS                         |
| **`o`**  | **origin/main `d0f1ca2` (T-92b 머지)**                                                |                          **148,923** |          **154,686** |                                     **193,486** | PASS                         |
| `o2`     | o + memory 저장소를 지연 로드²                                                        |                   149,677 (**+754**) | 151,913 (**−2,773**) |                                         193,436 | PASS(플러그인 수정 후)       |
| `o4`     | o + `ReportsScreen` 을 `lazy`                                                         |                 152,109 (**+3,186**) |              154,345 |                                         193,105 | FAIL(진입 예산)              |
| `p`      | o + T-94 스텁, UI 4개 전부 `lazy`                                                     |                              135,708 |              158,289 |                                         202,087 | FAIL(고아 청크 3 + 네트워크) |
| `p2`     | p 에서 `LoginScreen` 만 정적                                                          |                              135,999 |              158,424 |                                         201,306 | FAIL(같음)                   |
| `p3`     | p 에서 `LoginScreen` 만 `lazy`, 나머지 UI 정적                                        |                              147,394 |              156,485 |                                         199,060 | FAIL(고아 청크 3)            |
| `o3`     | o2 + p 의 스텁(UI 전부 `lazy`)                                                        |                              133,485 |              156,066 |                                         202,813 | FAIL(네트워크)               |
| **`o5`** | **o + 권고 배치(엔진·auth·트랜스포트만 지연, UI 전부 정적) + 프리로드 플러그인 수정** |                 **150,530 (+1,607)** | **156,293 (+1,607)** |                            **198,022 (+4,536)** | FAIL(진입 530 B 초과)        |

¹ **진입 폐포** = `index-*.js` + 그 파일이 `import"./x.js"` 로 **정적으로** 끌어오는 청크(`meta-*`·`routine.rules-*`, 스냅샷에 따라 `Button-*`·`Dialog-*`·`jsx-runtime-*`). 브라우저는 이것을 전부 받아야 진입 모듈을 **평가**할 수 있으므로 첫 페인트의 임계 경로는 이 합이다. `check-dist.mjs` 는 `index-*.js` **한 파일만** 잰다(`entryFile` 하나 — `check-dist.mjs` `ENTRY_BUDGET` 절).
² `shell-storage-store.ts` 의 `createMemoryRepositories` 정적 import 를 `await import(...)` 로 바꾼 것(`scratchpad/t94/o2/src/features/shell/store/shell-storage-store.ts:41`).

> **갱신(#129 반영, 실측)**: 위 표는 전부 **스텁**(T-94 코드가 실제로 쓰이기 전) 실측이다. 실물이
> 머지된 뒤(`scripts/check-dist.mjs` 의 실제 출력, `CLAUDE.md` "현재 상태") 값은 **`index-*.js` 단독
> 152,169 B · 진입 폐포 157,932 B(예산 160,000, 여유 2,068) · 네트워크 합 200,943 B(예산 210,000,
> 여유 9,057)**다. §B-4 의 실물 추정(≈151.6~~152.1 kB / ≈157.4~~157.9 kB / ≈202.5~203.0 kB)과 비교하면
> 진입·폐포는 추정 범위 상단과 거의 일치(폐포는 +32 B 차)하지만, **네트워크 합은 추정보다 실제로
> 약 1.5~2 kB 더 작았다**(엔진·auth-actions 의 실물 구현이 추정보다 가벼웠던 것으로 보인다 — 정확한
> 원인은 이 문서 갱신 세션에서 다시 커밋별로 추적하지 않았다, 미확인).

### 0-1. 오케스트레이터가 보낸 전제 두 가지에 대한 대조

**"진입이 130,752 → 148,923 으로 +18 kB 늘었고 원인은 memory `SyncRepository`"** — 실측과 다르다.

- T-92b 가 더한 무게는 **893 B** 다(`m` 148,030 → `o` 148,923, 위성 청크 불변이라 폐포 차이도 893). memory 구현 **전체**(저장소 9개 + `live.ts` + memory sync 저장소)를 별도 청크로 떼어 잰 크기는 **1,984 B**(`o2` 의 `repositories-nrJ0iuwk.js`) + 그것이 infra 와 나눠 쓰는 `outbox-*.js` 768 B 다. 즉 "쓰이지 않는 무게" 는 최대 ≈2.8 kB 이지 18 kB 가 아니다.
- 130,752 → 148,030 은 `f137eb5` → `becf8ae` 사이 48커밋(Phase 2: #99 D-day, #101 리포트, #102~#104 루틴, #105 다이어리, #108 백업 v3, #122 드래그 재정렬 …)이 만든 것이고, **`CLAUDE.md`(origin/main:13)가 이미 "Phase 2 로 여기까지 찼다" 고 적어 두었다.** `adopt-remote`·`syncOutbox` 문자열이 진입에 있다는 관찰은 맞지만(이 문서도 확인: `o` 진입에 각 1건), 그 파일들의 무게가 작다는 것이 요점이다. 커밋별 기여는 **미확인**(48개를 각각 빌드하지 않았다).

**"memory 저장소를 지연으로 내리면 예산이 풀린다"** — 판정: **T-94 선행 작업으로 넣지 않는다.** 근거는 §B-5 (c).

## 1. 읽고 확인한 사실 — 전임자 표(§C-6)의 전제를 바꾼 것

1. **`check-dist` 의 진입 수치는 청크 배치에 따라 흔들린다 — 코드가 줄지 않아도 숫자가 12 kB 준다.** `p` 에서 UI 4개를 `lazy` 로 떼자 rolldown(1.2.8, Vite 8.3.0)이 `Button`(9,571 B)·`Dialog`(3,919 B)·`react/jsx-runtime`(3,328 B)을 **진입에서 분리해 정적 위성 청크**로 만들었고 `index-*.js` 는 135,708 로 "떨어졌다". 폐포는 158,289 로 **올랐다**. 반대로 `o2` 는 memory 를 뗐는데 `routine.rules-*`(3,527 B)가 진입에 **흡수**돼 `index-*.js` 가 754 B **늘었다**(폐포는 2,773 B 줄었다). → `ENTRY_BUDGET` 판정은 **폐포**로 해야 거짓 초록·거짓 빨강이 없다(§B-5, §C-8).
2. **작은 React 컴포넌트를 `lazy` 로 떼면 손해다.** `p`(UI 4개 lazy) 폐포 158,289 vs `p3`(로그인만 lazy) 156,485 — 업로드 다이얼로그·계정 블록을 진입에 **넣었는데** 폐포가 1.8 kB, 네트워크가 3.0 kB **작다**. 분리 청크는 gzip 사전을 공유하지 못하고 청크 보일러플레이트·프리로드 헬퍼가 붙어, 공용 프리미티브(`Button`·`Dialog`)를 쓰는 1 kB 짜리 컴포넌트는 떼는 비용이 크기보다 크다. 전임자 표의 "`components/{LoginScreen,AccountBlock,SyncStatus,UploadDialog,AccountDeleteDialog}.tsx` 각각 `lazy`" 는 이 실측으로 **뒤집는다**.
3. **로그인 화면을 진입에 정적으로 두는 비용은 +291 B 다**(`p2` − `p` 의 `index-*.js`; 폐포 +135 B). SYNC_DESIGN ③-5·CLAUDE.md 의 "+2.5 kB" 는 실측이 아니었다. 스펙 §2 의 화면(제목·한 줄·버튼 하나·오프라인 안내)은 `LoginScreen-*.js` 독립 청크로도 834 B 다.
4. **동적 청크 둘 이상이 나눠 쓰는 모듈은 "고아 청크" 가 되고 `check-dist` 가 거부한다.** `p`·`p3` 에서 `wire-*`(152 B, `isResyncResponse`)·`sync-transport-*`(173 B, `TransportError`)·`validate-rows-*`(1,801 B, `readRemoteRow` 의 reader)가 `sync-engine`·`http-transport`·`validate-backup`·`repositories` 청크 사이의 공유 청크로 떨어져 `index.html` 어디에도 없다 → `FAIL: /assets/wire-*.js 이 index.html 의 어디에서도 참조되지 않습니다`. `vite.config.ts#preloadAsyncChunks` 가 `isDynamicEntry` **만** 프리로드하기 때문(`vite.config.ts:20-36`). `shell-storage-store.ts:9-13` 머리주석이 경고한 바로 그 함정이다. 필터를 `c.type === 'chunk' && !c.isEntry && !html.includes(c.fileName)` 로 바꾸면 `o2`·`o3`·`o5` 모두 참조 검사를 통과한다(실측). **T-94 는 이 한 줄 없이는 `pnpm build` 를 통과할 수 없다** — `vite.config.ts` 는 §D-8 에서 T-93 owns 라 §H 에 owns 조정을 적었다.
5. **배럴이 밖에서 import 되는 컴포넌트는 `lazy` 로 감싸도 떨어져 나가지 않는다.** `o4`: `AppShell` 에서 `ReportsScreen` 을 `lazy(import('@/features/reports/components/ReportsScreen'))` 로 바꿨지만 `useReportsStore` 를 위해 `@/features/reports` 배럴(`index.ts:3` 이 `ReportsScreen` 재export)을 여전히 정적 import 하므로 **리포트 청크가 생기지 않았고** 진입이 3,186 B **늘었다**(프리로드 헬퍼 + `routine.rules` 흡수). → `features/sync/index.ts` 는 지연 대상을 절대 export 하지 않는다(전임자 원칙 (i) 유지), 그리고 "기존 진입 코드 밀어내기"(§B-5 (b))는 배럴 분리가 따라오는 별도 티켓 크기다.
6. **`pnpm check` 에는 빌드가 없다.** `scripts/check.sh:24-37` 의 스텝은 forbidden-words·env·agents-md·author·wt·arch·lint·typecheck·format·test — `check-dist` 는 `pnpm build`(`package.json:12`)에서만 돈다. CI `ci.yml:119` 가 `pnpm build` 를 돌리지만 CI 는 지금 꺼져 있다(CLAUDE.md). → 경계 가드는 **vitest 안**에 있어야 PR 게이트가 된다(§C-8), `check-dist` 는 둘째 방어선이다.
7. **`Providers` 가 이미 Dexie 청크를 기다리며 `Skeleton` 을 보인다**(`src/app/providers.tsx:27-32` `injection`, `:98-104` pending 분기). `AuthGate` 는 그 안쪽 자식이라 `getRepositories().sync.getState()` 한 번(IDB `get` 1회)이 **새로 기다리는 전부**다 — "Dexie 가 지연이라 표식을 못 읽는다" 는 딜레마는 이미 풀려 있다(§A-2).
8. **테마 스토어에는 재조회 진입점이 없다.** `theme-store.ts:103-104` `init` 은 `status !== 'idle'` 이면 즉시 return. `settings` 로우를 풀로 받아들인 뒤 화면에 반영하려면 새 액션이 필요하다(§D-10, owns +1 파일).
9. **`enqueueAll` 은 한 트랜잭션 안의 로우별 `outboxPut`** 이다(`sync-indexeddb-repository.ts:60-72`). 오케스트레이터가 잰 988 ms 는 `query.ts#put` 의 **로우별 별도 트랜잭션**(`query.ts:314-319`, 1,566회) 비용이고, `enqueueAll` 은 트랜잭션 1개라 그보다 싸지만 `await` 직렬 put 이다(§D-11).
10. **`exportBackup` 은 사용자가 저장을 취소하면 `false` 를 돌려준다**(`backup-actions.ts:190-196`). 로그아웃 = "내보낸 뒤 삭제" 이므로 `false` 면 **wipe 를 하지 않는다**(§D-10).
11. 시맨틱 마커 실측(`o5` dist): `X-Tasky`·`protocol:`·`resync` 는 진입 0 / 전체 1, `reject-stale` 는 **전체 0**(가짜 서버·`server-rules.ts` 가 안 실렸다는 증거), `Google` 은 진입 1(로그인 화면 정적). 식별자 이름(`readRemoteRow`·`createMemorySyncServer`)은 **minify 로 사라져 0** — 마커는 **문자열 리터럴**이어야 한다(§C-8).

## A. 진입 청크에 무엇이 남는가

### A-1. 로그인 필수 딜레마

전제: R1 "표식이 없으면 로그인 화면 외 어떤 화면도 보여주지 않는다". 첫 방문자의 첫 의미 있는 화면은 **로그인 화면**이고, 앱 본체는 진입에 있다.

| 선택지                                                                          | 첫 방문자가 보는 것                                                                                                      | 비용(실측)                                                                                                                                                                    | 판정                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(A) `LoginScreen` 을 진입에 정적으로**(SYNC_DESIGN ③-5 원안)                  | Providers 스켈레톤(기존) → 표식 조회 1회 → **즉시** 로그인 화면. Suspense 공백 없음                                      | `index-*.js` **+291 B**, 폐포 +135 B, 네트워크 −834 B(독립 청크 소멸) — `p2` vs `p`                                                                                           | **채택**                                                                                                                                                                                                                         |
| (B) `LoginScreen` 을 `lazy` + `<head>` modulepreload(전임자 §C-6)               | 같은 순서지만 스켈레톤 → (청크 평가) → 로그인. modulepreload 미지원 브라우저(Safari < 17, Firefox < 115)는 왕복 1회 추가 | `p3`: 독립 청크 834 B + `jsx-runtime` 분리(3,328 B 위성) + 프리로드 헬퍼. 폐포 기준 (A) 보다 **크다**                                                                         | 기각 — 얻는 것이 없다                                                                                                                                                                                                            |
| (C) `AuthGate` 를 `Providers` **밖**에 두고 localStorage 힌트로 Dexie 전에 판정 | Dexie 청크를 기다리지 않고 로그인 화면(첫 방문자만 이득, 재방문은 어차피 앱 본체가 Dexie 를 기다린다)                    | 코드 0.3 kB + **표식의 둘째 소스**. 선례는 있다 — `index.html:47` 첫 페인트 스크립트가 `tasky.theme.v1` 미러를 읽고 `theme-store.ts:105-109` 가 "저장소가 우선" 으로 화해한다 | 기각 — R1 은 `syncState.userSub` 를 표식으로 못 박았고(sync.md §4), 로그아웃·401·계정 전환마다 두 소스를 맞춰야 한다. Dexie 청크는 어차피 `<head>` 에서 병렬로 오므로 절약은 파싱 시간뿐(ADR-0013 §결과: 스켈레톤 노출 10~15 ms) |
| (D) 앱 본체를 지연으로 내리고 로그인만 진입에                                   | 첫 방문자 최적                                                                                                           | 화면이 하나뿐인 SPA 의 구조 전체를 뒤집는다(ADR-0001·0013). `o4` 가 보여주듯 한 화면만 떼는 것도 배럴 분리가 따라온다                                                         | 기각 — 이 Phase 밖                                                                                                                                                                                                               |

결론: **로그인 화면은 진입 청크에 정적으로 둔다.** 첫 방문자 경로 = HTML(테마 스크립트) → `index-*.js` + 위성 + Dexie 청크 병렬 수신 → Providers 스켈레톤(기존과 동일) → `AuthGate` 표식 조회(IDB get 1회, 같은 스켈레톤 유지) → 로그인 화면. **기존 첫 방문자 경로와 비교해 새로 기다리는 것은 IDB get 한 번뿐이다.**

### A-2. `AuthGate` 는 진입이고 `Providers` 안쪽이다

- 위치: `src/app/page.tsx` 가 `<AuthGate><AppShell/></AuthGate>` (전임자 그대로). `main.tsx:24-28` 이 `<Providers><Page/></Providers>` 이므로 `AuthGate` 는 주입이 끝난 뒤에만 렌더된다 → `getRepositories().sync.getState()` 를 **동기 계약 그대로** 부를 수 있다(ADR-0013 규칙 7 "비동기 구간은 조립 지점 한 곳에 갇힌다").
- 첫 페인트에 보이는 것(순서): ① `index.html` 의 배경·테마(첫 페인트 스크립트, JS 전) → ② Providers `Skeleton`(`providers.tsx:98-104`, Dexie 대기) → ③ `AuthGate` `phase: 'checking'` — **같은 모양의 `Skeleton`** 을 그린다(모양이 바뀌면 깜빡임이 하나 늘어난다) → ④ 표식 없음 → `LoginScreen` / 표식 있음 → `AppShell` 즉시(R6, 오프라인 포함).
- 표식은 **`getState()` 결과의 `userSub` 유무**다(`wire.ts:98-101` `SyncState.userSub?`; `sync-indexeddb-repository`·memory 둘 다 한 번도 로그인 안 했으면 `undefined`, `sync-repository.ts` 머리주석). `deviceId` 생성은 게이트가 아니라 **첫 로그인 확정 시점**(`auth-actions`, 지연)에서 한다 — 진입은 `crypto.randomUUID` 도 부르지 않는다.
- **OAuth 콜백 복귀**(표식은 없는데 쿠키는 있는 유일한 순간): ~~게이트는 표식이 없으면 로그인 화면을 즉시 그리고, 백그라운드에서 `auth-actions`(지연) 의 `probeSession()` 이 `/api/me` 를 부른다. 그러면 콜백 직후 로그인 화면이 한 프레임 이상 깜빡인다. 해결: Worker 콜백이 `/?auth=done` 으로 복귀하고, 게이트는 그 쿼리가 있으면 `'checking'` 을 유지한 채 `probeSession` 을 기다린 뒤 `history.replaceState` 로 지운다. **T-93 과의 인터페이스 계약**이다 — T-93 브랜치(`.worktrees/sync-worker`)는 지시대로 읽지 않아 현재 콜백 복귀 URL 은 **미확인**. 오케스트레이터가 T-93 완료 조건에 한 줄 넣어야 한다.~~
  **갱신(#129 반영, 확인됨)**: `/?auth=done` 계약은 채택되지 **않았다**. 실제 구현(`worker/auth/handlers.ts` `handleCallback`)은 성공 시 쿼리 없이 `Location: '/'` 로만 돌아가고, 실패는 `/?auth=error`·`/?auth=denied` 뿐이다(`LoginNotice` 타입, `sync-store.ts`). 대신 `bootstrap()`(`sync-store.ts`)이 표식이 없으면 **`'login'` 을 즉시 세우고**, 온라인이면 백그라운드에서 `auth-actions.probeSession()` 을 한 번 부른다(주석: "OAuth 콜백은 `/` 로 그대로 돌아온다(쿼리 표식이 없다) — 표식이 아직 없어도 쿠키가 막 생겼을 수 있으므로 온라인이면 배경에서 한 번 확인한다"). 즉 이 문서가 걱정한 깜빡임은 **`'checking'` 유지가 아니라 `'login'` 을 먼저 보여주고 조용히 승격시키는 쪽**으로 풀렸다 — 콜백 직후 로그인 화면이 한 프레임 보였다가 `AppShell` 로 바뀔 수 있다(허용 가능한 것으로 판단된 것으로 보인다, 이 갱신 세션에서 실제 체감을 재측정하지는 않았다 — 미확인).
- 오프라인 + 표식 없음: 로그인 화면에 "온라인이 되면 로그인할 수 있어요"(SYNC_DESIGN ③-5), 버튼 `aria-disabled` — `navigator.onLine` 을 `useSyncExternalStore` 로 읽는다(스텁 `LoginScreen.tsx:6-15`).

### A-3. 진입에 **반드시** 남는 최소 (파일 단위, 왜 지연이 불가능한가)

| 파일                                                                                     | 왜 진입인가                                                                                                                                                                                                                                                              | 실측/추정                           |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| `src/features/sync/index.ts`                                                             | 배럴. shell·backup 이 이것만 import 할 수 있다(`features/AGENTS.md` 규칙 1·5, lint `exact: FEATURE_PATHS`). export: `AuthGate`·`AccountBlockLauncher`·`useSyncStore`·타입 **넷뿐**                                                                                       | 0                                   |
| `store/sync-store.ts`                                                                    | zustand 상태(`phase`·`email`·`status`·`pendingCount`·`dataRevision`·`uploadPrompt`) + 액션 스텁. `ShellHeader#useSummaryRevision` 이 `dataRevision` 을 **동기 구독**해야 하고, 게이트가 첫 렌더에서 `phase` 를 읽어야 한다. 엔진·auth 로직은 `await import(...)` 로 위임 | 스텁 75줄 ≈ 0.5 kB                  |
| `components/AuthGate.tsx`                                                                | 첫 페인트 분기 자체. 지연이면 첫 방문자에게 빈 화면                                                                                                                                                                                                                      | 48줄 ≈ 0.4 kB                       |
| `components/LoginScreen.tsx`                                                             | §A-1 (A). 첫 방문자의 첫 화면                                                                                                                                                                                                                                            | **+291 B**(실측)                    |
| `components/AccountBlockLauncher.tsx` + `AccountBlock.tsx`                               | 사이드바 맨 끝(R12-a)에 로그인 직후부터 보인다. 사실 2: 떼면 `Button` 이 위성으로 갈라져 더 비싸다                                                                                                                                                                       | 스텁 ≈ 0.6 kB, 실물 ≈ 1.0 kB        |
| `components/UploadDialog.tsx`                                                            | 첫 로그인 직후 바로 뜬다(R7). 사실 2 와 같은 이유; `Dialog` 는 이미 진입에 있다                                                                                                                                                                                          | 스텁 ≈ 0.55 kB, 실물 ≈ 0.9 kB       |
| `components/AccountDeleteDialog.tsx`(또는 `ConfirmDialog` 직접 사용)                     | `ConfirmDialog`(`components/ui/ConfirmDialog.tsx:11-25` props) 재사용이라 본문은 문구 몇 줄. 떼면 손해                                                                                                                                                                   | 실물 ≈ 0.4 kB(스텁 없음 — **추정**) |
| `src/app/page.tsx`·`providers.tsx` 두 줄                                                 | 조립 지점                                                                                                                                                                                                                                                                | ≈ 0.1 kB                            |
| `ShellSidebar.tsx` 한 줄·`ShellHeader.tsx` 한 줄                                         | 마운트·revision 합산                                                                                                                                                                                                                                                     | ≈ 0.1 kB                            |
| (T-92b 가 이미 넣은 것) `memory/sync-repository.ts`·`live.ts`·`client-merge`·`outbox` 값 | `shell-storage-store.ts:15` 정적 import. 유지(§B-5 (c))                                                                                                                                                                                                                  | 893 B(실측)                         |

**진입에 절대 없어야 하는 것**: `store/sync-engine.ts`·`store/auth-actions.ts`·`store/reload-views.ts`(엔진 청크), `src/infra/sync/http-transport.ts`(providers 의 둘째 `import()`), `@/domain/sync/{wire,remote-rows,server-rules}` **값**, `@/repositories/sync-transport` **값**(`TransportError` 클래스 — 스토어는 `kind` 문자열만 받는다), `@/domain/backup/validate-rows` 값(백업 경로가 지연인 채로 남아야 한다).

## B. 예산 — 숫자로

### B-4. 여유 1,077 B 안에 들어가는가 — **안 들어간다**

| 측정                                        | 기준 `o` | 권고 배치 `o5`(스텁) |         실물 추정 |                     초과 |
| ------------------------------------------- | -------: | -------------------: | ----------------: | -----------------------: |
| `index-*.js`(현 `ENTRY_BUDGET` 계측)        |  148,923 |     150,530 (+1,607) | ≈ 151,600~152,100 |   **≈ +1.6~2.1 kB 초과** |
| 진입 폐포                                   |  154,686 |     156,293 (+1,607) | ≈ 157,400~157,900 | (기준 자체가 150,000 위) |
| `/assets/*.js` 합(`NETWORK_BUDGET` 200,000) |  193,486 |     198,022 (+4,536) | ≈ 202,500~203,000 |     **≈ +2.5~3 kB 초과** |

실물 추정 방법: 스텁 대비 늘어날 줄 수 × 기존 청크의 gzip 바이트/줄. 근거 청크(`o`): `BackupDialog-*.js` 2,037 B / 115줄 ≈ 18 B/줄(TSX + `Dialog`), `validate-backup-*.js` 2,473 B / 153줄 ≈ 16 B/줄(TS 판정), `sync-engine` 스텁 1,202 B / 108줄 ≈ 11 B/줄(주석 없음).

- 진입 쪽 실물 증가 = `AccountBlock` 33 → ≈ 70줄(상태 3종·격리 문구·로그아웃 확인 R14) +0.4 kB, `UploadDialog` 33 → ≈ 55줄(개수 문구·보류) +0.3 kB, `AccountDeleteDialog` 신규 ≈ 30줄 +0.4 kB → **+1.1 kB** → `index-*.js` ≈ 151.6 kB.
- 지연 쪽 실물 증가 = `sync-engine` 108 → ≈ 300줄(트리거 4종·`more`·격리·`resync`·401·reload-views) +2.3~~2.8 kB, `auth-actions` 74 → ≈ 150줄 +0.9 kB → 네트워크 ≈ 198.0 + 1.1 + 3.2~~3.7 ≈ **202.3~202.8 kB**.
- 이 추정에 안 들어간 것: `[vectors]` 표식 검사·e2e 스텁(번들 밖), `theme-store` 재조회 액션(+0.1 kB 진입).

**전임자 §C-6 배분("T-94 ≤ 1,300 B")은 지킬 수 없다** — 스텁만으로 1,607 B 다. 원인은 UI 를 진입에 두기로 한 결정이 아니라(그 편이 더 싸다, 사실 2) 게이트·스토어·계정 블록·업로드 다이얼로그가 필요한 최소이기 때문이다.

> **갱신(#129 반영, 실측)**: 위 "실물 추정" 줄과 실제 머지 후 측정값을 나란히 두면 — `index-*.js`: 추정 ≈151.6~~152.1 kB vs 실측 **152,169 B**(추정 범위 안, 상단에 근접) · 진입 폐포: 추정 ≈157.4~~157.9 kB vs 실측 **157,932 B**(추정 범위 안, +32 B) · 네트워크 합: 추정 ≈202.3~202.8 kB vs 실측 **200,943 B**(추정보다 오히려 **1.4~1.9 kB 작음**). 이 문서의 추정 방법(줄 수 × 바이트/줄)은 진입·폐포는 잘 맞았고 네트워크(지연 청크 쪽)는 다소 보수적(과대)이었다.

### B-5. 넘을 때의 선택지 (사용자 결정 — §E-1)

| 선택지                                           | 내용                                                                                                                                                                   | 장점                                                                                                                               | 단점                                                                                                                                                                                                                                                                                                                                             | 권고                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| **(a) `ENTRY_BUDGET` 상향 + 계측을 폐포로**      | `check-dist.mjs` 가 `index-*.js` + 그것의 정적 `import"./…"` 청크를 합쳐 재고, `ENTRY_BUDGET = 160_000`(폐포 기준). 주석·`ADR-0013` 규칙 7 각주·`TECH_PLAN §8` 행 갱신 | 청크 배치가 흔들려도 숫자가 안 흔들린다(사실 1). 실물 ≈ 157.8 kB → 여유 ≈ 2.2 kB. #117 "T-94 PR 안에서 올린다" 와 같은 성격의 결정 | 숫자가 바뀐다는 사실 자체. 여유 2 kB 는 다음 feature 에서 또 울린다(그게 ADR-0013 재검토 트리거의 의도)                                                                                                                                                                                                                                          | **권고**                                                 |
| (a′) 계측 그대로, `ENTRY_BUDGET = 155_000`       | 한 줄                                                                                                                                                                  | 가장 작다                                                                                                                          | `index-*.js` 는 rolldown 의 배치에 따라 ±3 kB 흔들린다(`o2` +754, `o4` +3,186, `p` −13 kB 가 전부 코드 무게가 아니었다). 거짓 초록 9건 전력에 하나 더 얹는다                                                                                                                                                                                     | 비권고                                                   |
| (b) 기존 진입 코드 지연으로 밀어내기             | 후보: 리포트 화면(`features/reports/components` 2,589줄), 루틴 관리(`RoutineManager*` 580줄), 다이어리 작성 모달                                                       | 제품 무게가 실제로 준다                                                                                                            | `o4` 실측: 배럴을 안 가르면 **한 바이트도 안 준다.** `reports/index.ts` 를 스토어 배럴과 화면 배럴로 가르고 `ShellHeader`·`useShellShortcuts`·`ShellGlobals` 의 import 를 옮겨야 한다 — **별도 티켓**(T-94 owns 밖 파일 5개 이상)                                                                                                                | T-94 와 분리, 후속                                       |
| (c) memory 저장소 지연 로드(오케스트레이터 제안) | `continueInMemory` 를 `async` 로, `import('@/repositories/memory/repositories')`                                                                                       | 폐포 **−2,773 B**(실측 `o2`)                                                                                                       | `index-*.js` 는 **+754 B**(현 계측으로는 손해). 네트워크 −50 B. `shell-storage-store.ts:9-13` 이 정적으로 둔 이유가 그대로 유효하다 — 이 코드는 **저장 공간이 막힌 순간**(오프라인·프리캐시 미스가 겹치기 쉬운 상황)에 필요한데 그때 청크를 못 받으면 대체 경로가 사라진다. 또 `outbox-*.js` 고아 청크가 생겨 사실 4 의 플러그인 수정이 선행이다 | **T-94 선행으로 넣지 않는다.** (a) 를 고르면 필요도 없다 |

**갱신(#129 반영) — 결정됨**: (a) 채택. `scripts/check-dist.mjs` 의 `ENTRY_BUDGET = 160_000`·`NETWORK_BUDGET = 210_000`(둘 다 폐포/정의 그대로 §B-6)이 그대로 커밋됐고, `CLAUDE.md` "현재 상태"가 실측을 든다(§B-4 갱신 참고).

### B-6. `NETWORK_BUDGET` — 별개 상수, 같은 PR 에서 올린다(#117 확정)

실물 추정 ≈ 202.3~202.8 kB(§B-4). 권고값 **210,000**(여유 ≈ 7 kB; 전임자의 215,000 예시는 추정이 더 거칠 때의 값이다). 계측 정의는 **그대로**(모든 `/assets/*.js` 합 — 사실 4 의 플러그인 수정으로 모든 청크가 `<head>` 프리로드되므로 "첫 로드 네트워크" 라는 이름이 정확히 참이 된다).

## C. 파일 단위 경계 표 (§C-6 갱신)

원칙: (i) 진입은 `@/domain/sync/**` 값을 `client-merge.ts`·`outbox.ts` 외에 import 하지 않는다(유지). (ii) `import()` 인자는 문자열 리터럴(`eslint.config.mjs:194-198` `NO_DYNAMIC_NONLITERAL`). (iii) **`lazy()` 는 쓰지 않는다** — 지연 경계는 스토어 액션의 `await import(...)` 두 곳(`sync-store.ts`)과 `providers.tsx` 의 `import()` 하나, 셋뿐이다. `BackupLauncher.tsx:21-24` 의 `lazy` 패턴은 **큰 다이얼로그**(2 kB)에 맞는 패턴이고, 이 feature 의 UI 는 그 문턱 아래다(사실 2). (iv) `features/sync/index.ts` 는 지연 대상을 export 하지 않는다(사실 5).

| 파일                                                                                                                                   | 청크                                                                                   | 근거                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/features/sync/index.ts`                                                                                                           | 진입                                                                                   | export `AuthGate`·`AccountBlockLauncher`·`useSyncStore`·타입                                                                                                                                                                                                                                                                                     |
| `store/sync-store.ts`                                                                                                                  | 진입                                                                                   | 상태 + 위임 액션. `import()` 두 곳: `'@/features/sync/store/sync-engine'`, `'@/features/sync/store/auth-actions'`                                                                                                                                                                                                                                |
| `components/AuthGate.tsx`·`LoginScreen.tsx`·`AccountBlockLauncher.tsx`·`AccountBlock.tsx`·`UploadDialog.tsx`·`AccountDeleteDialog.tsx` | 진입                                                                                   | §A-3. `Button`·`Dialog`·`ConfirmDialog`·`Skeleton` 만 쓴다(전부 진입에 이미 있음)                                                                                                                                                                                                                                                                |
| `store/sync-engine.ts`                                                                                                                 | **`sync-engine-*.js`**(동적)                                                           | 사이클·트리거(`visibilitychange`·`focus`·`online` 2 s, 보이는 동안 30 s, `onLocalWrite` 1.5 s)·`more`·격리·`resync`·401. `@/domain/sync/wire` 값(`isResyncResponse`)·`remote-rows`(`readRemoteRow`)·`outbox`(`toSyncChange`·`shouldQuarantine`·`planOutboxAfterReject`)·`@/repositories/sync-transport`(`isTransportError`)·`@/lib/write-signal` |
| `store/auth-actions.ts`                                                                                                                | `auth-actions-*.js`(동적) 또는 엔진 청크에 합침                                        | `me()`·표식 쓰기·`deviceId` 생성·사용자 전환 wipe·로그아웃(내보내기 결과 → wipe → `logout()`)·계정 삭제·R7 선택 처리. **합칠지는 구현자 재량** — 둘 다 스토어에서만 `import()` 되므로 경계는 같다                                                                                                                                                |
| `store/reload-views.ts`                                                                                                                | 엔진 청크(정적으로 엔진이 import)                                                      | `useTodoStore.getState().loadDate(date)`(`todo-actions.ts:49`) · `useCategoryStore.getState().load()`(`category-actions.ts:35`) · `useDdayStore.getState().load()`(`dday-store.ts:34`) · `useDiaryStore.getState().load(date)`(`diary-store.ts:42`) · 타이머 `refresh`(`timer-actions.ts:39`) · **테마: 신규 액션 필요**(사실 8)                 |
| `src/infra/sync/http-transport.ts`                                                                                                     | `http-transport-*.js`(동적)                                                            | `providers.tsx` `Promise.all([import('@/infra/indexeddb/repositories'), import('@/infra/sync/http-transport')])` — 조립 지점만 infra 를 import 할 수 있다(ADR-0006 규칙 6, `NO_PROVIDERS_IMPORT`)                                                                                                                                                |
| `src/repositories/sync-transport.ts`(값) · `src/domain/sync/wire.ts`(값) · `src/domain/backup/validate-rows.ts`                        | **공유 청크**(`sync-transport-*`·`wire-*`·`validate-rows-*`, 동적 청크 둘 이상이 나눔) | 사실 4. 프리로드 플러그인 수정으로 `<head>` 에 실린다. 진입은 이 셋의 값을 import 하지 않는다(테스트가 단언)                                                                                                                                                                                                                                     |
| `src/repositories/memory/sync-server.ts`·`memory/sync-transport.ts`                                                                    | **번들 밖**                                                                            | `src/test/setup.ts:17-18` 만 import(실측: 비테스트 importer 는 `setup.ts` 와 인터페이스 파일의 주석뿐). 가드는 §C-8 ③                                                                                                                                                                                                                            |
| `src/app/page.tsx`·`providers.tsx`                                                                                                     | 진입                                                                                   | 각 두 줄                                                                                                                                                                                                                                                                                                                                         |
| `ShellSidebar.tsx`                                                                                                                     | 진입                                                                                   | `<AccountBlockLauncher onExportBackup={exportBackup} />` — `exportBackup` 은 `useBackupStore` 에서 꺼내 **prop 으로 내린다**(§D-10 방향 규칙 때문. `backup/index.ts:14-19` 머리주석의 "셸이 합성해서 prop 으로" 선례)                                                                                                                            |
| `ShellHeader.tsx`                                                                                                                      | 진입                                                                                   | `useSummaryRevision` 에 `useSyncStore(s => s.dataRevision)` 합산(`ShellHeader.tsx:47-50`)                                                                                                                                                                                                                                                        |
| `BackupDialog.tsx`                                                                                                                     | 기존 `BackupDialog-*.js`                                                               | R7-a: `useSyncStore(s => s.phase === 'ready')` → "교체" `aria-disabled`. 방향: 지연 → 진입 스토어(안전). 실측 +124 B                                                                                                                                                                                                                             |
| `vite.config.ts` `preloadAsyncChunks`                                                                                                  | —                                                                                      | 필터 한 줄 수정(사실 4). owns 조정 §H                                                                                                                                                                                                                                                                                                            |
| `scripts/check-dist.mjs`                                                                                                               | —                                                                                      | §B-5 (a) 계측 + §C-8 마커                                                                                                                                                                                                                                                                                                                        |

### C-8. 경계를 지키는 장치 — `src/features/sync/lazy-boundary.test.ts`

거짓 초록을 막는 원칙: **기대값이 빈 배열인 단언을 두지 않는다**(§D-9 규칙). 아래 ①·② 는 양성 단언(반드시 있어야 하는 것)과 음성 단언을 짝으로 둔다.

① **정적 의존 그래프 도달성** (vitest, PR 게이트) — `build-stack.test.ts:22-32` 의 파일 순회 + `MODULE_PATH` 정규식 방식을 확장한다.

- `src/app/main.tsx` 에서 시작해 **정적 값 import 만** 따라 걷는다: `import x from`·`import { x } from`·`export { x } from` 은 간선, `import type`·`export type`·`import { type X }` 만 있는 줄은 간선 아님, `import('…')` 는 **간선 아님**(이것이 경계다). `@/` 는 `src/` 로, 확장자는 `.ts`→`.tsx`→`/index.ts` 순으로 해석. 걷지 못한 경로(해석 실패)는 **에러**로 모아 `toEqual([])` — 해석기가 조용히 죽는 것을 막는다.
- 양성: `reachable.size > 200`(현재 src 파일 수 기준 하한; 정확한 값은 구현 시 실측해 박는다) — 그래프가 통째로 비면 아래 음성 단언이 공짜로 통과하므로.
- **허용 목록 등식**: `reachable ∩ src/features/sync/**` 가 **정확히** `{index.ts, store/sync-store.ts, components/AuthGate.tsx, components/LoginScreen.tsx, components/AccountBlockLauncher.tsx, components/AccountBlock.tsx, components/UploadDialog.tsx, components/AccountDeleteDialog.tsx}` 와 같다(`toEqual`, 부분집합 아님 — 목록에 있는 파일이 안 닿아도 빨강이라 목록이 죽은 채 남지 못한다).
- 음성(값 도달 금지): `src/features/sync/store/{sync-engine,auth-actions,reload-views}.ts`, `src/infra/**`(providers 예외는 이미 동적), `src/domain/sync/{wire,remote-rows,server-rules}.ts`, `src/repositories/sync-transport.ts`, `src/domain/backup/validate-rows.ts`, `src/repositories/memory/{sync-server,sync-transport}.ts` — 각 파일이 `reachable` 에 **없음**. 단, 같은 테스트가 `sync-engine.ts` 에서 시작한 둘째 걷기로 `wire.ts`·`remote-rows.ts` 가 **닿음**을 단언한다(음성이 "파일이 없어서" 통과하는 경우를 막는다).
- 방향 규칙(§D-10): `src/features/(todo|category|calendar|diary|timer|theme|date-strip|stats|command|pwa|reports)/**` 의 어떤 파일도 `@/features/sync` 를 import 하지 않는다 — grep 단언이지만 **양성 짝**으로 `shell/components/ShellSidebar.tsx`·`ShellHeader.tsx`·`backup/components/BackupDialog.tsx` 셋은 import **한다**를 함께 둔다. 그리고 `src/features/sync/**` 는 `@/features/(shell|backup)` 를 import 하지 않는다(그 둘이 sync 를 조립하는 쪽이라 `import/no-cycle` 이 막고, `exportBackup` 은 prop 으로 받는다).

② **산출물 마커** (`scripts/check-dist.mjs`, `pnpm build`·CI) — 문자열 리터럴만 쓴다(사실 11).

- 진입 `index-*.js` 에 **없어야**: `X-Tasky`(http-transport 헤더, `http-transport.ts:12`), `protocol:`(엔진이 만드는 `SyncRequest`), `"resync"`(`wire.ts#isResyncResponse`). 각각 **다른 어떤 청크에는 있어야** 한다(`all === 1`) — 있어야 할 것이 없으면 마커가 죽은 것이므로 FAIL.
- 진입에 **있어야**: `Google로 계속하기`(로그인 화면이 정적이라는 양성 단언, R2 문구).
- 전체 dist 어디에도 **없어야**: `reject-stale`(`server-rules.ts` + `sync-server.ts` 에만 있는 리터럴 → 가짜 서버·서버 규칙이 클라이언트에 새면 뜬다), `[vectors]`(전임자 §A-3). — 이것이 오케스트레이터 §3 "가짜 서버 배제를 규칙으로" 의 dist 쪽 한 줄이다.
- 청크 존재: `sync-engine-*.js` 가 별도 파일로 존재.
- 계측: §B-5 (a) 채택 시 폐포 합산.

③ **소스 쪽 가짜 서버 배제**: ①의 음성 목록에 `memory/sync-server.ts` 가 들어 있다(main.tsx 그래프에 없음). eslint `no-restricted-imports`(`^@/repositories/memory/sync-(server|transport)$`, 테스트 파일 제외)는 `eslint.config.mjs` + `check-arch.sh` 픽스처를 건드리므로 **별도 chore 티켓**(§F).

④ **돌연변이(PR 본문에 N/N 빨강)**: (1) `index.ts` 에 `export { startEngine } from '@/features/sync/store/sync-engine'` 추가 → ① 허용 목록 등식 빨강 **및** ② `protocol:` 진입 검출 빨강; (2) `sync-store.ts` 의 `await import('…/auth-actions')` 를 정적 import 로 → ① 빨강; (3) `providers.tsx` 의 `import('@/infra/sync/http-transport')` 를 정적으로 → ① 음성(`src/infra/**`) 빨강 + ② `X-Tasky` 빨강 + 기존 `build-stack.test.ts:79-84` 빨강; (4) `AuthGate.tsx` 에서 `LoginScreen` 을 `lazy` 로 → ① 등식(목록에 있는데 안 닿음) 빨강 + ② `Google로 계속하기` 빨강; (5) `todo-actions.ts` 에 `import { useSyncStore } from '@/features/sync'` → ① 방향 규칙 빨강(+ lint `import/no-cycle`); (6) `setup.ts` 외 앱 파일에 `createMemorySyncServer` import → ① 빨강 + ② `reject-stale` 빨강; (7) 걷기 해석기의 `.tsx` 폴백 삭제 → 해석 실패 목록 빨강 + `reachable.size` 하한 빨강; (8) `vite.config.ts` 필터를 `isDynamicEntry` 로 되돌림 → `check-dist` "참조되지 않습니다" 빨강(`wire-*` 등).

## D. 동기화 엔진의 배선

### D-9. 엔진은 언제 로드되는가

```
Providers(스켈레톤, Dexie+http-transport 청크 병렬)
  └ AuthGate.bootstrap(): sync.getState()  ── 표식 없음 ──▶ LoginScreen(정적, 즉시)
        │                                              └ ?auth=done 이면 'checking' 유지 → auth-actions(지연).probeSession()
        │                                                    → me() 200 → deviceId 생성·표식 저장 → phase 'ready'
        │                                                    → 로컬 로우 있음(backup `refresh` 와 같은 조회, backup-actions.ts:110-124) → uploadPrompt(R7) / 없음 → 바로(R8)
        └ 표식 있음 ──▶ phase 'ready' → <AppShell/> 즉시 렌더(R6, 오프라인 포함)
                          └ useEffect: store.start() → import('sync-engine') (이미 <head> 프리로드됨) → startEngine()
                                 ① 온라인이면 auth-actions.verifySession(): me() null → 표식 삭제·signOut(로컬·아웃박스 유지)
                                                                          sub ≠ userSub → 내보내기 → wipeLocal → 새 표식 → cursor 0
                                 ② 첫 사이클 즉시, 이후 트리거(§C 표)
```

> **갱신(#129 반영)**: 위 다이어그램의 "`?auth=done` 이면 `'checking'` 유지" 가지는 실제로 구현되지
> 않았다 — §A-2 갱신 참고. 실물은 표식 없음 → **바로 `LoginScreen`**(그 상태에서 온라인이면 배경
> `probeSession()`)이다. 다이어그램의 나머지(엔진 로드 시점·트리거·검증 순서)는 그대로 맞다.

- 사용자는 그 사이 **앱 본체를 본다**(로컬 캐시). 엔진 청크는 진입과 동시에 받아졌으므로 `import()` 는 평가 비용뿐이고, 첫 사이클의 결과는 `dataRevision++` → `useSummaryRevision` → `loadDate` 재조회로 스며든다.
- 로그아웃/계정 삭제/업로드 선택은 전부 `auth-actions`(지연) — 스토어 액션이 `await import()` 한다. 지연 청크 로드 실패(오프라인 + 프리캐시 미스)는 `TransportError` 가 아니라 `import()` 거부이므로 스토어가 `status: 'error'` 로 두고 토스트 문구 하나("동기화 모듈을 불러오지 못했어요 — 새로고침해 주세요")를 낸다. 그때도 **앱 본체는 뜬다**(R6).

### D-10. 방향 — 엔진(지연)이 스토어(진입)를 부른다, 반대는 테스트가 막는다

- 엔진 청크 → 진입: `reload-views.ts` 가 `useTodoStore.getState()` 등을 **모듈 정적 import** 한다(`@/features/todo` 배럴 등). 이 간선은 "동적 청크가 진입 청크의 export 를 import" 하는 것이라 rolldown 이 새 청크를 만들지 않는다(`o5` 실측: 엔진이 `@/features/{calendar,category,diary,todo}` 를 import 했는데 청크 목록에 그 feature 가 따로 생기지 않았다). 백업 가져오기의 `reloadViews`(`backup-actions.ts:97-100`)와 같은 꼴이다.
- 진입 → 엔진 간선이 생기는 경우와 차단:
  - 어떤 feature 스토어가 "동기화 상태" 를 읽고 싶어 `@/features/sync` 를 import → §C-8 ① 방향 규칙 빨강. 필요한 값은 **셸이 prop 으로** 내린다(선례 `backup/index.ts:14-19`).
  - `useSyncStore` 가 `TransportError` 를 `instanceof` 로 보려고 `@/repositories/sync-transport` 값 import → ① 음성 빨강. 스토어는 `kind: 'offline' | 'unauthorized' | 'server'` **문자열**만 받는다(`sync-transport.ts:14` `TransportFailure`).
  - 배럴이 엔진 함수를 재export → ① 등식 + ② 마커 빨강(돌연변이 1).
  - `backup` → `sync`(BackupDialog, 지연 → 진입 스토어)는 허용, `sync` → `backup` 은 금지. 로그아웃의 내보내기는 `AccountBlockLauncher` 가 prop 으로 받은 `exportBackup`(`backup-actions.ts:185`)을 auth-actions 에 인자로 넘긴다. **`false`(사용자 취소)면 wipe 도 `logout()` 도 하지 않는다**(사실 10) — R14 "내보낸 뒤 삭제" 의 순서 보장.
- `settings` 채택 후 테마 반영: `theme-store.ts` 에 `reloadFromStorage()`(저장소를 다시 읽어 `mode`·`accentColor` 갱신) 액션을 더한다 — **owns 추가**(`src/features/theme/store/theme-store.ts` + test). 안 넣으면 다른 기기에서 바꾼 강조색이 새로고침 전까지 안 보인다(허용 가능한 지연이지만 명시 결정이어야 한다).

### D-11. R7 "올리기" 의 비용 (오케스트레이터 §2)

- `enqueueAll` = 트랜잭션 1개 + 로우별 `await outboxPut`(`sync-indexeddb-repository.ts:62-70`). `query.ts#put` 의 로우별 트랜잭션(988 ms/1,566행 실측)보다 싸지만 직렬이다. **3년치 루틴 인스턴스(≈1,600행) 기준 수백 ms 급으로 추정** — 실측 없음(**미확인**). 개선은 테이블당 `bulkPut` 7회(같은 트랜잭션) — `sync-indexeddb-repository.ts`·`sync-store.ts` 는 T-94 owns 밖 → §F 의 bulkPut 티켓에 **`enqueueAll` 도 포함**시킨다(같은 기법·같은 파일군).
- 화면: 다이얼로그는 [올리기] 즉시 닫힌다. 진행 표시는 **새로 만들지 않는다** — 계정 블록의 "○ 대기 N건"(R6 필수)이 500건/왕복으로 줄어드는 것이 진행 표시다. 1,600행 = 4왕복. 별도 프로그레스 바는 R12-a "그 외 진입점을 사이드바에 추가하지 않는다" 와도 어긋난다.
- [내보내고 지우기]: `exportBackup()` `true` 일 때만 `wipeLocal()`(트랜잭션 1개, `clear()` ×8 — 싸다).

## E. 사용자에게 물을 것 (2개)

**E-1. 예산 두 상수와 계측 정의** — T-94 PR 이 `check-dist.mjs` 를 고친다(#117). 무엇으로 고치는가.

| 선택지                                                                | 내용                                                                                                                     | 장점                                                                                       | 단점                                                                                                                   |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **(a) 폐포 계측 + `ENTRY_BUDGET 160_000` + `NETWORK_BUDGET 210_000`** | 진입 = `index-*.js` + 정적 위성 합. 기준 154,686 → 실물 ≈ 157.8 kB(여유 ≈ 2.2 kB). 네트워크 실물 ≈ 202.8 kB(여유 ≈ 7 kB) | 청크 배치가 바뀌어도 수치가 안 흔들린다(사실 1). "첫 로드 임계 경로" 라는 이름과 값이 일치 | 숫자 둘이 바뀐다(ADR-0013 각주·TECH_PLAN §8 행)                                                                        |
| (a′) 계측 그대로 + `ENTRY_BUDGET 155_000` + `NETWORK_BUDGET 210_000`  | 상수 두 줄                                                                                                               | 가장 작은 변경                                                                             | `index-*.js` 단독 수치는 ±3 kB 를 코드와 무관하게 오간다 — 다음 PR 에서 원인 없는 빨강/초록이 난다                     |
| (b) 예산 유지, 리포트 화면 배럴 분리로 진입을 먼저 줄임               | T-94 앞에 리포트 지연 티켓                                                                                               | 제품 무게 감소                                                                             | `o4` 가 보여주듯 배럴 분리 없이는 0 B. 파일 5개+ 별도 티켓, T-94 착수가 밀린다. 그래도 `NETWORK_BUDGET` 은 올려야 한다 |

권고 **(a)**. **갱신(#129 반영) — 결정됨**: (a) 채택, `scripts/check-dist.mjs` 에 그대로 반영됨(§B-5 갱신과 같은 결정).

**E-2. R7 "올리기" 의 경로** — 스펙 R7 문구는 "backup.md 의 가져오기 경로를 재사용" 이고, 전임자·이 문서는 `sync.enqueueAll()` → 정상 사이클(푸시 500/왕복 → 서버 `updatedAt` LWW, `wire.ts:26-31`) 이다.

| 선택지                                                           | 내용                                       | 장점                                                                                                        | 단점                                                                                                                                                                                   |
| ---------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(A) `enqueueAll` + 정상 사이클**                               | 이미 있는 저장소 메서드·엔진 사이클만 쓴다 | 코드 경로 하나. 서버 LWW(T-91 구현, ADR-0015 정정)가 곧 백업 병합의 newer-wins 와 같은 규칙이라 결과가 같다 | 스펙 R7 문장을 "같은 규칙, 다른 경로" 로 고쳐야 한다(docs 한 줄, T-94 owns 의 `docs/specs/sync.md`)                                                                                    |
| (B) 서버 전량 풀 → `planImport('merge')` → `restore` → 큐 → 푸시 | 스펙 문구 그대로                           | 문서 무변경                                                                                                 | `SyncTransport` 에 전량 풀 헬퍼 추가(T-92 포트 변경 = ADR-0018 개정), `plan-import` 청크(838 B)와 `validate-backup` 을 로그인 경로에 끌어옴, 다이어리 date 한계 상속(전임자 §D-9 메모) |

권고 **(A)**. **갱신(#129 반영) — 결정됨**: (A) 채택(오케스트레이터 확정) — `sync.enqueueAll()` + 정상 사이클로 그대로 구현됐다. R7 스펙 문장을 "같은 규칙, 다른 경로" 로 고치는 것이 이 결정에 따른 잔여 할 일이었다 — `docs/specs/sync.md` 의 실제 문구는 이 갱신 세션에서 다시 확인하지 않았다(미확인).

(memory 저장소 지연 로드는 오케스트레이터가 판정을 요청한 항목이라 질문으로 올리지 않는다 — §B-5 (c) 에 근거를 적어 **하지 않는다**로 판정했다. 뒤집으려면 `o2` 수치가 근거다.)

## F. 후속 티켓 판정 (오케스트레이터 §3)

| 후보                                                                                                 | 판정                                                                                                                                                                                                                                                                   | 이유                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dataset.write`/`restore` → `bulkPut`(엔티티+아웃박스 상각) **+ `enqueueAll` 의 테이블당 `bulkPut`** | **별도 티켓**(perf, infra)                                                                                                                                                                                                                                             | 파일이 `query.ts`·`sync-store.ts`·`sync-indexeddb-repository.ts`·`memory/live.ts` — T-94 owns 밖이고 계약 테스트(`sync-repository.contract.ts`)가 이미 동작을 고정하고 있어 독립 검증 가능. T-94 앞에 넣을 필요는 없다(첫 로그인 한 번의 비용)                                |
| 가짜 서버 배제를 규칙으로                                                                            | **둘로 나눈다**: dist 마커(`reject-stale` 전역 0)는 **T-94**(`check-dist.mjs` 가 T-94 owns), 소스 그래프 음성 단언도 **T-94**(§C-8 ①). eslint `no-restricted-imports` + `check-arch.sh` 픽스처는 **별도 chore 티켓**(T-93 이 `eslint.config.mjs` 를 owns 하므로 그 뒤) | 규칙 하나를 세 층(vitest·dist·lint)에 두되 T-94 는 자기 owns 안의 두 층만                                                                                                                                                                                                     |
| `vite.config.ts` 프리로드 필터 한 줄(사실 4)                                                         | **T-94 착수 전 chore PR 로 먼저**(권고) 또는 T-94 owns 에 추가                                                                                                                                                                                                         | T-94 는 이것 없이 `pnpm build` 를 통과할 수 없다. 독립적이고 4줄이며 기존 `check-dist` 참조 검사가 곧 그 테스트다. `shell-storage-store.ts:9-13` 의 잠재 함정도 같이 닫힌다. T-93 도 `vite.config.ts`(`server.proxy`)를 건드리므로 먼저 머지해 두면 둘 다 rebase 만 하면 된다 |

> **갱신(#129 반영)**: "가짜 서버 배제를 규칙으로" 의 eslint `no-restricted-imports` 별도 chore 티켓이
> 실제로 나갔는지는 이 갱신 세션에서 확인하지 않았다 — `eslint.config.mjs` 에 그런 규칙이 지금
> 있는지는 **미확인**(별도로 확인이 필요하면 `no-restricted-imports` 를 grep).

## G. 미확인 목록

- ~~T-93 콜백 복귀 URL(§A-2 `?auth=done` 계약) — `.worktrees/sync-worker` 를 읽지 않았다.~~ **갱신(#129 반영) — 확인됨**: `/?auth=done` 계약은 쓰이지 않는다. 실제 콜백은 성공 시 `/`, 실패 시 `/?auth=error`·`/?auth=denied` 로 돌아간다(§A-2 갱신 참고).
- 실물 엔진·auth·계정 블록의 gzip — §B-4 의 추정(바이트/줄)이며 스텁 하한(`o5`)만 실측. **여전히 미확인**(개별 파일 단위로는 다시 재지 않았다 — §B-4 갱신은 전체 합계만 실측했다).
- `enqueueAll` 의 실제 ms(§D-11). **여전히 미확인.**
- rolldown 이 `Button`·`Dialog` 를 위성으로 가르는 **정확한 조건** — 관찰: 동적 React 청크 1개(`p3`)에서는 안 갈리고 3개(`p`)에서는 갈렸다. 권고 배치(`o5`)에서는 안 갈렸다. 조건을 문서화한 rolldown 자료는 오프라인이라 못 봤다 — 그래서 계측을 폐포로 바꾸자는 것이다. **여전히 미확인.**
- 130,752 → 148,030 의 커밋별 기여(§0-1). **여전히 미확인.**
- `import/no-cycle` 이 `import()` 간선을 순환에 포함하는지(옵션 `allowUnsafeDynamicCyclicDependency` 기본값) — 이 설계는 동적 간선으로도 순환을 만들지 않으므로 답과 무관하지만, `backup ↔ sync` 를 양방향으로 두는 대안을 고를 때는 확인이 필요하다. **여전히 미확인.**
- 오케스트레이터 메시지의 "193,427" — 내 실측은 193,486(59 B 차이, 원인 미확인; `check-dist` 와 같은 방법으로 쟀다). **여전히 미확인.**

## H. §D-8 owns · §D-9 완료 조건 변경분 (T-94)

owns 에 **더할 것**: `vite.config.ts`(chore PR 로 먼저 가지 않을 때만), `src/features/theme/store/theme-store.ts`(+test, `reloadFromStorage`), `src/features/sync/lazy-boundary.test.ts`(신규, `src/features/sync/**` 에 포함). owns 에서 **뺄 것**: 없음. `components/SyncStatus.tsx` 는 `AccountBlock.tsx` 안으로 합친다(파일 하나 줄임).

완료 조건 **교체**: "`lazy-boundary.test.ts`(§C-6) 통과, 진입 청크 증가 ≤ 1,300 B" → "§C-8 ①·② 통과, 돌연변이 8/8 빨강, `pnpm build` PASS(E-1 결정 반영), PR 본문에 §0 표와 같은 형식의 실측(`index-*.js`·폐포·합 세 값 + 청크 목록)". "`UploadDialog`·`SyncStatus`·`LoginScreen` 각각 `lazy`" 문구 삭제. "`sync-engine-*.js` 가 별도 파일로 존재" 유지. e2e: 기존 11 스펙 전부가 `page.goto('/')` 로 시작하므로(`tests/e2e/*.spec.ts` 실측 11건) `stubLogin` 픽스처가 선행돼야 한다는 전임자 서술은 그대로 참이다.
