<!-- 읽기 조건: 달성률 계산·표시·100% 보상·인사이트 패널 요약 티켓을 시작할 때. -->

# 달성률 스펙

- 상태: implemented · 관련 ADR: - · 리서치 참조: reference-app-research.md §3-5, §6(완료율 상승 시 시각 보상), §9 기회 5

## 1. 목표

오늘 얼마나 해냈는지가 숫자 하나와 링 하나로 보이고, 전부 마치면 작은 축하가 있다. 레퍼런스 앱처럼 헤더를 통계로 채우지 않고(P1), 자세한 것은 접을 수 있는 인사이트 패널에 둔다.

## 2. 화면과 인터랙션

```
 메인 상단(고정 영역 안, 40px 링):          인사이트 패널(280px):
 ┌────────────────────────┐              ┌──────────────────────┐
 │ ◔ 60%   3 / 5          │              │ 오늘 달성률            │
 └────────────────────────┘              │      ╭────╮           │
 100%:                                   │      │ 60%│  3 / 5    │  ← 링 120px, 굵기 10px
 ┌────────────────────────┐              └──────────────────────┘
 │ ● 100%  5 / 5  다 했어요 🎉│
 └────────────────────────┘
 투두 0개:
 │ ◌ —     0 / 0          │
```

카테고리별 달성률은 더 이상 이 패널에 없다(사용자 결정) — 각 카테고리 그룹 헤더(이름 옆, `todo.md` R23)로 옮겨갔다.

- 링 색: 진행분 = 강조색, 트랙 = `--color-surface-2`. 100%면 진행분이 카테고리 색이 아닌 강조색으로 가득 차고 400ms 펄스 1회.
- 좁은 화면: 헤더 우측 `◔ 60%` 버튼 → 오버레이 패널(app-shell §2-B).

### 상태

- **빈 상태(투두 0개)**: `—` 표시, 링은 트랙만.
- **로딩**: 투두 목록과 같은 시점에 갱신(별도 스켈레톤 없음, 이전 값 유지).
- **에러**: 목록 조회 실패 시 `—`.

## 3. 규칙

- R1. `completionRate = done / total`, `total`은 선택 날짜의 삭제되지 않은 투두 수(카테고리 상태 무관: 활성·종료·삭제된 카테고리의 남은 투두 모두 포함). `total = 0`이면 비율은 정의되지 않으며 화면은 `—`.
- R2. 퍼센트 표기: `done === total`일 때만 `100%`. 그 외 `Math.round(rate*100)`이 100이 되면 `99%`로 표시.
- R3. 링 각도는 정확한 비율(반올림 전 값)로 그린다.
- R4. 100% 도달 순간(직전 값 < 1 → 1)에만 펄스와 "다 했어요 🎉" 문구. 페이지 로드 시 이미 100%면 문구만, 펄스 없음. reduced-motion에서는 펄스 없음.
- R5. ~~카테고리별 막대~~ — 폐지(사용자 결정). 카테고리별 값은 이제 각 카테고리 그룹 헤더(이름 옆)에 퍼센트로 보인다: `todo.md` R23.
- R6. 값 갱신은 토글 후 50ms 안(낙관적 갱신과 동일 프레임).
- R7. 헤더 링 40px·굵기 4px, 패널 링 120px·굵기 10px. 숫자 `--text-lg`(헤더), `--text-3xl`(패널).
- R8. 달성률과 날짜 스트립 ✓ 배지(date-strip R8)는 **같은 계산**을 쓴다. 두 곳이 부르는 **진입점은 둘**이다 — 하루치 `completionCounts`(헤더 링)와 날짜 범위 `summarizeDays`(스트립 배지, §4). 진입점이 둘이어도 **세는 일은 `completionCounts` 하나가 한다**: `summarizeDay` 의 `total`·`doneCount` 는 그 결과를 그대로 쓰고, `isAllDone` 은 점(dots) 유무가 아니라 그 수에만 묶인다. 그래서 불변식은 **"같은 날짜의 같은 투두 목록을 두 경로에 넣으면"** 성립한다 — `summarizeDay(todos,…).total === completionCounts(todos).total`, `doneCount === done`, `isAllDone === (completionRate(todos) === 1)`(투두 0개면 비율이 `null` 이라 배지도 없고, 그날 투두가 전부 색을 못 찾은 카테고리라 점이 0개여도 배지는 수를 따른다). 일반 브라우저 탭 제목은 달성률과 무관하게 `Tasky`로 고정한다(app-shell R9). 고정: `src/domain/todo/completion-invariant.test.ts`.
  - **화면에 뜬 두 값이 항상 같다는 뜻은 아직 아니다.** 헤더 링은 스토어 낙관 갱신으로 토글 즉시 움직이는데(R6) `useWeekSummaries` 는 `weekStart` 가 바뀔 때만 저장소를 읽어 **토글 뒤 스트립 배지가 낡은 값으로 남는다.** 계산이 갈라져서가 아니라 한쪽 입력이 낡아서다 — 주 요약 무효화는 **T-56** 이 맡는다. 그때까지 이 규칙의 "원천" 은 같은 목록을 넣었을 때의 조건부 보장이다.

## 4. 데이터

- domain 순수 함수(`src/domain/todo/completion-rate.ts`): `completionCounts(todos) → { done, total }`, `completionRate(todos) → number | null`, `percentFromCounts({ done, total }) → number | null`(R2 표기 — counts 에서 바로), `completionPercent(todos) → number | null`(`completionCounts` + `percentFromCounts` 를 잇는다), `summarizeByCategory(todos, categories) → { categoryId, done, total }[]`(더는 이 스펙이 쓰지 않는다 — `todo.md` R23 은 `TodoGroup.counts` 를 그대로 `percentFromCounts` 에 넣는다).
- 날짜 범위 요약은 여기 있지 않다: `summarizeDays(days, todos, categories) → Map<DateKey, DaySummary>`(`src/domain/todo/day-summary.ts`, `DaySummary = { total, doneCount, isAllDone, dots, overflowCount }`). 헤더 링이 쓰는 것은 위의 `completionCounts` 이고, 날짜 스트립 ✓ 배지(R8)가 쓰는 것은 `summarizeDays` 의 `isAllDone` 이다 — 둘 다 같은 목록을 같은 방식으로 센다.
- 타입 변경 없음.
- 레포지토리 메서드 없음(todo.md의 조회 결과를 사용).

## 5. 접근성

- 링은 `role="img" aria-label="오늘 달성률 60퍼센트, 5개 중 3개 완료"`. 투두 0개면 "오늘 할 일 없음".
- 헤더의 값 변경은 `aria-live="polite"` 영역에 "달성률 60%"로 1회 낭독(토글 연타 시 300ms 디바운스).
- 색만으로 정보를 전달하지 않는다(항상 숫자 병기).

## 6. 범위 밖

- 주/월 달성률, 스트릭, 히트맵, 차트 라이브러리, 엑셀 내보내기(Phase 2 `stats.md`). 컨페티 등 파티클 효과.

## 7. 완료 조건

- [ ] R1~R4, R8 단위 테스트(경계: 0/0, 1/3=33%, 2/3=67%, 199/200=99%, 200/200=100%).
- [ ] 토글 → 링·숫자·스트립 배지가 함께 갱신되는 통합 테스트 1개.
- [ ] 100% 펄스가 로드 시에는 발생하지 않는 테스트(R4).
- [ ] 라이트/다크 스크린샷(0%, 60%, 100%).
