<!-- 읽기 조건: 오케스트레이터가 티켓을 쓰거나 리뷰 라운드를 운영할 때, 리뷰 에이전트가 보고서를 쓰기 직전. 구현 에이전트는 §1(티켓 포맷)과 §5(피드백 응답)만 읽는다. -->

# 멀티 에이전트 협업 프로토콜

루트 [AGENTS.md](../../AGENTS.md)가 흐름을, 이 문서가 **포맷과 판정 기준**을 정의한다.

## 1. 작업 티켓 포맷 — `.worktrees/tickets/T-<n>.md`

```markdown
---
id: T-12
title: 주 단위 날짜 스트립 컴포넌트
type: feature            # feature|fix|refactor|docs|chore|test
branch: feature/date-strip
worktree: .worktrees/date-strip
spec: docs/specs/date-strip.md   # 없으면 "none" + 티켓 본문에 요구사항 전문
owns:                    # 이 티켓이 수정 가능한 파일/글롭. 서로소 규칙 적용
  - src/features/date-strip/**
  - src/domain/date/**
reads:                   # 시작 전 읽어야 할 것. 여기 없는 문서는 읽지 않음
  - docs/conventions/code-style.md
  - src/features/AGENTS.md
  - src/domain/AGENTS.md
depends_on: [T-10]       # 머지 선행 티켓
model: sonnet            # 권장 모델
size: S                  # S(<100줄) M(<300줄) L(스캐폴딩/설정)
---

## 목표 (1~3줄)
## 완료 조건 (체크리스트, 검증 가능한 문장)
- [ ] `DateStrip`이 선택 날짜 기준 ±3일을 렌더한다
- [ ] 좌우 화살표 키로 이동 가능하다 (테스트 포함)
## 범위 밖 (명시적으로 하지 않을 것)
## 참고 (스펙 섹션, 리서치 문서 섹션 헤더만 — 본문 복붙 금지)
```

- `owns:` 없는 티켓은 무효. 오케스트레이터는 발행 전 `BOARD.md`의 진행 중 티켓들과 교집합 검사(절차: §1.1).
- 티켓 번호는 **오케스트레이터가 발행 시점에** `BOARD.md`의 마지막 번호 +1로 부여한다(단조 증가, 삭제된 티켓 번호도 재사용 금지). 로컬 파일이므로 커밋하지 않는다.

### 1.1 owns 교집합 검사 절차 (오케스트레이터, 티켓 발행 전 필수)

1. `BOARD.md`에서 status가 `todo`·`in-progress`·`in-review`·`needs-fix`인 행의 `owns` 열을 모은다.
2. 새 티켓의 `owns:` 글롭과 한 줄씩 비교해 같은 파일/디렉토리를 가리키는 것이 있으면 교집합.
3. 겹치면 두 티켓을 직렬화(`depends_on`)하거나 `owns:`를 재분할해서 겹침을 없앤다.
4. 이 검사는 기계적으로 강제되지 않는다(티켓이 `.gitignore` 대상이라 CI가 못 봄) — 리뷰 시점 검증은 PR 본문 `## owns` 블록과 `git diff --name-only main...HEAD` 대조로 보완한다(AGENTS.md §4).

## 2. 작업 보드 — `.worktrees/BOARD.md`

```markdown
| id | title | branch | owner(model) | status | owns | pr | round |
|----|-------|--------|--------------|--------|------|----|-------|
| T-12 | 날짜 스트립 | feature/date-strip | sonnet | in-progress | src/features/date-strip/**, src/domain/date/** | #14 | 1 |
```
status ∈ `todo | in-progress | in-review | needs-fix | ready-to-merge | done | blocked`. **오케스트레이터만 수정**한다.

## 3. 핸드오프 문서 — `.worktrees/handoffs/T-<n>.md`

