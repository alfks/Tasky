<!-- 읽기 조건: src/ 바로 아래에 새 최상위 디렉토리를 만들 때만. 기존 디렉토리 작업은 그 디렉토리 AGENTS.md로 바로 간다. -->

# src/ — AGENTS

## 목적

앱 소스 루트. 레이어 = 디렉토리: `app`(UI 셸) `components`(공용 UI) `features`(기능+상태) `domain`(규칙) `repositories`(계약) `infra`(구현) `lib`(유틸) `styles`(토큰) `test`(테스트 지원).

## 규칙

1. 새 최상위 디렉토리·직속 코드 파일·확장자는 ADR + `scripts/arch-layers.mjs` 수정. 목록 밖이면 파일 자체가 린트 에러다(ADR-0006).
2. `src/` 안의 `.md`는 디렉토리 규칙 문서 `AGENTS.md`만 — 다른 이름의 문서는 `docs/`로(전수 분류가 거부).
3. `__arch__/`는 `scripts/check-arch.sh`의 임시 픽스처 이름 — 직접 만들지 않는다.
4. 의존 방향 `docs/ARCHITECTURE.md` §1 · 코드/import 표기 `docs/conventions/code-style.md` §2·§7.

## 검증

```bash
pnpm check
```
