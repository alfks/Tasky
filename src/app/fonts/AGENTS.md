<!-- 읽기 조건: 폰트 파일을 교체·재서브셋하거나 라이선스 고지를 확인할 때. -->

# src/app/fonts/ — AGENTS

## 목적

Pretendard 셀프 호스팅 가변 폰트 서브셋(woff2 1개)과 그 라이선스 고지. `docs/specs/theme.md` §3-F(R10~R16)가 단일 소스.

## 여기 있는 것 / 없는 것

- 있음: `PretendardVariable.subset.woff2`(서브셋 산출물), `OFL.txt`(원본 저장소 `LICENSE`와 동일, 수정 금지).
- 없음(다른 곳): `@font-face` 선언·CSS 변수(`--font-sans`)는 `src/styles/**`, 서브셋 생성 로직은 `scripts/subset-font.sh`.

## 규칙 (이 디렉토리에만 적용)

1. woff2 산출물을 손으로 고치지 않는다 — 범위를 바꿀 땐 `scripts/subset-font.sh`를 다시 돌려 통째로 교체한다.
2. woff/ttf/otf 등 다른 포맷을 추가하지 않는다(R14, woff2 1개만).
3. `OFL.txt`는 원본 배포의 `LICENSE`를 바이트 그대로 복사한 것만 허용(재서명·편집 금지).

## 의존 방향

- import 가능: 없음(정적 자산, `@font-face`의 `src` 경로로만 참조됨).
- import 금지: 컴포넌트·도메인 코드에서 직접 `import` 금지.

## 검증

```bash
bash scripts/subset-font.sh <원본 PretendardVariable.ttf 경로>
ls -la src/app/fonts/*.woff2   # ≤ 600KB(R14)
```

## 자주 하는 실수

- 서브셋 범위를 CSS나 컴포넌트에서 우회하려는 시도 — 범위는 스크립트에서만 바꾼다.
