// 읽기 조건: 월 보기(달력 격자)를 고치거나, 날짜 스트립의 접근 이름을 바꿔 이 테스트가 깨졌을 때.
//
// 재는 것은 **실제 브라우저에서만 드러나는 것** 하나다: 월 보기에서 투두를 체크하면 그 달의 칸이
// **즉시** 바뀌는가(date-strip.md R17 · T-56). jsdom 단위 테스트는 `summaryRevision` 을 손으로
// 올려서 이것을 재지만, 그 값을 실제로 올리는 것은 셸이다 — 셸까지 포함한 배선은 여기서만 보인다.
//
// 셀렉터는 전부 **역할(role) + 접근 이름**이다. 클래스·색·DOM 구조에 걸면 면·토큰·레이아웃을
// 바꾸는 다른 티켓이 이 테스트를 부순다.
import { expect, test } from '@playwright/test';

import type { Page } from '@playwright/test';

/** 메모리 모드 배너 문구(`StorageFailureCard.MEMORY_MODE_BANNER_TEXT`). */
const MEMORY_MODE_TEXT = '지금 적는 내용은 새로고침하면 사라져요';

const CATEGORY = '운동';
const TITLE = '달리기 30분';

async function waitForShell(page: Page): Promise<void> {
  await page.waitForSelector('main#shell-main');
  await expect(page.getByRole('heading', { name: 'Tasky', level: 1 })).toBeVisible();
  await expect(page.getByText(MEMORY_MODE_TEXT)).toHaveCount(0);
}

async function createCategory(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: '+ 카테고리 추가' }).click();
  const dialog = page.getByRole('dialog', { name: '카테고리 만들기' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('이름').fill(name);
  await dialog.getByRole('button', { name: '만들기' }).click();
  await expect(dialog).toHaveCount(0);
}

/** 오늘 칸. 접근 이름이 '…, 오늘, …' 을 포함하는 칸은 하루에 하나뿐이다. */
function todayCell(page: Page, role: 'radio' | 'gridcell') {
  return page.getByRole(role, { name: /, 오늘/ });
}

test('월 보기로 바꾸면 달력 격자가 나오고, 체크하면 그 달의 칸이 즉시 갱신된다', async ({
  page,
}) => {
  await page.goto('/');
  await waitForShell(page);

  await createCategory(page, CATEGORY);
  const group = page.getByRole('region', { name: CATEGORY });
  await group.getByRole('button', { name: '+ 할 일 추가' }).click();
  const input = page.getByRole('textbox', { name: `${CATEGORY}에 할 일 추가` });
  await expect(input).toBeFocused();
  await input.fill(TITLE);
  await page.keyboard.press('Enter');
  await expect(group.getByRole('checkbox', { name: TITLE })).toBeVisible();

  // 주 보기: 한 줄 7칸. 오늘 칸에 "할 일 1개 중 0개 완료" 가 붙는다.
  await expect(page.getByRole('radiogroup', { name: '날짜 선택' })).toBeVisible();
  await expect(todayCell(page, 'radio')).toHaveAccessibleName(/할 일 1개 중 0개 완료/);

  await page.getByRole('button', { name: '월 보기로 전환' }).click();

  // 월 보기: 격자 + 요일 머리글 줄. 칸 수는 달마다 다르므로(4~6줄) 범위로 잰다.
  const grid = page.getByRole('grid', { name: '날짜 선택' });
  await expect(grid).toBeVisible();
  await expect(page.getByRole('columnheader')).toHaveCount(7);
  const cellCount = await page.getByRole('gridcell').count();
  expect(cellCount % 7).toBe(0);
  expect(cellCount).toBeGreaterThanOrEqual(28);
  expect(cellCount).toBeLessThanOrEqual(42);

  // 요약은 보기를 바꿔도 같은 문장으로 이어진다.
  await expect(todayCell(page, 'gridcell')).toHaveAccessibleName(/할 일 1개 중 0개 완료/);

  // **이 테스트의 요점**: 월 보기인 채로 체크하면 그 달의 칸이 다시 읽힌다.
  await group.getByRole('checkbox', { name: TITLE }).check();
  await expect(todayCell(page, 'gridcell')).toHaveAccessibleName(/할 일 1개 중 1개 완료/);

  // 되돌아오면 한 줄 스트립이고 선택 날짜는 그대로 오늘이다.
  await page.getByRole('button', { name: '주 보기로 전환' }).click();
  await expect(page.getByRole('radiogroup', { name: '날짜 선택' })).toBeVisible();
  await expect(todayCell(page, 'radio')).toHaveAccessibleName(/할 일 1개 중 1개 완료/);
  await expect(todayCell(page, 'radio')).toBeChecked();
});

test('월 보기에서 ↑/↓ 는 일주일을 옮기고 ‹ › 는 한 달을 옮긴다', async ({ page }) => {
  await page.goto('/');
  await waitForShell(page);

  await page.getByRole('button', { name: '월 보기로 전환' }).click();
  const monthLabel = page.getByRole('button', { name: /년 \d+월/ });
  const before = await monthLabel.textContent();

  // ‹ › 의 이름부터 달 단위로 바뀐다.
  await expect(page.getByRole('button', { name: '다음 달' })).toBeVisible();
  await page.getByRole('button', { name: '다음 달' }).click();
  await expect(monthLabel).not.toHaveText(before ?? '');
  await page.getByRole('button', { name: '이전 달' }).click();
  await expect(monthLabel).toHaveText(before ?? '');

  // ↓ 한 번이면 같은 요일의 다음 주 칸으로 포커스가 간다.
  const today = todayCell(page, 'gridcell');
  await today.focus();
  const todayName = (await today.getAttribute('aria-label')) ?? '';
  const weekday = /(\S)요일/.exec(todayName)?.[1] ?? '';
  await page.keyboard.press('ArrowDown');
  const focused = page.locator(':focus');
  await expect(focused).toHaveAttribute('aria-label', new RegExp(`${weekday}요일`));
  await expect(focused).not.toHaveAttribute('aria-label', todayName);
});
