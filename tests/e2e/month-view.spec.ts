// 읽기 조건: 월 보기(달력 격자)를 고치거나, 날짜 스트립의 접근 이름을 바꿔 이 테스트가 깨졌을 때.
//
// 재는 것은 **실제 브라우저에서만 드러나는 것** 하나다: 월 보기에서 투두를 체크하면 그 달의 칸이
// **즉시** 바뀌는가(date-strip.md R17 · T-56). jsdom 단위 테스트는 `summaryRevision` 을 손으로
// 올려서 이것을 재지만, 그 값을 실제로 올리는 것은 셸이다 — 셸까지 포함한 배선은 여기서만 보인다.
//
// 셀렉터는 전부 **역할(role) + 접근 이름**이다. 클래스·색·DOM 구조에 걸면 면·토큰·레이아웃을
// 바꾸는 다른 티켓이 이 테스트를 부순다.
import { expect, test } from './fixtures/stub-login';
import { createCategory } from './sidebar';

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

test('360 폭 6줄 달에서 격자가 뷰포트 안에 들어오고 고정 영역이 320px 이하다(calendar-layout.md R9)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await waitForShell(page);

  await page.getByRole('button', { name: '월 보기로 전환' }).click();

  // R9 의 목표치는 **6줄(42칸) 달** 기준이라, 지금 달이 6줄이 아니면 나올 때까지 다음 달로 넘긴다.
  let cellCount = await page.getByRole('gridcell').count();
  for (let i = 0; i < 24 && cellCount !== 42; i += 1) {
    await page.getByRole('button', { name: '다음 달' }).click();
    cellCount = await page.getByRole('gridcell').count();
  }
  expect(cellCount, '2년 안에 6줄 달을 찾지 못했다').toBe(42);

  // 가로 스크롤이 없다 — 문서 폭이 뷰포트를 넘지 않는다.
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(overflow.scrollWidth, '360px 에서 문서가 뷰포트보다 넓다').toBeLessThanOrEqual(
    overflow.innerWidth,
  );

  // 격자 자체도 뷰포트 폭 안에 있다.
  const grid = page.getByRole('grid', { name: '날짜 선택' });
  const box = await grid.boundingBox();
  expect(box, '격자 박스를 읽지 못했다').not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(overflow.innerWidth);

  // 고정 영역(셸 상단 줄 + 스트립 헤더 + 격자) ≤ 320px(R9) — 격자 바로 아래부터 목록이 스크롤된다.
  // 기준선은 **셸 상단 줄의 위**(`카테고리 열기` 버튼의 y)다 — 그 위의 페이지 여백(안전 영역 거터)은
  // 달력 블록 소관이 아니라 셸의 바깥 여백이라 R9 의 "고정 영역"에 포함되지 않는다.
  const shellTop = await page.getByRole('button', { name: '카테고리 열기' }).boundingBox();
  expect(shellTop, '셸 상단 줄 기준점을 읽지 못했다').not.toBeNull();
  expect(
    box!.y + box!.height - shellTop!.y,
    '고정 영역(셸 상단 줄 + 스트립 헤더 + 격자)이 320px 을 넘는다',
  ).toBeLessThanOrEqual(320);
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

/** 월 표시 버튼("2026년 9월")에서 달 번호만 뽑는다. */
async function displayedMonth(page: Page): Promise<number> {
  const text = (await page.getByRole('button', { name: /년 \d+월/ }).textContent()) ?? '';
  return Number(/(\d+)월/.exec(text)?.[1]);
}

test('이 달 밖(회색) 칸을 마우스로 누르면 그 날이 선택되고 격자가 그 달로 넘어간다(date-strip.md R16)', async ({
  page,
}) => {
  await page.goto('/');
  await waitForShell(page);
  await page.getByRole('button', { name: '월 보기로 전환' }).click();

  // 격자 끝자락에 다른 달의 칸이 있는 달을 찾는다 — 1일이 월요일이고 말일이 일요일인 달(예: 2027년 2월)
  // 은 격자가 그 달로 꽉 차서 회색 칸이 없다. 그런 달이면 다음 달로 넘긴다(연속 두 달일 수는 없다).
  let month = await displayedMonth(page);
  let outside = page.getByRole('gridcell', { name: new RegExp(`^(?!${month}월 )`) });
  if ((await outside.count()) === 0) {
    await page.getByRole('button', { name: '다음 달' }).click();
    month = await displayedMonth(page);
    outside = page.getByRole('gridcell', { name: new RegExp(`^(?!${month}월 )`) });
  }
  // 마지막 회색 칸(다음 달 첫 주) 또는 첫 회색 칸(지난 달 끝 주) — 어느 쪽이든 이 달이 아니다.
  const target = outside.last();
  const targetName = (await target.getAttribute('aria-label')) ?? '';
  const targetMonth = Number(/^(\d+)월/.exec(targetName)?.[1]);
  expect(targetMonth).not.toBe(month);

  // **실제 마우스 클릭**이다. `locator.click()` 은 mousedown → focus → mouseup → click 을 실제 순서로
  // 보내므로, mousedown 의 포커스만으로 격자가 다시 그려지면 click 이 다른 칸(또는 조상)에 떨어져
  // 선택이 일어나지 않는다 — 그것이 이 테스트가 재현하는 버그다.
  await target.click();

  // 그 날이 선택됐고, 격자는 그 날이 든 달이며, 포커스 링도 그 칸에 있다.
  const selected = page.getByRole('gridcell', { name: targetName });
  await expect(selected).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: /년 \d+월/ })).toHaveText(
    new RegExp(`(?<!\\d)${targetMonth}월`),
  );
  await expect(selected).toBeFocused();
  // 다른 칸은 선택되지 않았다 — 선택 칸은 정확히 하나다.
  await expect(page.getByRole('gridcell', { selected: true })).toHaveCount(1);
});

