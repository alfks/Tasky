<!-- 읽기 조건: 테스트를 작성할 때 픽스처·셋업을 확인하려고. -->

# src/test/ — AGENTS

## 목적

Vitest 셋업(`setup.ts`: jsdom, `fake-indexeddb/auto`, `setRepositories(memory)`)과 픽스처 팩토리(`fixtures/todo.ts` 등 `makeTodo(overrides)`).

## 규칙

1. 픽스처는 팩토리 함수만(정적 JSON 금지). 기본값은 결정적(고정 날짜 `2026-01-15`, 고정 id 접두, `rev: 1`, `createdAt = updatedAt = '2026-01-15T00:00:00.000Z'`). `Persistable`이 필요하면 `touch(...)`로 만든다(`as Persistable` 금지는 여기서도 적용).
2. 각 테스트는 독립: `beforeEach`에서 memory 레포지토리 초기화. `vi.useFakeTimers()`는 애니메이션 테스트에만.
3. 출처: `docs/conventions/code-style.md` §11.

## 관할: fixtures/

`src/test/fixtures/`에는 별도 `AGENTS.md`를 두지 않는다(이 문서가 관할, 특히 규칙 1).

## 검증

```bash
pnpm test --reporter=dot 2>&1 | tail -20
```
