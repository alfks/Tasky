// 읽기 조건: 호버 면(`--color-surface-2`)이나 포커스 링(`--color-focus`)을 건드릴 때,
// 또는 이 스펙이 빨간불일 때.
//
// 왜 e2e 인가: 호버와 포커스 링은 **계산된 CSS 로만 존재한다**. jsdom 은 CSS 를 계산하지
// 않으므로 단위 테스트가 잴 수 있는 것은 클래스 문자열뿐인데, 그 단언은 클래스가 남아 있는
// 채로 뒤 규칙에 덮이면 그대로 초록불이다(T-61 음성 대조 NC-3 에서 실측 — `hover:bg-transparent`
// 를 덧붙여 호버를 죽여도 클래스 문자열 테스트는 통과했다). 선택 링에서도 같은 일이 있었다
// (`selection-ring.spec.ts` 머리말, T-46·T-57).
//
// 재는 것은 셋이다.
//  1. 호버 면이 **있다** — 쉬고 있을 때와 호버일 때의 계산된 배경색이 다르고, 호버 쪽이
//     `--color-surface-2` 다.
//  2. 그 면이 **앱의 언어와 같다** — 같은 화면의 다른 클릭 대상(`+ 할 일 추가`)이 호버에서
//     쓰는 색과 **같은 값**이어야 한다. 토큰만 재면 "이 컴포넌트만 예쁜" 회귀를 못 잡는다.
//  3. 호버는 **포인터에서만** — `(hover: none)` 컨텍스트에서는 면이 뜨지 않는다(터치에서
//     호버가 눌어붙지 않게). Tailwind 4 가 `hover:` 를 `@media (hover:hover)` 로 감싸 주는
//     기본 동작에 기대고 있으므로, 그 기대가 깨지면 여기서 잡힌다.
//
// 포커스 링은 **다른 버튼의 링과 같은지**로 잰다. "윤곽선이 있다" 만 재면 브라우저 기본 링
// (`outline-style: auto`)으로 떨어진 상태도 통과한다 — 그것이 정확히 고치려던 결함이다.
//
// 셀렉터는 `tests/AGENTS.md` 규칙대로 역할 + 접근 이름만 쓴다.
import { expect, test } from '@playwright/test';

import type { Locator, Page } from '@playwright/test';

/** `StorageFailureCard.MEMORY_MODE_BANNER_TEXT`. 메모리 모드면 화면 구성이 달라진다. */
const MEMORY_MODE_TEXT = '지금 적는 내용은 새로고침하면 사라져요';

const CATEGORY = '공부';
const TITLE = '장보기';

type Ring = { style: string; width: string; offset: string; color: string };

async function waitForShell(page: Page): Promise<void> {
  await page.waitForSelector('main#shell-main');
  await expect(page.getByRole('heading', { name: 'Tasky', level: 1 })).toBeVisible();
  await expect(page.getByText(MEMORY_MODE_TEXT)).toHaveCount(0);
}

/**
 * 토큰을 **런타임에 해석된 색**으로 읽는다(`selection-ring.spec.ts` 와 같은 수법 — 사용자 지정
 * 속성의 계산값은 `#f3f3f7` 처럼 적힌 그대로라 `rgb()` 문자열과 바로 비교할 수 없다).
 */
