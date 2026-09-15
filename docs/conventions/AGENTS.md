<!-- 읽기 조건: 컨벤션 문서를 추가·수정할 때. 컨벤션을 "따르기만" 할 때는 각 문서의 읽기 조건을 따른다. -->

# docs/conventions/ — AGENTS

## 목적
팀(사람+에이전트)이 같은 방식으로 일하게 하는 규칙 문서. 도구(ESLint/Prettier/훅/CI)가 강제할 수 있는 것은 도구로 옮기고, 문서에는 도구가 못 잡는 것만 남긴다.

## 여기 있는 것
| 문서 | 읽는 때 |
|------|--------|
| `code-style.md` | src/ 코드 작성 직전 |
| `git-workflow.md` | 워크트리/커밋/PR/충돌 |
| `agent-collaboration.md` | 티켓 발행, 리뷰 라운드, 보고서 작성 |
| `token-efficiency.md` | 티켓 reads: 설계, 컨텍스트 부족 시 |
| `templates/AGENTS.template.md` | 새 디렉토리 생성 시 |

## 규칙
1. 규칙 추가 시 "도구로 강제 가능한가?"를 먼저 묻는다. 가능하면 `eslint.config.mjs`/훅/CI에 넣고 문서에는 한 줄 링크만.
2. 규칙 하나는 한 문서에만. 다른 문서에서는 링크.
3. 규칙 변경은 `docs/` 티켓 + PR 제목 `docs(conventions): …`. 협업 규칙 자체를 바꾸면 ADR-0004 개정.
4. 예시는 실제 이 프로젝트 경로/식별자로(가상 예시 금지).
5. 각 문서 400줄 이하.

## 관할: templates/
`docs/conventions/templates/`에는 별도 `AGENTS.md`를 두지 않는다(이 문서가 관할, CLAUDE.md §1-4의 면제 조건).
1. 템플릿 파일(`*.template.md`, `*-drafts.md`, `*-recommendations.md`)은 실제로 적용되는 규칙이 아니라 **복사해서 쓰는 원본/초안**이다. 위 "규칙" 절은 적용하지 않되, 금지어 규칙(CLAUDE.md §0)은 그대로 적용.
2. 새 템플릿 추가 시 위 "여기 있는 것" 표에 행을 추가한다.

## 검증
```bash
bash scripts/check-forbidden-words.sh
grep -L '읽기 조건' docs/conventions/*.md   # 출력이 있으면 실패
```

## 자주 하는 실수
- ESLint가 이미 잡는 규칙(세미콜론, import 정렬 세부)을 문서에 다시 씀.
- 새 규칙을 CLAUDE.md에 추가 → CLAUDE.md는 링크와 요약만.