test('월 보기는 새로고침 뒤에도 월 보기다 — 선택 날짜는 오늘로 돌아온다(date-strip.md R14·R2)', async ({
  page,
}) => {
  await page.goto('/');
  await waitForShell(page);

  await page.getByRole('button', { name: '월 보기로 전환' }).click();
  await expect(page.getByRole('grid', { name: '날짜 선택' })).toBeVisible();
  const monthLabel = page.getByRole('button', { name: /년 \d+월/ });
  const thisMonth = (await monthLabel.textContent()) ?? '';
  // 다른 달의 날을 골라 두어도(R2 — 월 보기의 › 는 선택 날짜를 한 달 옮긴다) …
  await page.getByRole('button', { name: '다음 달' }).click();
  await expect(monthLabel).not.toHaveText(thisMonth);
  await expect(todayCell(page, 'gridcell')).not.toHaveAttribute('aria-selected', 'true');

  await page.reload();
  await waitForShell(page);

  // … 새로고침 뒤에는 월 보기 그대로에 선택은 오늘이다.
  await expect(page.getByRole('grid', { name: '날짜 선택' })).toBeVisible();
  await expect(monthLabel).toHaveText(thisMonth);
  await expect(todayCell(page, 'gridcell')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: '주 보기로 전환' })).toBeVisible();

  // 기기별 저장은 키 하나다 — 선택 날짜는 저장하지 않는다(R2).
  const keys = await page.evaluate(() =>
    Object.keys(window.localStorage).filter((key) => key.startsWith('tasky.datestrip')),
  );
  expect(keys).toEqual(['tasky.datestrip.v1']);
  const stored = await page.evaluate(() => window.localStorage.getItem('tasky.datestrip.v1'));
  expect(JSON.parse(stored ?? 'null')).toEqual({ view: 'month' });

  // 주 보기로 돌리면 다음 방문은 주 보기다.
  await page.getByRole('button', { name: '주 보기로 전환' }).click();
  await page.reload();
  await waitForShell(page);
  await expect(page.getByRole('radiogroup', { name: '날짜 선택' })).toBeVisible();
});