function resolveColor(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement('span');
    probe.style.cssText = `position:absolute;visibility:hidden;color:var(${name})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, token);
}

function backgroundOf(target: Locator): Promise<string> {
  return target.evaluate((element) => getComputedStyle(element).backgroundColor);
}

function ringOf(target: Locator): Promise<Ring> {
  return target.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      style: style.outlineStyle,
      width: style.outlineWidth,
      offset: style.outlineOffset,
      color: style.outlineColor,
    };
  });
}

/** 데이터는 UI 경로로만 만든다(`tests/AGENTS.md` 규칙 3). */
async function seedTodo(page: Page): Promise<void> {
  await page.getByRole('button', { name: '+ 카테고리 추가' }).click();
  const dialog = page.getByRole('dialog', { name: '카테고리 만들기' });
  await dialog.getByRole('textbox', { name: /이름/ }).fill(CATEGORY);
  await dialog.getByRole('button', { name: '만들기' }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByRole('button', { name: '+ 할 일 추가' }).first().click();
  const input = page.getByRole('textbox', { name: /할 일/ }).first();
  await input.fill(TITLE);
  await input.press('Enter');
  await expect(page.getByRole('button', { name: TITLE, exact: true })).toBeVisible();
}

/** 투두 행(`li`). 행 자체에는 역할 이름이 없어 제목 버튼에서 한 칸 올라간다. */
function todoRow(page: Page): Locator {
  return page
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: TITLE, exact: true }) });
}

test.describe('호버 면은 앱의 언어를 따른다 (theme.md §3 `--color-surface-2`)', () => {
  test.use({ colorScheme: 'light' });

  test('투두 행: 쉬고 있을 때와 호버가 다르고, 호버가 `--color-surface-2` 다', async ({ page }) => {
    await page.goto('/');
    await waitForShell(page);
    await seedTodo(page);

    const row = todoRow(page);
    const surface2 = await resolveColor(page, '--color-surface-2');
    const rest = await backgroundOf(row);
    // 쉬고 있을 때 이미 그 색이면 아래 단언은 호버를 재지 못한다(늘 참).
    expect(rest).not.toBe(surface2);

    await row.hover();
    await expect.poll(async () => backgroundOf(row)).toBe(surface2);
  });

  test('투두 제목 버튼: 호버하면 같은 면색이 된다', async ({ page }) => {
    await page.goto('/');
    await waitForShell(page);
    await seedTodo(page);

    const title = page.getByRole('button', { name: TITLE, exact: true });
    expect(await backgroundOf(title)).toBe('rgba(0, 0, 0, 0)');

    await title.hover();
    await expect
      .poll(async () => backgroundOf(title))
      .toBe(await resolveColor(page, '--color-surface-2'));
  });

  test('투두 행의 호버 색 = 같은 화면 다른 클릭 대상의 호버 색', async ({ page }) => {
    await page.goto('/');
    await waitForShell(page);
    await seedTodo(page);

    // 기준은 토큰이 아니라 **이미 쓰이고 있는 컨트롤**이다 — 이 행만 따로 노는 것을 잡는다.
    const reference = page.getByRole('button', { name: '+ 할 일 추가' }).first();
    await reference.hover();
    const referenceHover = await backgroundOf(reference);
    expect(referenceHover).not.toBe('rgba(0, 0, 0, 0)');

    const row = todoRow(page);
    await row.hover();
    await expect.poll(async () => backgroundOf(row)).toBe(referenceHover);
  });
});

test.describe('다크에서도 같은 토큰을 쓴다', () => {
  test.use({ colorScheme: 'dark' });

  test('투두 행 호버가 다크의 `--color-surface-2` 다', async ({ page }) => {
    await page.goto('/');
    await waitForShell(page);
    await seedTodo(page);

    const surface2 = await resolveColor(page, '--color-surface-2');
    // 라이트 값(#f3f3f7)이 그대로 나오면 토큰을 안 타고 하드코딩한 것이다.
    expect(surface2).not.toBe('rgb(243, 243, 247)');

    const row = todoRow(page);
    await row.hover();
    await expect.poll(async () => backgroundOf(row)).toBe(surface2);
  });
});

// 터치에서 호버가 눌어붙으면 한 번 누른 행이 계속 떠 있는 것처럼 보인다. Tailwind 4 의
// `hover:` 는 기본으로 `@media (hover:hover)` 안에 들어가므로 우리가 미디어 쿼리를 손으로
// 한 겹 더 쓰지 않는다 — 대신 그 기본값이 유지되는지를 여기서 잰다.
test.describe('호버는 포인터가 있을 때만 (`(hover: none)` 에서는 면이 없다)', () => {
  test.use({ colorScheme: 'light', hasTouch: true });

  test('터치 컨텍스트에서는 행에 호버 면이 뜨지 않는다', async ({ page }) => {
    await page.goto('/');
    await waitForShell(page);
    // 이 컨텍스트가 정말 `(hover: none)` 인지 먼저 확인한다 — 아니면 아래 단언은 아무것도
    // 재지 않는 채로 늘 통과한다(tests/AGENTS.md 규칙 2 가 경고하는 "항상 참" 단언).
    expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true);
    await seedTodo(page);

    const row = todoRow(page);
    const rest = await backgroundOf(row);
    await row.hover();
    // 포인터가 없는 환경이라 호버 규칙 자체가 적용되지 않아야 한다.
    expect(await backgroundOf(row)).toBe(rest);
    expect(await backgroundOf(row)).not.toBe(await resolveColor(page, '--color-surface-2'));
  });
});

test.describe('포커스 링은 앱의 링 하나뿐이다 (theme.md §5)', () => {
  test.use({ colorScheme: 'light' });

  test('백업/복원 버튼의 링이 같은 화면 다른 버튼의 링과 같다', async ({ page }) => {
    await page.goto('/');
    await waitForShell(page);

    const focusColor = await resolveColor(page, '--color-focus');

    // 기준 버튼: 공용 `Button`(`--color-focus` 2px + 오프셋 2px)을 쓰는 사이드바의 이웃.
    //
    // **폴링하는 이유**: `Button` 에는 `transition-colors` 가 걸려 있고 Tailwind 4 의
    // `transition-colors` 는 `outline-color` 까지 함께 전이시킨다 — 포커스 직후에 읽으면
    // 전이 중간값(currentColor 쪽)이 잡힌다(FEEL_REPORT §8 #10 이 적은 현상이 이것이다).
    const reference = page.getByRole('button', { name: '+ 카테고리 추가' });
    await reference.focus();
    await expect.poll(async () => (await ringOf(reference)).color).toBe(focusColor);
    const referenceRing = await ringOf(reference);

    const backup = page.getByRole('button', { name: /백업\/복원/ });
    await backup.focus();
    await expect.poll(async () => (await ringOf(backup)).color).toBe(focusColor);
    const ring = await ringOf(backup);

    // 브라우저 기본 링은 `outline-style: auto` 로 떨어진다 — 그 상태가 정확히 T-61 이전이다.
    expect(ring.style).not.toBe('auto');
    expect(ring).toEqual(referenceRing);
    expect(ring.width).toBe('2px');
    expect(ring.offset).toBe('2px');
  });
});
