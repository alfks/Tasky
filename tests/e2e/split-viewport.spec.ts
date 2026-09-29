// 읽기 조건: 2영역(달력 컬럼 + 선택 날짜 패널)의 하한 폭·컬럼 치수·가운데 정렬(calendar-layout.md
// R2·R8·R10, app-shell.md R4)을 고칠 때.
//
// 재는 것은 사용자 피드백 두 건이다 — (1) **창을 흔한 모니터의 반쪽(683·720·768·960)으로 줄여도
// 달력은 왼쪽, 할 일은 오른쪽에 그대로 있다**(2영역 하한 680), (6) **달력과 할 일 보드가 한 쌍으로
// 가운데 온다**(넓은 화면에서 duo 의 좌우 여백이 같다). 둘 다 jsdom 이 못 잰다 — 레이아웃을 계산하지
// 않으므로 `min-w`/`max-w`/`justify-center` 가 실제로 무엇을 그리는지는 실제 박스로만 보인다.
//
// 셀렉터는 전부 역할 + 접근 이름이다. 달력 컬럼 자체에는 역할이 없으므로 그 안의 **첫 요소**(☰
// `카테고리 열기` — 헤더 줄의 맨 왼쪽, 컬럼에 좌우 padding 이 없다)와 스트립(`radiogroup "날짜
// 선택"`)의 박스로 컬럼의 왼쪽 가장자리·격자 위치를 읽는다.
import { expect, test } from './fixtures/stub-login';
import { openSidebarDrawer } from './sidebar';

import type { Page } from '@playwright/test';

async function waitForShell(page: Page): Promise<void> {
  await page.waitForSelector('main#shell-main');
  await expect(page.getByRole('heading', { name: 'Tasky', level: 1 })).toBeVisible();
}

async function documentFitsViewport(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(overflow.scrollWidth, `${label} 에서 문서가 뷰포트보다 넓다`).toBeLessThanOrEqual(
    overflow.innerWidth,
  );
}

async function box(page: Page, role: 'main' | 'radiogroup', name?: string) {
  const locator =
    name === undefined ? page.getByRole(role) : page.getByRole(role, { name, exact: true });
  const rect = await locator.boundingBox();
  expect(rect, `${role}${name === undefined ? '' : ` "${name}"`} 의 박스가 없다`).not.toBeNull();
  return rect!;
}

/** 흔한 모니터의 반쪽 — 1440 의 720, 1920 의 960. 둘 다 2영역이어야 한다(calendar-layout.md R10). */
for (const width of [720, 960] as const) {
  test(`${width}px(반쪽 창)에서도 달력이 왼쪽, 할 일 패널이 오른쪽에 나란히 선다`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await waitForShell(page);

    const strip = await box(page, 'radiogroup', '날짜 선택');
    const main = await box(page, 'main');
    // 나란히: 스트립의 오른쪽 끝이 패널의 왼쪽보다 왼쪽에 있다(1열이면 패널이 스트립 **아래**라
    // x 범위가 겹친다). 세로로도 같은 줄에서 시작해야 "옆 패널" 이다.
    expect(strip.x + strip.width, `${width}px 에서 스트립이 패널과 겹친다`).toBeLessThan(main.x);
    expect(main.y, `${width}px 에서 패널이 스트립 아래로 내려갔다`).toBeLessThan(
      strip.y + strip.height,
    );
    // 패널은 할 일 한 줄(손잡이·체크·제목·⋯)이 접히지 않는 하한(280) 아래로 내려가지 않는다(R2).
    expect(main.width, `${width}px 에서 패널이 너무 좁다`).toBeGreaterThanOrEqual(280);
    await documentFitsViewport(page, `${width}px`);
    // 1열의 하단 고정 버튼은 없다 — 2영역의 증거 하나 더.
    await expect(page.getByRole('button', { name: '+ 할 일', exact: true })).toHaveCount(0);
  });
}

test('1440px 에서 달력 컬럼과 할 일 패널이 한 쌍으로 가운데 온다 — 좌우 여백 차 ≤ 8px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await waitForShell(page);

  // 달력 컬럼의 왼쪽 가장자리 = 헤더 줄 첫 요소(☰)의 왼쪽. 패널의 오른쪽 = `main` 의 오른쪽.
  const menu = await page.getByRole('button', { name: '카테고리 열기' }).boundingBox();
  expect(menu).not.toBeNull();
  const main = await box(page, 'main');
  const left = menu!.x;
  const right = 1440 - (main.x + main.width);
  expect(Math.abs(left - right), `왼쪽 ${left} / 오른쪽 ${right}`).toBeLessThanOrEqual(8);

  // 달력 잉크(스트립 격자)도 자기 컬럼 안에서 떠 있지 않다 — 격자와 컬럼의 왼쪽 차가 컬럼 상한
  // (440)과 격자(372)의 차의 절반(34) 안이다. 옛 560 컬럼에서는 이 값이 94 였다(FEEL_REPORT §14).
  const strip = await box(page, 'radiogroup', '날짜 선택');
  expect(strip.x - left, '달력 격자가 컬럼 안에서 따로 떠 있다').toBeLessThanOrEqual(40);
  await documentFitsViewport(page, '1440px');
});

test('679px 에서는 1열이다 — 패널이 스트립 아래로 내려가고 하단 [+ 할 일] 이 붙는다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 679, height: 900 });
  await page.goto('/');
  await waitForShell(page);

  const strip = await box(page, 'radiogroup', '날짜 선택');
  // 1열의 `main` 은 `ShellMain` — 스트립을 **안에** 품는다. 그래서 "아래" 는 `main` 의 y 가 아니라
  // 목록 영역(첫 그룹 `region`)의 y 로 잰다.
  const group = await page.getByRole('region', { name: 'todo' }).boundingBox();
  expect(group).not.toBeNull();
  expect(group!.y, '679px 에서 목록이 스트립 옆에 있다').toBeGreaterThanOrEqual(
    strip.y + strip.height,
  );
  await expect(page.getByRole('button', { name: '+ 할 일', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '오늘 요약 열기' })).toBeVisible();
  await documentFitsViewport(page, '679px');
});

test('1280px 에서 사이드바를 고정해도 가로 스크롤이 없다 (app-shell.md R4)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await waitForShell(page);

  const drawer = await openSidebarDrawer(page);
  await drawer.getByRole('button', { name: '사이드바 고정' }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: '카테고리' })).toBeVisible();

  const strip = await box(page, 'radiogroup', '날짜 선택');
  const main = await box(page, 'main');
  expect(strip.x + strip.width, '고정 컬럼이 서자 2영역이 무너졌다').toBeLessThan(main.x);
  await documentFitsViewport(page, '1280px + 사이드바 고정');
});
