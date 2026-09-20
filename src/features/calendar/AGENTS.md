<!-- 읽기 조건: src/features/calendar/ 바로 아래(components/store)에 파일을 추가하기 전, 관할만 확인하려고. 규칙 본문은 src/features/AGENTS.md. -->

# src/features/calendar/ — AGENTS

관할 선언 전용 — 고유 규칙 없음. 규칙 본문: [src/features/AGENTS.md](../AGENTS.md).

## 관할: components/

## 관할: store/

## 관할: lib/

<!-- lib/ 는 이 feature 안에서만 쓰는 순수 계산이다(date-strip/AGENTS.md 와 같은 관례). `removal-focus.ts`
     는 `features/shell/lib/focus-fallback.ts` 의 R14 순서를 그대로 옮긴 것이다 — 원본을 import 하지 못하는
     이유는 재사용성이 아니라 조립 방향이다: `shell` 이 `calendar`(DdayPanelSection)를 조립하므로
     `calendar → shell` import 는 순환이 된다(리뷰 라운드 1 Major-1, `import/no-cycle` 실측). 원본이 고쳐지면
     이 파일도 같이 고친다 — 두 파일이 갈라지면 여기 적어 둔다. -->
