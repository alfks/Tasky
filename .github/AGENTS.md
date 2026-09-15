<!-- 읽기 조건: CI가 실패했을 때, 워크플로/템플릿/라벨/CODEOWNERS를 수정할 때. PR을 "만들기만" 할 때는 템플릿이 자동 삽입되므로 읽지 않아도 된다. -->

# .github/ — AGENTS

## 목적

GitHub 자동화와 양식. 규칙을 사람이 기억하지 않아도 되게 만드는 곳.

## 여기 있는 것

- `workflows/ci.yml`: `guard`(금지어·author·AGENTS.md 구조·브랜치명·PR 제목/본문, 항상) + `build`(레이어 경계 린트 + 아키텍처 2차 패스·lint·typecheck·format·test·build, `package.json` 있을 때만)
- `pull_request_template.md`, `ISSUE_TEMPLATE/{feature_request,bug_report}.md`, `ISSUE_TEMPLATE/config.yml`
- `CODEOWNERS`: 전 경로 `@alfks`
- `labels.yml`: 라벨 정의(`type:*`, `area:*`, `review:round-N`, `status:*`, `size:large`, `phase:2`, `adr`)

## 규칙

1. CI 스텝은 `scripts/check-*.sh`를 **호출**한다. 로직을 yml에 중복 구현하지 않는다(로컬과 CI가 같은 스크립트).
2. 워크플로 변경은 `ci(...)` 커밋, PR에 실행 로그 링크 첨부.
3. 액션은 메이저 버전 태그(`@v4`)로 고정. 서드파티 액션 추가는 사용자 확인.
4. 시크릿은 쓰지 않는다(로컬 우선 앱, 배포 없음). 필요해지면 ADR.
5. 템플릿 문구에 AI 언급·제품명 금지.
6. 라벨 변경은 `labels.yml` 수정 → 상단 주석의 명령으로 동기화.

## 관할: workflows/

## 관할: ISSUE_TEMPLATE/

`.github/workflows/`와 `.github/ISSUE_TEMPLATE/`에는 별도 `AGENTS.md`를 두지 않는다(이 문서가 관할, CLAUDE.md §1-4의 면제 조건).

1. `workflows/*.yml` 수정은 위 "규칙" §1~§3과 동일하게 따른다.
2. `ISSUE_TEMPLATE/*.md` 문구 규칙: AI 언급·제품명 금지(§5와 동일). 새 템플릿 추가 시 `config.yml`에 등록.

## 검증

```bash
gh pr checks <n>                         # 상태
gh run view <run-id> --log-failed | tail -60
act -j guard 2>/dev/null || echo "act 미설치: bash scripts/check-forbidden-words.sh 로 대체"
```

## 자주 하는 실수

- `fetch-depth: 0` 없이 author 검사 → 커밋 범위가 비어 통과처럼 보임. 유지할 것.
- `build` 잡의 `pkg` 스텝(ci.yml:89-97)과 각 스텝의 `if: steps.pkg.outputs.present` 제거 → 스캐폴딩 전 PR 전부 실패.
- CI가 현재 계정/레포 차원에서 아예 실행되지 않는다(체크아웃조차 안 됨, 잡 로그 404) — **워크플로를 고쳐도 해결되지 않는다.** 실질 게이트는 `bash scripts/check.sh`(CLAUDE.md 현재 상태 참고).
