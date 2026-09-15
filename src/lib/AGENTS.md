<!-- 읽기 조건: 유틸을 추가하기 전(중복 확인), 기존 유틸을 수정할 때. -->

# src/lib/ — AGENTS

## 목적

프레임워크·도메인 무관 순수 유틸. `cn.ts`(clsx+tailwind-merge), `date.ts`(DateKey ↔ Date, 주 계산, `nowIso()`), `id.ts`(`newId()` = `crypto.randomUUID()` 래퍼).

## 규칙

1. 추가 전 `Grep`으로 중복 확인. 함수 1개당 테스트 1개. 파일 ≤ 150줄.
2. `DateKey`는 `date.ts`가 정의하고 domain이 재export. 시간·ID 생성 함수는 `deps`로 도메인에 주입된다.
3. 출처: `docs/ARCHITECTURE.md` §1(허용 패키지 `clsx`, `tailwind-merge`).

## 검증

```bash
pnpm test -- src/lib --reporter=dot 2>&1 | tail -20
```
