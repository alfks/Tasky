// 읽기 조건: 루틴 관리 화면의 순서 변경(routine.md R13)을 고치거나, 손잡이·낭독의 접근 이름을 바꿔 이
// 스펙이 깨졌을 때.
//
// 단위 테스트(`RoutineManagerDialog.test.tsx`)가 재는 것은 "드롭·`Alt+↑/↓` 가 어떤 좌표로 스토어에 닿는가"
// 까지다. 여기서만 드러나는 것: (1) 관리 화면 본문이 **지연 청크**로 실제 브라우저에서 열리는가,
// (2) 순서 변경이 **오늘 보드의 실제 인스턴스**에 반영되는가(체크박스 위치), (3) 새로고침 뒤에도 남는가.
import { expect, test } from './fixtures/stub-login';
import { closeSidebarDrawer, createCategoryInDialog, openSidebarDrawer } from './sidebar';

import type { Locator, Page } from '@playwright/test';

/** 메모리 모드 배너 문구(`StorageFailureCard.MEMORY_MODE_BANNER_TEXT`). */
const MEMORY_MODE_TEXT = '지금 적는 내용은 새로고침하면 사라져요';
const CATEGORY = '아침';
const A = '물 마시기';
const B = '스트레칭';
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

async function waitForShell(page: Page): Promise<void> {
  await page.waitForSelector('main#shell-main');
  await expect(page.getByRole('heading', { name: 'Tasky', level: 1 })).toBeVisible();
  // 메모리 구현으로 내려간 상태에서 "새로고침해도 남는다" 를 재면 거짓 기록이 된다.
  await expect(page.getByText(MEMORY_MODE_TEXT)).toHaveCount(0);
}

/** 드로어가 열려 있다고 전제하고 관리 화면을 연다(사이드바 "루틴" → 대화상자). */
async function openManager(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: '루틴' }).click();
  const manager = page.getByRole('dialog', { name: '루틴' });
  await expect(manager).toBeVisible();
  return manager;
}

/** 관리 화면 목록의 이름을 화면 순서대로 — 손잡이의 접근 이름에서 뽑는다. */
async function names(manager: Locator): Promise<string[]> {
  return manager
    .getByRole('button', { name: /순서 변경 \(Alt\+위\/아래\)$/ })
    .evaluateAll((buttons) =>
      buttons.map((button) =>
        (button.getAttribute('aria-label') ?? '').replace(/ 순서 변경.*$/u, ''),
      ),
    );
}

/**
 * "+ 루틴 추가"(R12-b)로 무기한 루틴을 등록한다. 요일 일곱 개를 전부 고르므로 오늘이 무슨 요일이든
 * 즉시 채우기(R3)가 오늘 보드에 인스턴스 하나를 만든다 — 그 인스턴스의 순서를 아래에서 잰다.
 */