포맷은 [.worktrees/AGENTS.md](../../.worktrees/AGENTS.md). 추가 규칙:
- 구현 에이전트가 PR 생성 직후 작성. 리뷰 라운드마다 `## Round N 반영` 절을 append.
- 리뷰어는 리뷰 전에 핸드오프의 `decisions:`와 `not-done:`을 읽는다(의도된 미구현을 지적하지 않기 위해).

## 4. 병렬 리뷰 라운드 운영

### 4.1 리뷰어 페르소나

| 페르소나 | 보는 것 | 보지 않는 것 |
|---------|--------|-------------|
| **백엔드/데이터** | domain 규칙 정확성, 레포지토리 계약, IndexedDB 스키마·마이그레이션, 소프트 삭제·updatedAt 유지, 에러 처리, 테스트 커버리지(domain/repo), 동기화 확장 저해 여부 | 스타일, 문구, 레이아웃 |
| **프론트엔드** | 컴포넌트 구조·크기, 상태 구독 범위, 불필요 리렌더, `'use client'` 경계, 토큰 사용, 레이어 경계 위반(UI→infra 직접 호출), import 규칙 | 도메인 계산 정확성(백엔드 몫), 카피 |
| **사용자 관점** | 레퍼런스 앱과의 UX 유사도(스펙 기준), 인터랙션 피드백(체크 애니메이션·즉시성), 빈 상태·에러 문구, 한국어 카피 자연스러움, 흐름 단절 | 코드 내부 구조 |
| **접근성**(선택: UI 변경 PR) | code-style §10 항목 전부, 키보드 흐름, 대비, 포커스, reduced-motion | 비UI |
| **아키텍처**(선택: 레이어/스키마 변경 PR) | ADR 부합, 의존 방향, 확장 지점 보존 | 세부 구현 |

### 소집 규칙 (PR에서 바뀐 경로 기준, 중복 시 합집합)

| PR 성격 | 판정 경로 | 소집 페르소나 |
|---------|----------|---------------|
| 기본 | (항상) | 백엔드/데이터 · 프론트엔드 · 사용자 관점 |
| UI 변경 | `src/features/*/components/**`, `src/app/**` | + 접근성 |
| 데이터 레이어 | `src/domain/**`, `src/repositories/**`, `src/infra/**` | + 아키텍처 |
| 아키텍처/거버넌스 | `docs/ARCHITECTURE.md`, `docs/decisions/**`, `eslint.config.mjs`, `AGENTS.md`/`CLAUDE.md` | + 아키텍처 |
| 스크립트/CI만 | `scripts/**`, `.github/**`(소스 변경 없음) | 백엔드/데이터만(생략 사유는 PR 본문에 기재) |
| 문서만 | `docs/**`·`*.md`(코드 diff 없음) | 사용자 관점만 |

### 4.2 리뷰 보고 템플릿 (리뷰어 → 오케스트레이터)

```markdown
# Review T-12 / PR #14 / Round 1 / persona: frontend
verdict: approve | request-changes
items:
- [Major] src/features/date-strip/components/DateStrip.tsx:41 — 스토어 전체를 구독해 날짜 변경마다 리렌더. selector로 `selectedDate`만 구독 제안.
- [Minor] src/features/date-strip/hooks/useWeek.ts:12 — `useMemo` 근거 없음. 제거 제안.
- [Nit] DateStrip.tsx:8 — props 타입명 `Props` → `DateStripProps`.
checked: [x] 티켓 완료 조건 3/3 충족  [x] owns 밖 파일 없음  [ ] 테스트 있음(누락: 키보드 이동)
```
- 항목 수 제한 없음. 단, **같은 원인**은 한 항목으로 묶는다(파일 목록 병기).
- 칭찬, 요약, "전반적으로 좋습니다" 금지. 근거 없는 취향 지적은 Nit로만.

### 4.3 심각도 정의

