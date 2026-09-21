// 읽기 조건: 앱 셸의 최소 폭(app-shell.md R11)이나 헤더 한 줄(`ShellHeader`)을 고칠 때.
//
// 재는 것은 하나다: **휴대폰 폭에서 가로 스크롤이 생기지 않는가.** 셸의 `min-w` 가 400px 이던
// 시절에는 실기기 대부분이 그 아래였다 — 360(안드로이드 다수)·375(iPhone SE·mini)·390
// (iPhone 12~16). 홈 화면에 설치해 열면 주소창이 없어 이 어긋남이 그대로 드러난다.
//
// jsdom 단위 테스트로는 못 잡는다(레이아웃을 계산하지 않는다). 클래스 문자열 단정도 아니다 —
// `min-w-[360px]` 이 그대로여도 헤더에 버튼 하나만 더 들어오면 다시 넘친다(ShellHeader 의
// `min-w-0` 주석: 400px 에서 이미 388px 로 빠듯했다). 그래서 **실제 박스**를 잰다.
//
// 헤더를 가장 빡빡한 상태로 만들어 두고 잰다: ☰ · 팔레트 입구 · **타이머 칩** · 달성률 넷이
// 한 줄에 있는 상태(app-shell R15). 칩이 없으면 제일 잘 넘치는 경우를 비켜 가게 된다.
import { expect, test } from '@playwright/test';

import type { Page } from '@playwright/test';

/** 첫 실행 시드가 만드는 카테고리(domain `SEED_CATEGORY`). UI 경로만 쓰기 위한 발판이다. */
const SEEDED_CATEGORY = 'todo';

/** 실기기 CSS 폭. 360=안드로이드 다수, 375=iPhone SE·mini, 390=iPhone 12~16. */
const PHONE_WIDTHS = [360, 375, 390] as const;

async function waitForShell(page: Page): Promise<void> {
  await page.waitForSelector('main#shell-main');
  await expect(page.getByRole('heading', { name: 'Tasky', level: 1 })).toBeVisible();
}

async function addTodo(page: Page, categoryName: string, title: string): Promise<void> {
  const group = page.getByRole('region', { name: categoryName });
  await group.getByRole('button', { name: '+ 할 일 추가' }).click();
  const input = page.getByRole('textbox', { name: `${categoryName}에 할 일 추가` });
  await input.fill(title);
  await page.keyboard.press('Enter');
  await expect(group.getByRole('checkbox', { name: title })).toBeVisible();
}

/** 팔레트로 타이머를 켠다 — 좁은 폭에서 패널은 오버레이라, 칩을 띄우는 가장 짧은 경로다. */
async function startTimer(page: Page): Promise<void> {
  await page.keyboard.press('Control+k');
  const list = page.getByRole('listbox', { name: '명령과 할 일' });
  await expect(list.getByRole('option').first()).toBeVisible();
  await list.getByRole('option', { name: '타이머 시작' }).click();
  await expect(page.getByRole('button', { name: /집중 타이머/ })).toBeVisible();
}

test('휴대폰 폭(360·375·390)에서 가로 스크롤이 생기지 않는다(app-shell.md R11)', async ({
  page,
}) => {
  await page.setViewportSize({ width: PHONE_WIDTHS[0], height: 740 });
  await page.goto('/');
  await waitForShell(page);

  // 긴 제목은 줄여서라도 담아야 한다 — 늘어나서 줄을 밀어내면 안 된다(헤더 칩의 `truncate`).
  await addTodo(page, SEEDED_CATEGORY, '아주 긴 제목의 할 일 하나를 적어 본다 정말로 길게');
  await startTimer(page);

  for (const width of PHONE_WIDTHS) {
    await page.setViewportSize({ width, height: 740 });

    // 칩이 실제로 헤더에 있는 상태에서 재는지 매 폭마다 확인한다 — 사라졌다면 이 테스트는
    // 제일 빡빡한 경우를 재지 못한 것이고, 그건 통과가 아니라 결함이다.
    await expect(page.getByRole('button', { name: /집중 타이머/ })).toBeVisible();

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(overflow.scrollWidth, `${width}px 에서 문서가 뷰포트보다 넓다`).toBeLessThanOrEqual(
      overflow.innerWidth,
    );

    // 넘칠 때 제일 먼저 화면 밖으로 밀리는 둘(ShellHeader 주석의 실측 경로)을 따로 못 박는다.
    // 문서 폭만 보면 `overflow:hidden` 을 어딘가에 씌워도 초록불이 되지만, 그건 버튼이 잘린 것이다.
    for (const name of ['카테고리 열기', '오늘 요약 열기']) {
      const box = await page.getByRole('button', { name }).boundingBox();
      expect(box, `${width}px 에서 "${name}" 버튼이 없다`).not.toBeNull();
      expect(box!.x, `${width}px 에서 "${name}" 버튼의 왼쪽`).toBeGreaterThanOrEqual(0);
      expect(
        box!.x + box!.width,
        `${width}px 에서 "${name}" 버튼의 오른쪽이 화면 밖이다`,
      ).toBeLessThanOrEqual(overflow.innerWidth);
    }
  }
});
