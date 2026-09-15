<!-- 읽기 조건: 유틸을 추가하기 전(중복 확인), 기존 유틸을 수정할 때. -->

# src/lib/ — AGENTS

## 목적

프레임워크·도메인 무관 순수 유틸. 현재 `cn.ts`(clsx + tailwind-merge). `date.ts`(DateKey ↔ Date, 주 계산, `nowIso()`)와 `id.ts`(`newId()` = `crypto.randomUUID()` 래퍼)는 T-02 가 추가한다.

## 규칙

1. 추가 전 `Grep`으로 중복 확인. 함수 1개당 테스트 1개. 파일 ≤ 150줄.
2. `DateKey`의 정의는 `src/domain/date/date-key.ts` 하나다. `lib`은 `src/` 안에서 `lib` 밖을 import할 수 없으므로(`ALLOW.lib = ['lib']` — 린트) 그 타입을 가져올 수 없고, 반대로 `domain`이 `@/lib/date`를 import해 재export하는 것도 `NO_LIB_CLOCK`이 막는다. 따라서 `date.ts`는 **같은 모양의 템플릿 리터럴 타입을 자체 선언**한다(구조적 타입이라 호출부에서 그대로 호환된다). **두 선언이 같은 모양인지는 어떤 도구도 검사하지 않는다 — 리뷰 항목이다**: `date-key.ts`를 바꾸면 같은 PR에서 `lib/date.ts`도 바꾼다.
3. 시각·ID 생성 함수(`nowIso()`·`newId()`)는 여기서 구현하고 도메인에는 `deps = { now, id }`로 **주입**한다(ADR-0005 규칙 2). 도메인이 직접 import하면 린트 에러다.
4. 출처: `docs/ARCHITECTURE.md` §1(허용 패키지 `clsx`, `tailwind-merge`).

## 검증

```bash
pnpm test src/lib --reporter=dot 2>&1 | tail -20
```
