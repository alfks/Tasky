<!-- 읽기 조건: 통계 화면(주/월 달성률 추이·카테고리 비율·스트릭·집중 시간) 티켓을 시작할 때. -->

# 통계 스펙

- 상태: approved · 관련 ADR: - · 리서치 참조: reference-app-research.md §2.7(통계/리포트), §3-5, §4(프리미엄 번들)

## 1. 목표

레퍼런스 앱은 통계를 유료 번들에 묶지만, Tasky는 계정도 결제도 없으므로(P5) **전부 무료로** 보여준다. completion-rate.md의 "오늘" 한 장을 기간(주/월/올해)으로 넓히고, 타이머 세션(timer.md)을 모아 집중 시간을 더한다. 새 숫자를 만들지 않는다 — 이미 있는 도메인 함수를 기간에 대해 반복 적용할 뿐이다.

## 2. 화면과 인터랙션

통계 화면(커맨드 팔레트 "통계 보기" 또는 사이드바 하단 진입점, 메인 컬럼 전체 대체):

```
 [지난 7일 ▾] [지난 30일] [올해] [기간 지정]     ← 탭형 토글, 기본 "지난 7일"

 ┌ 달성률 추이 ──────────────┐  ┌ 카테고리 비율 ────────┐
 │ ▁▃▅█▂▇▅  (막대, 요일 라벨) │  │ 📝 todo   ■■■□ 42%    │
 └────────────────────────────┘  │ 📚 공부   ■■□□ 31%    │
 ┌ 연속 달성 ─────────────────┐  └────────────────────────┘
 │ 🔥 5일째 100%               │  ┌ 집중 시간 ────────────┐
 └────────────────────────────┘  │ 총 3시간 20분          │
 ┌ 활동 히트맵(최근 12주) ────────────────────┐│ 📝 장보기  42분        │
 │ 월▢▢▨▧▪ 화▢▪▨…(7×12, 진하기=달성률)      │└────────────────────────┘
 └──────────────────────────────────────────┘
```

### 상태

- **빈 상태(선택 기간에 투두 없음)**: 각 카드가 "이 기간에 기록이 없어요"로 대체.
- **로딩**: 카드별 스켈레톤(기존 앱 스켈레톤 톤 재사용).
- **에러**: 카드 단위 "불러오지 못했어요 [다시 시도]"(카드 하나 실패가 나머지를 막지 않는다).

## 3. 규칙

