// 읽기 조건: 사이드바 카테고리 순서 변경(category R5)을 고치거나, 손잡이의 접근 이름을 바꿔 이
// 테스트가 깨졌을 때.
//
// **실제 마우스 드래그는 여기서만 검사된다.** jsdom 에는 레이아웃도 `DataTransfer` 도 없어서
// 단위 테스트(`CategoryList.dnd.test.tsx`)가 재는 것은 "드롭이 어떤 좌표로 스토어에 닿는가" 까지다.
// 앞/뒤 판정이 실제 행 높이 위에서 갈리는지는 브라우저에서만 드러난다.
//
// 순서가 저장까지 갔는지는 **새로고침 뒤**에 잰다 — 화면만 보면 낙관적 갱신이 저장 실패를 가린다.
import { expect, test } from './fixtures/stub-login';

import type { Locator, Page } from '@playwright/test';

/** 메모리 모드 배너 문구(`StorageFailureCard.MEMORY_MODE_BANNER_TEXT`). */
const MEMORY_MODE_TEXT = '지금 적는 내용은 새로고침하면 사라져요';

async function waitForShell(page: Page): Promise<void> {
  await page.waitForSelector('main#shell-main');
  await expect(page.getByRole('heading', { name: 'Tasky', level: 1 })).toBeVisible();
  // 메모리 구현으로 내려간 상태에서 "새로고침해도 남는다" 를 재면 거짓 기록이 된다.
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

/** 사이드바 행의 드래그 손잡이. 드래그는 여기서만 시작한다(R5). */
function handle(page: Page, name: string): Locator {
  return page
    .getByRole('region', { name: '카테고리', exact: true })
    .getByRole('button', { name: `${name} 순서 변경 (Alt+위/아래)` });
}

/**
 * 사이드바 활성 목록의 이름을 화면 순서대로. 손잡이의 접근 이름에서 뽑는다 — 행 본체의 글자에는
 * `n/m` 개수가 붙어 이름만 비교할 수 없다.
 */
async function names(page: Page): Promise<string[]> {
  return page
    .getByRole('region', { name: '카테고리', exact: true })
    .getByRole('button', { name: /순서 변경 \(Alt\+위\/아래\)$/ })
    .evaluateAll((buttons) =>
      buttons.map((button) =>
        (button.getAttribute('aria-label') ?? '').replace(/ 순서 변경.*$/u, ''),
      ),
    );
}

/** 첫 실행 시드(R18) 하나 위에 둘을 더 만들어 셋으로 시작한다. */
async function setup(page: Page): Promise<string[]> {
  await page.goto('/');
  await waitForShell(page);
  await createCategory(page, '공부');
  await createCategory(page, '운동');
  return names(page);
}

test('행을 아래로 끌어 놓으면 순서가 바뀌고 새로고침해도 남는다', async ({ page }) => {
  const [첫째, 둘째, 셋째] = await setup(page);

  // 마지막 행의 **아래쪽**에 떨어뜨린다. 정중앙은 중간점과 같은 값이라 앞/뒤 판정이 반올림에 걸린다.
  await handle(page, 첫째).dragTo(handle(page, 셋째), { targetPosition: { x: 8, y: 30 } });

  await expect.poll(async () => names(page)).toEqual([둘째, 셋째, 첫째]);

  await page.reload();
  await waitForShell(page);
  await expect.poll(async () => names(page)).toEqual([둘째, 셋째, 첫째]);
});

test('행을 위로 끌어 놓으면 그 앞에 꽂힌다', async ({ page }) => {
  const [첫째, 둘째, 셋째] = await setup(page);

  await handle(page, 셋째).dragTo(handle(page, 첫째), { targetPosition: { x: 8, y: 2 } });

  await expect.poll(async () => names(page)).toEqual([셋째, 첫째, 둘째]);
});

test('키보드 `Alt+↓` 도 같은 순서 변경을 하고 결과를 낭독한다 (§5)', async ({ page }) => {
  const [첫째, 둘째, 셋째] = await setup(page);

  await handle(page, 첫째).focus();
  await page.keyboard.press('Alt+ArrowDown');

  await expect.poll(async () => names(page)).toEqual([둘째, 첫째, 셋째]);
  // 토스트 허브도 `role=status` 라 사이드바 안으로 좁힌다.
  await expect(
    page.getByRole('region', { name: '카테고리', exact: true }).getByRole('status'),
  ).toContainText(`${첫째} 을(를) 2번째로 옮겼어요`);
});
