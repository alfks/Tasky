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
import { expect, test } from './fixtures/stub-login';
import { createCategory } from './sidebar';

import type { Locator, Page } from '@playwright/test';

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
    for (const name of ['사이드바 열기', '오늘 요약 열기']) {
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

/**
 * 같은 카테고리에 연속으로 여러 개를 적을 때 쓴다 — 입력 행이 열린 채 남는다(todo R3)는 것을
 * 전제로, 이미 열려 있으면 "+ 할 일 추가" 를 다시 누르지 않는다(눌러도 응답이 없어 타임아웃 난다).
 */
async function addTodoContinuing(page: Page, categoryName: string, title: string): Promise<void> {
  const group = page.getByRole('region', { name: categoryName });
  const input = page.getByRole('textbox', { name: `${categoryName}에 할 일 추가` });
  if ((await input.count()) === 0) {
    await group.getByRole('button', { name: '+ 할 일 추가' }).click();
  }
  await input.fill(title);
  await page.keyboard.press('Enter');
  await expect(group.getByRole('checkbox', { name: title })).toBeVisible();
}

/** `locator` 의 화면 중심을 `document.elementFromPoint` 로 찍어, 그 지점을 실제로 차지한 것이
 * `locator` 자신(또는 그 후손)인지 본다 — 접근성 트리·`boundingBox()` 는 가려짐을 모른다
 * (routine-manager-menu.spec.ts 의 같은 기법). Playwright 의 `click()` 은 실패 시 자동으로
 * 대상을 스크롤해 넣어 주므로(actionability), 그 보정 없이 **지금 화면에 그려진 자리**를 그대로
 * 잰다 — 실제 손가락 탭에는 그 보정이 없다.
 */
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

/**
 * 카테고리 2개·할 일 9개를 만들고 배너를 닫는다 — 리뷰 Major 재현 조건 그대로(360px 은 호출부가
 * 뷰포트로 정한다). 마지막 카테고리("공부")의 마지막 할 일("공부 4")이 이 테스트가 재는 대상이다.
 */
async function buildNineTodos(page: Page): Promise<void> {
  const dismissBanner = page.getByRole('button', { name: '저장 공간 알림 닫기' });
  if ((await dismissBanner.count()) > 0) await dismissBanner.click();

  await createCategory(page, '공부');

  for (let i = 1; i <= 5; i++) await addTodoContinuing(page, SEEDED_CATEGORY, `할 일 ${i}`);
  await page.keyboard.press('Escape'); // 다음 카테고리로 넘어가려면 입력 행부터 닫아야 한다.
  for (let i = 1; i <= 4; i++) await addTodoContinuing(page, '공부', `공부 ${i}`);
  await page.keyboard.press('Escape');
}

test('마지막 할 일 행이 하단 [+ 할 일] 막대에 가리지 않는다(리뷰 Major — elementFromPoint 실측)', async ({
  page,
}) => {
  const WIDTH = 360;
  await page.setViewportSize({ width: WIDTH, height: 900 });
  await page.goto('/');
  await waitForShell(page);
  await buildNineTodos(page);

  const lastGroup = page.getByRole('region', { name: '공부' });
  const lastCheckbox = lastGroup.getByRole('checkbox', { name: '공부 4' });
  const lastHandle = lastGroup.getByRole('button', { name: '공부 4 순서 변경 (Alt+위/아래)' });
  const lastMenu = lastGroup.getByRole('button', { name: '공부 4', exact: true });

  // 사용자가 마지막 행을 읽으려고 손가락으로 끝까지 내린 자리 — Playwright 의 `click()` 이 하는
  // 자동 스크롤 보정과 같은 지점이다(주석 위 `isOnTop`). 이 지점에서조차 막대에 가린다면 막대
  // 아래로는 영원히 닿을 수 없는 사각지대가 있다는 뜻이다.
  await lastCheckbox.scrollIntoViewIfNeeded();
  expect(await isOnTop(lastCheckbox), '마지막 행 체크박스가 하단 막대에 가려 있다').toBe(true);
  expect(await isOnTop(lastHandle), '마지막 행 손잡이가 하단 막대에 가려 있다').toBe(true);
  expect(await isOnTop(lastMenu), '마지막 행 메뉴가 하단 막대에 가려 있다').toBe(true);

  // 다음 번에도 마지막 행은 스크롤로 온전히 닿아야 한다.
  await page.reload();
  await waitForShell(page);
  await lastCheckbox.scrollIntoViewIfNeeded();
  expect(await isOnTop(lastCheckbox)).toBe(true);
});

for (const [width, height] of [
  [375, 667],
  [390, 844],
] as const) {
  test(`${width}×${height} 첫 화면에 프로필·달력이 보이고(프로필이 남는 높이를 채운다) 아래로 내리면 할 일이 나온다`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await waitForShell(page);

    const profile = page.getByRole('region', { name: '프로필', exact: true });
    const calendar = page.getByRole('grid', { name: '날짜 선택' });
    const todo = page.getByRole('region', { name: SEEDED_CATEGORY });
    await expect(profile).toBeVisible();
    await expect(calendar).toBeVisible();
    // 하단 [+ 할 일] 막대가 선 뒤의 레이아웃을 잰다 — 첫 화면이 스크롤 영역 높이를 채우므로 막대가
    // 서기 전후로 박스가 다르다(split-viewport.spec 679px 와 같은 이유).
    await expect(page.getByRole('button', { name: '+ 할 일', exact: true })).toBeVisible();
    const profileBox = await profile.boundingBox();
    const calendarBox = await calendar.boundingBox();
    const todoBox = await todo.boundingBox();
    expect(profileBox).not.toBeNull();
    expect(calendarBox).not.toBeNull();
    expect(todoBox).not.toBeNull();
    expect(profileBox!.y + profileBox!.height).toBeLessThan(calendarBox!.y);
    expect(calendarBox!.y + calendarBox!.height).toBeLessThan(height);
    expect(todoBox!.y).toBeGreaterThanOrEqual(height - 90);
    // 프로필은 하한(--profile-card-min-h, 112) 이상이고 달력을 뺀 남는 높이를 채운다 — 달력 아래에
    // 빈 띠가 남지 않는다(calendar-layout.md R9, profile.md R9-a). 56 = 헤더 아래 여백 12 + 목록 위
    // 여백 12 + 첫 그룹 위 여백(실측 51.5) 에 반올림 여유 — 프로필이 채우지 않으면 수백 px 가 된다.
    expect(profileBox!.height, '프로필 카드가 하한보다 낮다').toBeGreaterThanOrEqual(112);
    expect(
      todoBox!.y - (calendarBox!.y + calendarBox!.height),
      '달력 아래에 빈 띠가 남았다 — 프로필이 남는 높이를 채우지 않는다',
    ).toBeLessThanOrEqual(56);

    await todo.scrollIntoViewIfNeeded();
    await expect(todo.getByRole('button', { name: '+ 할 일 추가' })).toBeVisible();
    const boxAfter = await todo.boundingBox();
    expect(boxAfter!.y).toBeLessThan(height);
  });
}