- R1. 기간 프리셋: 지난 7일(오늘 포함)·지난 30일·올해(1/1~오늘)·기간 지정(`input[type=date]` 2개, 최대 366일).
- R2. 추이 막대: `summarizeDays(days, todos, categories)`(day-summary.ts — date-strip이 이미 쓰는 그 함수, TECH_PLAN §12 #9가 지정한 날짜 범위 요약의 단일 확장 지점) 결과의 날짜별 `total`·`doneCount`에서 비율을 구해 그린다. `total === 0`인 날은 빈 칸(0%가 아님 — completion-rate R1과 같은 구분). **새 요약 함수를 만들지 않는다.**
- R3. 카테고리 비율: `summarizeByCategory`(completion-rate.md §4)를 **그대로** 쓴다 — 기간 전체 투두 배열을 한 번에 넘기면 되므로 별도로 확장할 것이 없다. 삭제된 카테고리는 "(삭제됨)" 묶음.
- R4. **연속 달성(스트릭)**: `summarizeDays` 결과의 날짜별 `isAllDone`을 오늘(또는 선택 날짜)에서 과거로 훑어, 끊기지 않고 이어진 일수를 센다(신규 순수 함수, `isAllDone` 배열만 입력받는다). `total === 0`인 날(투두 0개)은 스트릭을 끊지 않고 건너뛴다(기록할 게 없던 날은 실패가 아니다 — `isAllDone`이 이미 `total > 0`을 전제하므로 이 규칙과 자연히 맞아떨어진다, day-summary.ts 참고).
- R5. 집중 시간: 기간 내 `FocusSession`(status ∈ completed·canceled) `elapsedSeconds` 합계(신규 순수 함수). 투두별 상위 5개 + 나머지 "기타"로 합산.
- R6. 히트맵: 최근 12주 × 7일, 칸 진하기는 `summarizeDays`의 `total`·`doneCount`로 구한 완료율 4단계(0% / 1~~49% / 50~~99% / 100%, `total === 0`은 **0번** 톤 "기록 없음"). 오늘 이후 칸은 렌더하지 않는다. 진하기 토큰은 `theme.md` §3-H(`--color-heatmap-{0..4}`, 잉크 명도 5단계)가 정한다 — 히트맵 칸은 그 토큰만 쓴다(theme.md R1).
- R7. 모든 계산은 `TodoRepository.listByDateRange`·`FocusSessionRepository.listByDateRange`(§4, 신규) 각각 기간 전체를 **한 번씩** 읽어 메모리에서 합산한다 — 날짜마다 개별 조회하지 않는다(date-strip R17과 같은 원칙).
- R8. 새 차트 라이브러리를 추가하지 않는다(CLAUDE.md §7-9, 사용자 확인 없는 의존성 추가 금지) — 막대·히트맵은 SVG/CSS로 직접 그린다.

## 4. 데이터

- domain: 완료율 추이·히트맵은 **새 함수를 만들지 않는다** — `day-summary.ts`의 `summarizeDays(days, todos, categories) → Map<DateKey, DaySummary>`를 그대로 쓴다(`total`·`doneCount`·`isAllDone`을 읽는다, R2·R6). 카테고리 비율도 `completion-rate.ts`의 `summarizeByCategory`를 그대로 쓴다(R3). 기간 전용 신규 순수 함수는 둘뿐이다: 스트릭 `computeStreak(days: readonly Pick<DaySummary, 'total' | 'isAllDone'>[]) → number`(R4 — `total === 0`인 날은 건너뛰고 `!isAllDone`인 날에서 멈춘다. `boolean` 배열만으로는 "투두 0개인 날"과 "있었는데 다 못 한 날"을 구분할 수 없어 R4 자체를 구현할 수 없으므로 `total`까지 함께 받는다), 집중 시간 합계 `summarizeFocusSeconds(sessions, by: 'day'|'todo'|'category')`(R5). 타입 변경 없음(기존 `Todo`·`FocusSession`·`Category` 조합).
- 레포지토리: 기존 `TodoRepository.listByDateRange` 재사용. `FocusSessionRepository`에 같은 모양의 `listByDateRange(from, to)`를 **새로 추가**한다 — 기존 메서드는 바뀌지 않는 순수 추가다. 저장소 인터페이스 확장이라 오케스트레이터가 티켓 발행 전 ADR 필요 여부를 판단한다(docs/decisions/AGENTS.md "ADR이 필요한 변경", ADR-0014가 유사 사례). 신규 저장 엔티티 없음 — 통계는 항상 **재구성**이다(timer.md §4 각주와 동일 원칙).

## 5. 접근성

- 추이 막대·히트맵은 `role=img` + 요약 `aria-label`("최근 7일 평균 달성률 68%"), 칸 단위 상세는 시각적으로 숨긴 대체 `table`을 함께 제공(스크린리더 전용).
- 카테고리 비율 막대는 completion-rate.md R5와 **같은 패턴**을 재사용한다(`role="progressbar" aria-valuenow aria-valuemin=0 aria-valuemax`, 카테고리 이름 라벨) — 새 패턴을 만들지 않는다.
- 기간 토글은 `radiogroup`. 카드 에러의 `[다시 시도]`는 포커스를 잃지 않는다.

## 6. 범위 밖

- 엑셀·CSV 내보내기(product-overview.md §7 비목표), 다른 사용자와 비교, AI 인사이트/추천, 프리미엄 구분(Tasky는 전부 무료), 검색 전용 화면(팔레트로 대체).

## 7. 완료 조건

- [ ] R1~R8 테스트. R4 스트릭 경계(투두 0개 날 건너뛰기, 어제 100%+오늘 미완료 → 스트릭 0) 단위 테스트.
- [ ] 대량 데이터(1년치 픽스처)에서 R7 조회가 `Todo`·`FocusSession` 각 1회만 발생하는지 계약 테스트.
- [ ] 키보드만으로 기간 전환 → 카드 갱신.
- [ ] `role=img`·`table` 대체·`progressbar` 각각 스크린리더로 실제 낭독 확인(§5).
- [ ] 라이트/다크 스크린샷(빈 상태·일반·히트맵 포함).
