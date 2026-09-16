<!-- 읽기 조건: src/features/command/ 바로 아래(components/hooks/lib/store)에 파일을 추가하기 전, 관할과 이 feature 고유의 제약만 확인하려고. 규칙 본문은 src/features/AGENTS.md. -->

# src/features/command/ — AGENTS

규칙 본문: [src/features/AGENTS.md](../AGENTS.md). 스펙: [docs/specs/shortcuts.md](../../../docs/specs/shortcuts.md).

## 이 feature 고유의 제약 (다른 곳에 적을 수 없는 것)

1. **조합은 `store/shortcut-catalog.ts` 에만 적는다.** 기능은 조합이 아니라 id 로 핸들러를 건다
   (`useShortcut('date.next', fn)`). 조합을 호출처에 흩으면 예약 키·중복 검사가 그 화면을
   마운트해야만 돌게 되고, R5(도움말 자동 생성)의 근거가 무너진다.
2. **IME·오버레이·입력 중 판정은 `lib/event-guards.ts` 한 곳.** `isImeKey` 는 `@/lib/ime` 를
   import 한다 — 복제 금지(한때 5중 복제였다).
3. **`<CommandLayer/>` 는 앱 전체에서 1회 마운트.** 두 번 마운트하면 중복 등록으로 즉시 throw 한다.
4. 새 조합을 더할 때는 `lib/reserved-keys.ts` 의 예약 목록을 먼저 본다. 예약 조합은 등록이 거절된다.

## 관할: components/

## 관할: hooks/

## 관할: lib/

## 관할: store/

## 검증

```bash
pnpm test src/features/command --reporter=dot 2>&1 | tail -20 && pnpm lint
```
