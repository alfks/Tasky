<!-- 읽기 조건: ADR을 새로 쓰거나(레이어/저장소/의존성/협업 규칙 변경), 기존 결정의 근거를 확인할 때. -->

# docs/decisions/ — AGENTS

## 목적
아키텍처 결정 기록(ADR). 병렬 에이전트가 "왜"를 재조사하거나 결정을 무심코 뒤집는 것을 막는다.

## 여기 있는 것
- `ADR-0000-template.md`: 템플릿
- `ADR-0001-…` 이후: 결정 1건 = 파일 1개, 번호 4자리, 파일명 kebab-case
- 인덱스: [../DECISIONS.md](../DECISIONS.md) (여기 행 추가가 필수)

## ADR이 필요한 변경
레이어 추가/삭제 · 의존 방향 변경 · 저장소 인터페이스 시그니처 변경 · IndexedDB 스키마 버전업 · 상태관리/스타일링 라이브러리 교체 · 새 런타임 의존성 · 협업 규칙(피드백 기준, 브랜치 규칙) 변경 · Phase 2 확장 지점 활성화

## 규칙
1. ADR은 60줄 이하. 상태: `proposed → accepted | rejected | superseded by ADR-nnnn`.
2. 결정 변경은 기존 ADR 수정이 아니라 **새 ADR + 이전 것 `superseded`**.
3. ADR PR은 라벨 `adr`, 코드 변경과 분리(단, 스키마 마이그레이션처럼 분리 불가하면 같은 PR + PR 본문에 명시).
4. `accepted` 전 구현 티켓 발행 금지.
5. 근거에 레퍼런스 앱 제품명 금지.

## 검증
```bash
ls docs/decisions | sort | tail -3          # 다음 번호 확인
grep -c '^| ADR-' docs/DECISIONS.md          # 인덱스 행 수 = ADR 수
```

## 자주 하는 실수
- 인덱스(`DECISIONS.md`) 갱신 누락.
- "대안" 절을 비움 → 최소 1개 대안과 기각 이유 필수.
