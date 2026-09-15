<!-- 읽기 조건: 상태관리 방식이나 스타일링/테마 토큰 체계를 바꾸기 전, 새 UI 라이브러리를 추가하려 할 때. -->

# ADR-0003: 상태는 Zustand(feature별), 스타일은 Tailwind CSS v4 + CSS 변수 토큰

- 상태: accepted
- 날짜: 2026-09-15
- 관련: docs/conventions/code-style.md §4·§6, ADR-0002(레포지토리 호출) · relates to ADR-0005(store는 `rev`/`updatedAt`을 직접 쓰지 않고 `touch()`를 거친다)

## 맥락

서버가 없는 로컬 우선 앱이라 서버 상태 라이브러리는 과하다. 반면 테마·강조색·카테고리 색이 핵심 기능이라 런타임 색 변경이 잦다. 병렬 에이전트가 각자 스타일을 발명하면 감성 일관성이 깨진다.

## 결정

- 상태: **Zustand**, feature당 스토어 1개, 액션이 레포지토리를 호출. 도메인 계산은 순수 함수에 위임.
- 스타일: **Tailwind CSS v4** 유틸 + `src/styles/tokens.css`의 CSS 변수. 테마는 `data-theme` 속성, 강조색은 `--color-accent` 런타임 주입. 컴포넌트에서 hex 금지.
- 유틸리티 결합은 `cn()`(clsx + tailwind-merge).

## 대안과 기각 이유

| 대안                            | 기각 이유                                                |
| ------------------------------- | -------------------------------------------------------- |
| TanStack Query + Dexie          | 서버 캐시 개념이 맞지 않고 무효화 규칙이 불필요한 복잡성 |
| Redux Toolkit                   | 보일러플레이트 대비 이득 없음(앱 규모 작음)              |
| React Context만                 | 리렌더 범위 제어 어려움                                  |
| CSS Modules / styled-components | 토큰 강제 어려움, 런타임 CSS-in-JS는 RSC와 마찰          |
| UI 키트(MUI 등)                 | 레퍼런스 앱의 고유 감성 재현에 방해, 번들 증가           |

## 결과

- 좋은 점: 스토어 selector로 리렌더 최소화, 토큰 하나로 전체 룩 조정, 다크 모드가 변수 재정의로 끝남.
- 감수하는 점: 반응성은 스토어가 수동 갱신, 토큰 규율을 리뷰로 지켜야 함.

## 지켜야 할 규칙

1. 스토어는 `src/features/<f>/store/` 에만, 전역 단일 스토어 금지.
2. 컴포넌트는 selector로 구독. 스토어 전체 구독은 리뷰 Major.
3. 색·간격·라운드·z-index는 토큰만. 예외는 카테고리 사용자 지정 색(`--cat-color`).
4. 새 상태/스타일 라이브러리 추가는 이 ADR을 supersede하는 새 ADR 필요(현재 supersedes/superseded by 없음).

## 재검토 트리거

- 동기화 도입으로 서버 캐시가 필요해질 때(TanStack Query 재검토).
- `touch()` 갱신 규칙(ADR-0005)이 바뀌어 store 계약에 영향을 줄 때.