async function registerRoutine(page: Page, manager: Locator, title: string): Promise<void> {
  await manager.getByRole('button', { name: '+ 루틴 추가' }).click();
  const dialog = page.getByRole('dialog', { name: '루틴 등록' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('제목').fill(title);
  await dialog.getByLabel('카테고리').selectOption({ label: CATEGORY });
  await dialog.getByRole('checkbox', { name: '계속 반복' }).check();
  const weekdays = dialog.getByRole('group', { name: '반복 요일' });
  for (const label of WEEKDAYS) {
    await weekdays.getByRole('button', { name: label, exact: true }).click();
  }
  await dialog.getByRole('button', { name: '루틴 등록' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(manager.getByRole('button', { name: `${title} 루틴 메뉴` })).toBeVisible();
}

/** 오늘 보드에서 `first` 체크박스가 `second` 보다 위에 있는가(실제 페인트 위치). */
async function isAbove(group: Locator, first: string, second: string): Promise<boolean> {
  const [a, b] = await Promise.all(
    [first, second].map((title) => group.getByRole('checkbox', { name: title }).boundingBox()),
  );
  return a !== null && b !== null && a.y < b.y;
}

test('관리 화면에서 Alt+↑ 로 순서를 바꾸면 낭독하고, 오늘 보드·새로고침 뒤에도 그 순서다 (R13)', async ({
  page,
}) => {
  await page.goto('/');
  await waitForShell(page);

  // 1. 카테고리 → 관리 화면에서 루틴 A·B 등록(오늘 인스턴스가 A, B 순으로 생긴다).
  let drawer = await openSidebarDrawer(page);
  await createCategoryInDialog(page, CATEGORY);
  let manager = await openManager(page);
  await registerRoutine(page, manager, A);
  await registerRoutine(page, manager, B);
  await expect.poll(async () => names(manager)).toEqual([A, B]);
  await page.keyboard.press('Escape'); // 관리 화면 닫기
  await expect(manager).toHaveCount(0);
  await closeSidebarDrawer(page, drawer);

  const group = page.getByRole('region', { name: CATEGORY });
  await expect(group.getByRole('checkbox', { name: B })).toBeVisible();
  await expect.poll(async () => isAbove(group, A, B)).toBe(true);

  // 2. 관리 화면 → B 의 손잡이에 포커스 → Alt+↑ → 낭독(`status` 는 대화상자 안이다 — 토스트 허브도
  //    `role=status` 라 대화상자로 좁힌다).
  drawer = await openSidebarDrawer(page);
  manager = await openManager(page);
  await manager.getByRole('button', { name: `${B} 순서 변경 (Alt+위/아래)` }).focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect.poll(async () => names(manager)).toEqual([B, A]);
  await expect(manager.getByRole('status')).toContainText(`${B} 루틴을 1번째로 옮겼어요`);
  await page.keyboard.press('Escape');
  await expect(manager).toHaveCount(0);
  await closeSidebarDrawer(page, drawer);

  // 3. 오늘 보드가 **바로** 그 순서다 — 이미 만들어진 인스턴스가 슬롯을 맞바꿨다.
  await expect.poll(async () => isAbove(group, B, A)).toBe(true);

  // 4. 새로고침 뒤에도 보드·관리 화면 둘 다 그 순서다(저장까지 갔다).
  await page.reload();
  await waitForShell(page);
  await expect(group.getByRole('checkbox', { name: A })).toBeVisible();
  await expect.poll(async () => isAbove(group, B, A)).toBe(true);
  drawer = await openSidebarDrawer(page);
  manager = await openManager(page);
  await expect.poll(async () => names(manager)).toEqual([B, A]);
  await page.keyboard.press('Escape');
  await closeSidebarDrawer(page, drawer);
});

test('손잡이를 끌어 아래 행 아래에 놓아도 같은 순서 변경이 된다 (R13 드래그)', async ({ page }) => {
  await page.goto('/');
  await waitForShell(page);
  const drawer = await openSidebarDrawer(page);
  await createCategoryInDialog(page, CATEGORY);
  const manager = await openManager(page);
  await registerRoutine(page, manager, A);
  await registerRoutine(page, manager, B);
  await expect.poll(async () => names(manager)).toEqual([A, B]);

  const handle = (title: string) =>
    manager.getByRole('button', { name: `${title} 순서 변경 (Alt+위/아래)` });
  // 마지막 행의 **아래쪽**에 떨어뜨린다. 정중앙은 중간점과 같은 값이라 앞/뒤 판정이 반올림에 걸린다.
  await handle(A).dragTo(handle(B), { targetPosition: { x: 8, y: 30 } });

  await expect.poll(async () => names(manager)).toEqual([B, A]);
  await expect(manager.getByRole('status')).toContainText(`${A} 루틴을 2번째로 옮겼어요`);
  await page.keyboard.press('Escape');
  await closeSidebarDrawer(page, drawer);
});
