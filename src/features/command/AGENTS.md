<!-- 읽기 조건: src/features/command/ 바로 아래(components/hooks/lib/store)에 파일을 추가하기 전, 관할과 이 feature 고유의 제약만 확인하려고. 규칙 본문은 src/features/AGENTS.md. -->

# src/features/command/ — AGENTS

규칙 본문: [src/features/AGENTS.md](../AGENTS.md). 스펙: [docs/specs/shortcuts.md](../../../docs/specs/shortcuts.md).

## 이 feature 고유의 제약 (다른 곳에 적을 수 없는 것)

1. **조합은 `store/shortcut-catalog.ts` 에만 적는다.** 기능은 조합이 아니라 id 로 핸들러를 건다
   (`useShortcut('date.next', fn)`). 조합을 호출처에 흩으면 예약 키·중복 검사가 그 화면을
   마운트해야만 돌게 되고, R5(도움말 자동 생성)의 근거가 무너진다.
2. **IME·오버레이·입력 중 판정은 `lib/event-guards.ts` 한 곳.** `isImeKey` 는 `@/lib/ime` 를
   import 한다 — 복제 금지(한때 5중 복제였다).
3. **`<CommandLayer/>` 는 앱 전체에서 1회 마운트.** 두 번 마운트하면 중복 등록이다 — 개발에서는
   즉시 throw, 프로덕션에서는 경고 + 먼저 등록된 쪽 유지(`lib/duplicate-policy.ts`, 앱 셸에
   에러 바운더리가 생기기 전까지의 방어).
4. 새 조합을 더할 때는 `lib/reserved-keys.ts` 의 예약 목록을 먼저 본다. 예약 조합은 등록이 거절된다.
5. **등록 = 도움말에 싣는다(R5).** 항목 포커스 키(R2)도 예외가 아니다 — 그 키를 **실제로 처리하는**
   컴포넌트가 `useDocumentedShortcuts(ITEM_SHORTCUT_IDS)` 로 등록한다. 처리기가 없는 곳에서 미리
   등록하면 눌러도 아무 일이 없는 도움말이 된다.
6. **가드를 테스트에서 다시 구현하지 않는다.** 카탈로그 검사는 `assertRegisterable` 을 직접 먹여
   단언한다 — 검사를 복제한 테스트는 프로덕션 가드를 한 번도 밟지 않아, 가드를 지워도 초록이었다.

## 관할: components/

## 관할: hooks/

## 관할: lib/

## 관할: store/

## 검증

```bash
pnpm test src/features/command --reporter=dot 2>&1 | tail -20 && pnpm lint
```
