<!-- 읽기 조건: 모든 에이전트, 모든 세션 시작 시 무조건. 이 파일 외의 문서는 아래 "읽기 규칙"에 해당할 때만 연다. -->

# Tasky — 루트 헌법

**Tasky**: 레퍼런스 앱(국내 인기 감성 투두 앱)의 GUI/UX/기능을 매우 흡사하게 재현하는 **감성 투두/일정 관리 데스크탑 웹앱**. Next.js(App Router) + TypeScript + PWA, **로컬 우선(IndexedDB, repository 패턴)**. SNS(친구·피드·반응)는 Phase 2.
1차 MVP: 날짜 스트립 + 카테고리별 투두 CRUD + 체크/달성률 + 테마/색상.

> **현재 상태(단일 소스 — 상태가 바뀌면 이 줄만 고친다)**: 스캐폴딩 이전. `package.json`/`src/` 없음. `chore/scaffold-nextjs` 티켓이 머지되기 전에는 기능 티켓을 시작할 수 없다. 지금 쓸 수 있는 검증: `bash scripts/check-forbidden-words.sh`, `bash scripts/check-agents-md.sh`, `bash scripts/check.sh`(스캐폴딩 전 대체 체크 — 스캐폴딩 후엔 `pnpm check`).

## 0. 절대 금지어 (최우선 규칙)

기록으로 남는 **모든 것**(파일명·본문·코드·주석·테스트·커밋·PR·이슈·브랜치)에 레퍼런스 앱의 **실제 제품명을 쓰지 않는다.**
- 금지 토큰: 영문 `to`·`do`·`mate` 조합(대소문자/공백/`_`/`-` 변형 전부), 한글 `투두`·`메이트` 조합(띄어쓰기 변형 전부).
- 항상 **"레퍼런스 앱"**(영문 `reference app`)으로 지칭. 리서치 문서를 인용할 때도 동일.
- 검사: `bash scripts/check-forbidden-words.sh` — pre-commit 훅과 CI가 자동 실행, 위반 시 실패.

## 1. 4대 필수 규칙

1. **커밋 author는 항상 `alfks <millie020524@gmail.com>`.** AI 명의 author, `Co-Authored-By: Claude…`, `Generated with Claude Code`, 세션 URL 등 **AI 흔적을 커밋·PR에 남기지 않는다.** 강제: `bash scripts/setup.sh`(레포 로컬 config + 훅). 임시: `git -c user.name=alfks -c user.email=millie020524@gmail.com commit …`.
2. **병렬 작업은 반드시 `.worktrees/<작업명>/` 워크트리에서.** 메인 워킹트리(`/home/user/Tasky`)에서 동시 편집 금지. 생성: `bash scripts/wt.sh new feature/<작업명>`.
3. **브랜치명은 `feature|fix|refactor|docs|chore|test/<작업명>`** (kebab-case 영문). `claude/…`, `opus/…`, `sonnet/…` 등 **에이전트 이름 기반 브랜치 금지.**
4. **트래킹된 파일이 있는 모든 디렉토리는 `AGENTS.md` 필수.** 예외: 상위 디렉토리의 `AGENTS.md`가 본문에 `관할: <하위디렉토리명>/` 형태로 **명시적으로 관할을 선언**한 하위 디렉토리는 면제. 그 디렉토리의 규칙/맥락은 **거기에만** 적는다(루트에 중복 금지). 에이전트는 **그 디렉토리를 실제로 읽거나 수정할 때만** 해당 `AGENTS.md`를 읽는다. 디렉토리를 새로 만들면 `AGENTS.md`도 같이 만든다(템플릿: `docs/conventions/templates/AGENTS.template.md`).

## 2. 디렉토리 맵 / 아키텍처 (단일 소스 — 여기서 중복 기재하지 않는다)

파일 위치: [docs/DIRECTORY_MAP.md](docs/DIRECTORY_MAP.md) · 레이어·의존 방향·확장 지점: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · 각 디렉토리 규칙: 그 디렉토리의 `AGENTS.md`.

## 3. 읽기 규칙 — 무엇을 언제 읽는가