| 태그 | 정의 | 처리 |
|------|------|------|
| **Blocker** | 머지되면 깨짐: 빌드/테스트 실패, 데이터 손상·유실, 레이어 경계 위반, 금지어·author 위반, 락(owns) 위반, 스펙 핵심 요구 미충족 | 필수 수정 + 제기 리뷰어 확인 |
| **Major** | 동작은 하나 명백한 결함: 버그 가능성, 접근성 기준 위반, 잘못된 상태 구독, 누락 테스트(필수 범위), ADR 위반 | 수정 또는 근거 있는 거절 |
| **Minor** | 품질 개선: 가독성, 중복, 성능 미세 개선, 문구 | 선택. 거절 시 근거 불요 |
| **Nit** | 취향/일관성 | 선택 |

### 4.4 집계와 "피드백 3개 이하" 정확한 기준

1. 모든 페르소나 보고를 모은다.
2. **중복 제거**: 같은 파일·같은 원인을 두 리뷰어가 지적하면 1개(높은 심각도로 통일).
3. **유효 피드백 수 = Blocker 수 + Major 수** (Minor·Nit는 집계 제외).
4. 판정:
   - `유효 ≤ 3` → **루프 종료**. 구현자는 Blocker 전부 수정(제기 리뷰어에게 해당 항목만 재확인 요청 → `confirmed`), Major는 반영 또는 거절 근거 기재. Minor/Nit는 재량. 오케스트레이터는 CI 녹색 확인 후 머지.
   - `유효 ≥ 4` → 구현자가 Blocker·Major 전부 처리 + Minor 가능한 범위 처리 → **다음 라운드** 전체 리뷰(같은 페르소나 구성).
5. 최대 3라운드. 3라운드 종료 시에도 `유효 ≥ 4`면 오케스트레이터가 사용자에게 보고: (a) 범위 축소 후 머지 (b) 티켓 분할 (c) 폐기.
6. 거절된 Major에 리뷰어가 재반박하면 오케스트레이터가 ADR/스펙으로 판정. 판정 결과는 PR 코멘트에 기록.

### 4.5 오케스트레이터 집계 코멘트 (PR에 라운드당 1개)

```markdown
## Review Round 1 — 유효 피드백 2 (B0/M2/m3/n1) → 종료, 머지 진행
| # | sev | 위치 | 요지 | 처리 |
|---|-----|------|------|------|
| 1 | Major | DateStrip.tsx:41 | 스토어 전체 구독 | 반영 (a1b2c3d) |
| 2 | Major | useWeek.test.ts | 키보드 이동 테스트 누락 | 반영 (d4e5f6a) |
| 3 | Minor | useWeek.ts:12 | useMemo 제거 | 반영 |
```

## 5. 구현자의 피드백 응답 규칙

- 항목별 응답: `반영 <커밋 해시>` / `거절: <근거 1~2줄>` / `후속 T-<n> 제안: <이유>`.
- "확인했습니다", "좋은 지적입니다"만 쓰는 응답 금지.
- 거절은 Major 이하만 가능. Blocker 거절은 오케스트레이터 판정 요청으로만.

## 6. 리뷰 러브릭 (리뷰어 자기 점검, 보고 전 30초)

- [ ] 내 페르소나 범위 안의 항목만 적었다
- [ ] 모든 항목에 파일:줄 + 제안이 있다
- [ ] 심각도를 부풀리지 않았다(Blocker는 "깨짐"일 때만)
- [ ] 핸드오프의 `not-done:`을 다시 지적하지 않았다
- [ ] diff 밖 파일을 읽었다면 이유가 있었다

## 7. 에스컬레이션 규칙

- 구현 중 `owns:` 밖 파일 수정 필요 → 즉시 중단, 오케스트레이터에 파일명+이유 보고.
- 스펙과 리서치 문서가 상충 → 스펙 우선, 오케스트레이터 보고.
- 의존성 추가 필요 → 사용자 확인 필요(CLAUDE.md §7-9). 오케스트레이터가 `chore/deps-*` 티켓으로 분리.
- 아키텍처 변경 필요 → ADR 초안(`docs/decisions/`)을 먼저 PR.
