<!-- 읽기 조건: PR 생성 시 자동 삽입. 모든 섹션을 채우고 해당 없는 항목은 "해당 없음"으로 표기. -->

## 요약

<!-- 1~3줄. 무엇을, 왜. 티켓: T-<n> -->

## 변경 유형

- [ ] feature (새 기능)
- [ ] fix (버그 수정)
- [ ] refactor (동작 변화 없는 구조 변경)
- [ ] docs (문서)
- [ ] chore (설정/의존성/스크립트)
- [ ] test (테스트만)

## 상세 변경 내역

<!-- 파일/모듈 단위로 불릿. 레이어 경계(domain/repositories/infra)를 건드렸으면 명시하고 ADR 번호 기재 -->

-

## 스크린샷 · GIF

<!-- UI 변경 시 필수. 라이트/다크 각 1장. 해당 없음이면 그렇게 표기 -->

## 테스트 방법

<!-- 리뷰어가 그대로 실행할 명령과 확인 포인트 -->

```bash
pnpm check   # 스캐폴딩 전: bash scripts/check.sh
```

-

## owns (티켓의 `owns:`를 그대로 복사 — 리뷰어가 `git diff --name-only main...HEAD`와 대조)

```owns

```

## 리뷰 포인트

<!-- 리뷰어가 집중해서 봐 주었으면 하는 곳 1~3개 (파일:줄) 및 스스로 확신이 없는 판단 -->

-

## 체크리스트

- [ ] 레퍼런스 앱의 실제 제품명(금지어)이 파일명/본문/코드/주석/커밋에 없다 (`bash scripts/check-forbidden-words.sh` 통과)
- [ ] 모든 커밋 author가 `alfks <millie020524@gmail.com>` 이다 (`bash scripts/check-author.sh main` 통과)
- [ ] 커밋 메시지·PR 본문에 AI 생성 문구/서명(`Co-Authored-By: Claude`, `Generated with Claude Code`, 세션 URL 등)이 없다
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` 통과
- [ ] 새로 만든 디렉토리마다 `AGENTS.md`가 있고, 변경한 디렉토리의 `AGENTS.md`가 여전히 정확하다 (갱신했으면 파일명 기재: )
- [ ] 접근성 확인: 키보드만으로 조작 가능, 시맨틱 요소 사용, 포커스 링 유지 (UI 변경 시)
- [ ] 티켓 `owns:` 범위 밖 파일을 수정하지 않았다 (위 `## owns` 블록과 `git diff --name-only main...HEAD` 대조)
- [ ] 핸드오프 문서 작성: `.worktrees/handoffs/T-<n>.md` (포맷: `.worktrees/AGENTS.md`)

## 관련 이슈

<!-- Closes #<n> / Refs T-<n> / ADR-<nnnn> -->
