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

import type { Locator, Page } from '@playwright/test';

/** `StorageFailureCard.MEMORY_MODE_BANNER_TEXT`. 메모리 모드면 "새로고침 뒤 유지" 가 성립하지 않는다. */
const MEMORY_MODE_TEXT = '지금 적는 내용은 새로고침하면 사라져요';
const DIARY = '오늘의 기록';
const CONTENT = '산책하고 나니 개운했다';

/** 그 지점을 실제로 누르면 이 요소가 받는가 — `narrow-viewport.spec.ts` 와 같은 `elementFromPoint` 실측. */
async function isOnTop(locator: Locator): Promise<boolean> {
  const box = await locator.boundingBox();
  if (box === null) return false;
  return locator.evaluate(
    (el, { x, y }) => {
      const hit = document.elementFromPoint(x, y);
      return hit !== null && (hit === el || el.contains(hit));
    },
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
}

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

test('삭제 → 드로어 닫기 → 다시 열기 → [되돌리기] 로 글이 돌아온다 (리뷰 Major 1)', async ({
  page,
}) => {
  await page.goto('/');
  await waitForShell(page);
  const drawer = await openSidebarDrawer(page);
  const card = drawer.getByRole('region', { name: DIARY });
  await card.getByRole('button', { name: '+ 기록하기' }).click();
  const dialog = page.getByRole('dialog', { name: DIARY });
  await dialog.getByRole('radio', { name: '기쁨' }).click();
  await dialog.getByRole('textbox', { name: '오늘 하루' }).fill(CONTENT);
  await dialog.getByRole('button', { name: '저장' }).click();
  await expect(card.getByText(CONTENT)).toBeVisible();

  await card.getByRole('button', { name: `${DIARY} 메뉴` }).click();
  await page.getByRole('menuitem', { name: '삭제' }).click();
  const undo = page.getByRole('button', { name: '되돌리기' });
  await expect(undo).toBeVisible();

  // 토스트는 드로어 밖(하단 중앙)에 뜨므로 드로어를 닫는 것이 자연스럽다 — 6초 안에 다시 연다.
  await closeSidebarDrawer(page, drawer);
  const reopened = await openSidebarDrawer(page);
  await expect(
    reopened.getByRole('region', { name: DIARY }).getByText('오늘 하루 어땠나요?'),
  ).toBeVisible();
  await undo.click();
  await expect(reopened.getByRole('region', { name: DIARY }).getByText(CONTENT)).toBeVisible();
});

test('1280×720 고정 컬럼: 카드 세 장은 한 스크롤 영역에 흐르고 [+ 기록하기]·[+ 카테고리 추가]·[로그아웃] 에 닿는다 (리뷰 Major 2)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await waitForShell(page);
  const drawer = await openSidebarDrawer(page);
  await page.getByRole('button', { name: '사이드바 고정' }).click();
  await expect(drawer).toHaveCount(0);
  const nav = page.getByRole('navigation', { name: '카테고리' });
  await expect(nav).toBeVisible();

  const add = nav.getByRole('button', { name: '+ 기록하기' });
  const addCategory = nav.getByRole('button', { name: '+ 카테고리 추가' });
  // `exact` — "다른 기기 모두 로그아웃" 도 같은 nav 안에 있다.
  const logout = nav.getByRole('button', { name: '로그아웃', exact: true });
  await expect(add).toBeVisible();

  // 도구 줄·계정 블록은 스크롤 영역 밖 — 스크롤 없이 바로 닿는다.
  expect(await isOnTop(logout), '로그아웃이 가려 있다').toBe(true);
  expect(await isOnTop(addCategory), '+ 카테고리 추가가 가려 있다').toBe(true);
  // 기록 카드는 (필요하면) 한 번의 스크롤로 **통째로** 드러난다 — 카드 자신은 스크롤 상자가 아니다.
  await add.scrollIntoViewIfNeeded();
  expect(await isOnTop(add), '+ 기록하기가 가려 있다').toBe(true);
  const card = nav.getByRole('region', { name: DIARY });
  expect(
    await card.evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
    '기록 카드가 자기 안에서 스크롤한다(구멍)',
  ).toBe(true);
  const box = await card.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
});
