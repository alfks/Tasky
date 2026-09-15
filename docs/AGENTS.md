<!-- 읽기 조건: docs/ 아래에 새 문서를 만들거나 기존 문서를 옮길 때. 특정 문서를 읽기만 할 때는 그 문서의 읽기 조건 주석만 보면 된다. -->

# docs/ — AGENTS

## 목적
설계·컨벤션·리서치·스펙·ADR의 저장소. 코드가 아닌 "왜"와 "어떻게 일하는가"를 담는다.

## 여기 있는 것 / 없는 것
- 있음: `ARCHITECTURE.md`(구조 맵), `DIRECTORY_MAP.md`(위치 맵), `DECISIONS.md`(ADR 인덱스), `conventions/`, `research/`, `specs/`, `decisions/`
- 없음: 협업 프로토콜 흐름(루트 `AGENTS.md`), 티켓·핸드오프(`.worktrees/`, 커밋 안 함), 코드 주석으로 충분한 설명

## 규칙
1. 모든 문서 첫 줄은 `<!-- 읽기 조건: … -->`. 없으면 리뷰 Major.
2. 문서는 400줄 이하. 초과 시 디렉토리로 분할 + `index.md`.
3. 같은 내용을 두 문서에 쓰지 않는다. 링크한다. 새 문서 전에 `Grep -i '<핵심어>' docs/`.
4. 파일명 kebab-case 영문. 대문자 파일은 맵/인덱스(`ARCHITECTURE`, `DIRECTORY_MAP`, `DECISIONS`)만.
5. 레퍼런스 앱 제품명 금지. 스크린샷을 넣을 땐 로고/이름 부분을 가린다.
6. 구조가 바뀌면 `ARCHITECTURE.md`와 `DIRECTORY_MAP.md`를 **같은 PR**에서 갱신.
7. 하위 디렉토리를 추가하면 `AGENTS.md` 필수 + `DIRECTORY_MAP.md` 행 추가.

## 검증
```bash
bash scripts/check-forbidden-words.sh && bash scripts/check-agents-md.sh
```

## 자주 하는 실수
- 리서치 내용을 스펙에 통째로 복사 → 스펙은 요구사항만, 리서치는 섹션 링크.
- 루트 `CLAUDE.md`에 디렉토리 규칙 추가 → 해당 디렉토리 `AGENTS.md`로.
