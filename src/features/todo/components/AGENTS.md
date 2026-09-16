<!-- 읽기 조건: src/features/todo/components/ 의 파일을 만들거나 고치기 전. 규칙 본문은 src/features/AGENTS.md. -->

# src/features/todo/components/ — AGENTS

규칙 본문은 [src/features/AGENTS.md](../../AGENTS.md)·[docs/conventions/code-style.md](../../../../docs/conventions/code-style.md). 여기에는 이 디렉토리에만 해당하는 것만 적는다.

## 이 디렉토리의 결정

1. **컴포넌트가 아닌 파일이 섞여 있다.** `todo-motion.ts`·`todo-drag.ts`·`todo-focus.ts`(순수 계산)와
   `use*.ts`(모션 훅) 가 그것이다. 원래 자리는 `hooks/` 지만 그 디렉토리는 다른 티켓(T-13) 소유라
   여기에 두었다. 다음에 `hooks/` 를 만질 수 있는 티켓이 옮겨도 된다 — 배럴은 `TodoList` 만 내보내므로
   바깥에서 보이는 것은 달라지지 않는다.
2. **모션 수치는 두 출처를 섞지 않는다.** transition 길이는 CSS 토큰(`--motion-fast`·`--motion-base`,
   theme.md §3-D), "언제 움직이기 시작하는가"(400ms 대기)는 `todo-motion.ts` 의 `COMPLETION_WAIT_MS`
   (todo.md R8). 새 밀리초 리터럴을 컴포넌트에 직접 쓰지 않는다.
3. **IME 판정은 `@/lib/ime` 의 `isImeKey` 만 부른다.** 복제 금지 — 한때 5중 복제였다.
4. **행 단위 키(Space·Enter·Delete·Alt+↑/↓)는 `e.target === e.currentTarget` 일 때만 처리한다.**
   안 그러면 편집 입력에서 친 Space 가 완료 토글이 되고 Backspace 가 삭제 확인을 연다.
5. **드래그 기능에는 반드시 키보드·메뉴 대안이 함께 있다**(WCAG 2.5.7, todo.md §5).
6. **무언가를 닫거나 없애는 코드는 포커스 행선지를 함께 정한다**(app-shell R14). 판단은
   `useTodoItemFocus` 한 곳에 모여 있다 — 삭제·"내일로"·카테고리 이동·편집 패널 닫기가 전부 그리로
   간다. 여기서 빠뜨리면 포커스가 `<body>` 로 떨어지고 다음 `Tab` 이 문서 처음으로 돌아간다.
7. **DOM 표식(`FLIP_ATTR`·`LIST_FOCUS_ATTR`)의 자리는 `todo-focus.ts` 다.** 행을 찾는 쪽이 셋
   (FLIP·포커스 복원·형제 탐색)이라 그 중 하나에 두면 나머지가 거꾸로 import 해 순환이 난다.
   `todo-focus.ts` 는 이 디렉토리에서 아무것도 import 하지 않는 **의존의 바닥**이다.

## 검증

```bash
pnpm test src/features/todo/components --reporter=dot
```