| 상황 | 읽을 것 | 읽지 말 것 |
|------|--------|-----------|
| 세션 시작 | 이 파일만 | `AGENTS.md` 전부 훑기 |
| 역할이 오케스트레이터/리뷰어 | [AGENTS.md](AGENTS.md) → [docs/conventions/agent-collaboration.md](docs/conventions/agent-collaboration.md) | 코드 컨벤션(리뷰 시엔 diff 보며 필요 절만) |
| 코드 작성 시작 | [docs/conventions/code-style.md](docs/conventions/code-style.md) + 대상 디렉토리 `AGENTS.md` | 무관한 디렉토리 `AGENTS.md` |
| 커밋/PR/워크트리 | [docs/conventions/git-workflow.md](docs/conventions/git-workflow.md) | — |
| 핸드오프 문서 작성 | [.worktrees/AGENTS.md](.worktrees/AGENTS.md) | — |
| 레이어 경계를 넘는 변경 | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) + 관련 ADR | 전체 ADR |
| 파일 위치를 모를 때 | [docs/DIRECTORY_MAP.md](docs/DIRECTORY_MAP.md) → Glob/Grep | 디렉토리 전체 Read |
| 기능 요구사항 확인 | `docs/specs/<feature>.md` | 리서치 문서 전문(섹션만 grep) |
| 토큰이 부족하다고 느낄 때 | [docs/conventions/token-efficiency.md](docs/conventions/token-efficiency.md) | — |

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
pnpm check                                # lint+typecheck+test, PR 전 필수 (스캐폴딩 전: bash scripts/check.sh)
bash scripts/check-forbidden-words.sh     # 금지어 검사
bash scripts/check-author.sh main         # main 이후 커밋 author 검증
bash scripts/check-agents-md.sh           # AGENTS.md 누락 검사
pnpm dev | pnpm build | pnpm test -- <pattern>
```

## 6. 코드 원칙 압축판 (상세: code-style.md)

- 의존 방향: `app/features/components → domain → repositories(인터페이스)`; `infra`는 인터페이스만 구현. **`domain`은 react/next/dexie import 금지**(ESLint가 막음).
- 컴포넌트는 `features/<f>/components/`, 공용은 `components/ui/`. 상태는 `features/<f>/store/` Zustand. 컴포넌트에서 Dexie 직접 호출 금지.
- 파일 ≤ 300줄, 컴포넌트 ≤ 200줄, 함수 ≤ 50줄. 넘으면 분할.
- 모든 인터랙션은 `button/input/a` 등 시맨틱 요소. `div onClick` 금지. 키보드 조작 가능해야 함.
- 테스트: `domain` 함수와 `repositories` 메서드는 반드시 단위 테스트. 스냅샷 테스트 금지.

## 7. 절대 하지 말 것

1. 금지어 사용 (§0).
2. AI 명의 author / AI 트레일러 / 세션 URL을 커밋·PR에 남기기.
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

Node 22 / pnpm 10 / Next.js 15 / React 19 / TypeScript 5 strict / Tailwind CSS 4 / Zustand / Dexie / Vitest / Playwright. 패키지 매니저는 **pnpm만** (`npm`, `yarn` 금지). 경로 별칭 `@/*` → `src/*`.

## 10. 티켓 수명주기 (한눈에)

```
오케스트레이터: 티켓 작성(.worktrees/tickets/T-<n>.md, owns: 명시) → BOARD.md 등록
구현 에이전트 : wt.sh new → 구현 → pnpm check → 커밋(author 검증) → PR(템플릿) → 핸드오프 문서
리뷰 에이전트 : 병렬 리뷰(백엔드/프론트/사용자/접근성) → 심각도 태그 → 집계
오케스트레이터: (Blocker+Major) ≤ 3 ? 반영 후 머지 : 다음 라운드(최대 3) → wt.sh rm → BOARD.md 갱신
```

## 11. PR 전 셀프 체크 (구현 에이전트)

- [ ] `pnpm check` 통과(스캐폴딩 전: `bash scripts/check.sh`), `bash scripts/check-forbidden-words.sh` 통과
- [ ] `git log --format='%an <%ae>' main..HEAD` 전부 `alfks <millie020524@gmail.com>`
- [ ] 티켓 `owns:` 밖 파일을 건드리지 않았음 (`git diff --stat main..HEAD`)
- [ ] 새 디렉토리마다 `AGENTS.md` 존재, 변경한 디렉토리의 `AGENTS.md`가 여전히 참
- [ ] PR 본문 템플릿 채움, 라벨 부착, 핸드오프 문서 경로 기재

## 12. 용어 통일 (코드 식별자 ↔ 한국어)

| 한국어 | 코드 | 의미 |
|-------|------|------|
| 투두 | `Todo` | 특정 날짜·카테고리에 속한 할 일 한 건 |
| 카테고리 | `Category` | 색상을 가진 투두 묶음 (예: 공부, 운동) |
| 날짜 스트립 | `DateStrip` | 상단 가로 스크롤 날짜 선택 UI |
| 달성률 | `completionRate` | 해당 날짜 투두 중 완료 비율 (0~1) |
| 테마 | `Theme` | 라이트/다크 + 강조색(`accentColor`) |
| 레퍼런스 앱 | `reference app` | 벤치마킹 대상 (제품명 금지) |
| 이슈 | GitHub Issue (`#<n>`) | 외부/사용자가 등록하는 요청·버그(레포에 커밋됨) |
| 티켓 | `T-<n>` | 에이전트 작업 단위(`.worktrees/tickets/`, 로컬, 커밋 안 함) |
