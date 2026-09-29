// 읽기 조건: 오늘의 기록 카드의 위치(diary.md §2 — 사이드바)를 고치거나 이 스펙이 빨간불일 때.
//
// 재는 것: 사이드바 드로어 안에서 기록을 쓰고 → 카드에 글이 보이고 → 드로어를 닫은 `main` 에는
// 카드가 없고 → 새로고침 뒤 드로어를 다시 열면 글이 남아 있는가. 작성 모달이 **드로어 위**에
// 뜨고 `Esc` 가 모달만 닫는지(overlay-stack)도 여기서만 실제로 잴 수 있다 — jsdom 은 포털 위의
// 포털 순서를 보지 못한다.
//
// 셀렉터는 `tests/AGENTS.md` 규칙대로 역할 + 접근 이름만 쓴다(클래스·색 0건).
import { expect, test } from './fixtures/stub-login';
import { closeSidebarDrawer, openSidebarDrawer } from './sidebar';

import type { Page } from '@playwright/test';

/** `StorageFailureCard.MEMORY_MODE_BANNER_TEXT`. 메모리 모드면 "새로고침 뒤 유지" 가 성립하지 않는다. */
const MEMORY_MODE_TEXT = '지금 적는 내용은 새로고침하면 사라져요';
const DIARY = '오늘의 기록';
const CONTENT = '산책하고 나니 개운했다';

async function waitForShell(page: Page): Promise<void> {
  await page.waitForSelector('main#shell-main');
  await expect(page.getByRole('heading', { name: 'Tasky', level: 1 })).toBeVisible();
  await expect(page.getByText(MEMORY_MODE_TEXT)).toHaveCount(0);
}

test('드로어 안에서 기록을 쓰면 카드에 남고, main 에는 카드가 없으며, 새로고침 뒤에도 남는다', async ({
  page,
}) => {
  await page.goto('/');
  await waitForShell(page);

  // 드로어를 열기 전 — 선택 날짜 패널(`main`)에는 카드가 없다(diary R7).
  await expect(page.getByRole('main').getByRole('region', { name: DIARY })).toHaveCount(0);

  const drawer = await openSidebarDrawer(page);
  const card = drawer.getByRole('region', { name: DIARY });
  await expect(card).toBeVisible();
  await expect(card.getByText('오늘 하루 어땠나요?')).toBeVisible();

  // 작성 모달은 드로어 **위**에 뜬다 — 드로어(`inert` 배경)가 모달을 가리면 이 클릭이 실패한다.
  await card.getByRole('button', { name: '+ 기록하기' }).click();
  const dialog = page.getByRole('dialog', { name: DIARY });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: '기쁨' }).click();
  await dialog.getByRole('textbox', { name: '오늘 하루' }).fill(CONTENT);

  // Esc 는 모달만 닫는다 — 드로어는 그대로다(overlay-stack).
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(drawer).toBeVisible();
  await expect(card.getByRole('button', { name: '+ 기록하기' })).toBeFocused();

  await card.getByRole('button', { name: '+ 기록하기' }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: '기쁨' }).click();
  await dialog.getByRole('textbox', { name: '오늘 하루' }).fill(CONTENT);
  await dialog.getByRole('button', { name: '저장' }).click();
  await expect(dialog).toHaveCount(0);

  // 저장 뒤 카드에 글이 보이고 포커스는 [수정](diary §5), 드로어는 여전히 열려 있다.
  await expect(card.getByText(CONTENT)).toBeVisible();
  await expect(card.getByRole('button', { name: '수정' })).toBeFocused();
  await expect(page.getByRole('region', { name: DIARY })).toHaveCount(1);

  await closeSidebarDrawer(page, drawer);
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('region', { name: DIARY })).toHaveCount(0);

  // 새로고침 뒤 유지 — 드로어를 다시 열면 같은 글이 있다(IndexedDB).
  await page.reload();
  await waitForShell(page);
  const reopened = await openSidebarDrawer(page);
  await expect(reopened.getByRole('region', { name: DIARY }).getByText(CONTENT)).toBeVisible();
});

test('선택 날짜가 오늘이 아니면 카드가 제목 아래에 그 날짜를 적는다', async ({ page }) => {
  await page.goto('/');
  await waitForShell(page);

  // 어제로 이동(shortcuts R1 — 전역 단축키). 앱은 항상 오늘로 시작한다(date-strip.md R2).
  await page.keyboard.press('ArrowLeft');
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][yesterday.getDay()];
  const label = `${yesterday.getMonth() + 1}월 ${yesterday.getDate()}일 (${weekday})`;
  // 패널 머리가 먼저 그 날짜를 보여야 이동이 실제로 일어난 것이다.
  await expect(page.getByRole('main').getByText(label)).toBeVisible();

  const drawer = await openSidebarDrawer(page);
  const card = drawer.getByRole('region', { name: DIARY });
  await expect(card.getByText(label)).toBeVisible();
  // 접근 이름은 날짜와 무관하게 고정이다.
  await expect(card).toHaveAccessibleName(DIARY);
});
