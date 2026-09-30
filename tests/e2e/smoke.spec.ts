// 읽기 조건: E2E 스모크를 고치거나, 셸/투두/카테고리의 접근 이름을 바꿔 이 테스트가 깨졌을 때.
//
// 핵심 사용자 흐름 하나를 **끝까지** 통과시킨다: 앱 열기 → 카테고리 생성 → 한글 투두 추가 →
// 체크(완료 블록으로 이동) → 편집 → 삭제(확인창) → 날짜 이동 → 새로고침 후 유지.
//
// 셀렉터는 전부 **역할(role) + 접근 이름**이다. 클래스·색·DOM 구조에 걸면 면·토큰·레이아웃을
// 바꾸는 다른 티켓이 이 테스트를 부수고, 반대로 **화면이 깨져도 통과하는** 느슨한 단언이 된다.
import { expect, test } from './fixtures/stub-login';
import { closeSidebarDrawer, createCategoryInDialog, openSidebarDrawer } from './sidebar';

import type { CDPSession, Locator, Page } from '@playwright/test';

/** 메모리 모드 배너 문구(`StorageFailureCard.MEMORY_MODE_BANNER_TEXT`). */
const MEMORY_MODE_TEXT = '지금 적는 내용은 새로고침하면 사라져요';

const CATEGORY = '공부';
const KEPT = '수학 문제 풀기';
const EDITED_FROM = '영어 단어 외우기';
const EDITED_TO = '영어 단어 30개';

/**
 * 셸이 실제로 마운트됐는지. `main#shell-main` 만 보면 HTML 셸만 떠도 통과하므로 **React 가 그린
 * 제목**까지 본다.
 */
async function waitForShell(page: Page): Promise<void> {
  await page.waitForSelector('main#shell-main');
  await expect(page.getByRole('heading', { name: 'Tasky', level: 1 })).toBeVisible();
  // 저장소가 죽어 메모리 구현으로 내려갔다면 "새로고침 후 유지" 는 애초에 성립하지 않는다.
  // 그 상태로 뒤 단계를 재면 "유지된다" 는 거짓 기록이 남는다.
  await expect(page.getByText(MEMORY_MODE_TEXT)).toHaveCount(0);
}

/** 조합 중 상태를 만든다(확정하지 않는다). */
async function startComposition(cdp: CDPSession, text: string): Promise<void> {
  await cdp.send('Input.imeSetComposition', {
    text,
    selectionStart: text.length,
    selectionEnd: text.length,
  });
}

/**
 * 조합 중 `Enter`. 한글에서 이 키는 **글자를 확정하는 키**이지 제출이 아니다(todo.md R4).
 * 조합기는 `keyCode 229` 로 알려 주고 `text: '\r'` 를 함께 보낸다 — `lib/ime.ts` 가 보는 두 신호 중
 * 하나다. Playwright 의 `keyboard.press('Enter')` 는 조합 중이면 `isComposing: true` 로 오므로
 * 나머지 한 갈래를 여기서 따로 재현한다.
 */
async function pressImeEnter(cdp: CDPSession): Promise<void> {
  const key = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 229 } as const;
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', text: '\r', ...key });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
}

/** 조합을 확정한다 — 조합 문자열이 최종 텍스트로 바뀐다. */
async function commitComposition(cdp: CDPSession, text: string): Promise<void> {
  await cdp.send('Input.insertText', { text });
}

/** 그룹 안에서 항목 메뉴를 열고 항목 하나를 고른다. */
async function runItemMenu(page: Page, group: Locator, title: string, item: string): Promise<void> {
  await group.getByRole('button', { name: title, exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

/**
 * 완료 구분선(`완료 N`)보다 **아래**에 있는가. 인덱스가 아니라 줄 텍스트로 재는 이유는
 * 체크 400ms 뒤에 목록이 재배치돼 인덱스가 갈리기 때문이다(todo.md R8). `expect.poll` 은
 * "한때 그랬다" 가 아니라 **최종 상태**가 조건을 만족할 때까지 다시 잰다.
 */
async function expectBelowDoneDivider(group: Locator, title: string): Promise<void> {
  await expect
    .poll(async () => {
      const rows = await group.getByRole('listitem').allInnerTexts();
      const divider = rows.findIndex((row) => /^완료 \d+/.test(row.trim()));
      const item = rows.findIndex((row) => row.includes(title));
      return divider >= 0 && item > divider;
    })
    .toBe(true);
}

test('앱을 열면 셸이 뜬다', async ({ page }) => {
  await page.goto('/');
  await waitForShell(page);
  await expect(page.getByRole('radiogroup', { name: '날짜 선택' })).toBeVisible();
});

test('한글 조합 중 Enter 는 항목을 만들지 않는다 (todo R4)', async ({ page, context }) => {
  await page.goto('/');
  await waitForShell(page);
  const drawer = await openSidebarDrawer(page);
  await createCategoryInDialog(page, CATEGORY);
  await closeSidebarDrawer(page, drawer);

  const group = page.getByRole('region', { name: CATEGORY });
  await group.getByRole('button', { name: '+ 할 일 추가' }).click();
  const input = page.getByRole('textbox', { name: `${CATEGORY}에 할 일 추가` });
  await expect(input).toBeFocused();

  const cdp = await context.newCDPSession(page);
  await startComposition(cdp, '공');
  await expect(input).toHaveValue('공');

  // 조합 중 Enter 두 갈래(`keyCode 229`, `isComposing`) 어느 쪽도 항목을 만들면 안 된다.
  await pressImeEnter(cdp);
  await page.keyboard.press('Enter');

  // 여기서 바로 `toHaveCount(0)` 을 재면 **아직 아무것도 그려지기 전이라 항상 0** 이다 — 가드를
  // 통째로 들어내도 통과하는 단언이 된다(실측). 그래서 **제출이 실제로 일어나는 지점까지 간 뒤**
  // 총량으로 잰다: 조합이 샜다면 "공" 한 글자짜리 항목이 이미 목록에 남아 있다.
  await commitComposition(cdp, KEPT);
  await page.keyboard.press('Enter');
  await expect(group.getByRole('checkbox', { name: KEPT })).toBeVisible();
  await expect(group.getByRole('checkbox')).toHaveCount(1);
  await expect(page.getByRole('complementary').getByRole('img')).toHaveAccessibleName(
    '오늘 달성률 0퍼센트, 1개 중 0개 완료',
  );
});

test('핵심 흐름: 카테고리 생성 → 한글 투두 → 체크 → 편집 → 삭제 → 날짜 이동 → 새로고침 유지', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await waitForShell(page);

  // 1. 카테고리 생성 — **드로어 경유**로(calendar-layout.md §1-A: 사이드바는 이제 모든 폭에서
  // 드로어가 기본이다. `nav` 는 열려 있는 동안만 DOM 에 있다).
  const drawer = await openSidebarDrawer(page);
  const sidebar = drawer.getByRole('navigation');
  const categorySection = sidebar.getByRole('region', { name: '카테고리' });
  // `before` 를 드로어가 뜬 직후 바로 재면 안 된다: 첫 실행 시드(category.md R18)가 카테고리 적재와
  // 별도의 비동기 단계라 사이드바가 잠깐 "아직 카테고리가 없어요" 로 그려졌다가 시드된 카테고리로
  // 바뀐다 — 그 사이에 `before` 를 읽으면 0을 얻고, 시드는 이미 반영된 뒤 `createCategory` 가 도니
  // 최종 개수는 2(시드 1 + 방금 만든 것)라 `before + 1`(=1) 과 어긋난다(실측: 시드에 지연을 주면
  // 결정적으로 "Expected: 1 Received: 2"). 시드가 항상 최소 1개를 만들므로(R18) **listitem 이
  // 하나라도 뜨는 것**을 기다린 뒤에야 `before` 가 안정적이다 — "+ 카테고리 추가" 라는 특정
  // 문구가 아니라 실제로 의미 있는 조건(시드 완료)에만 참이 되는 신호를 쓴다(역할 기반 대기,
  // `CategoryList.tsx` 는 `status === 'idle'` 프레임에서도 같은 문구의 버튼을 그릴 수 있어
  // 버튼 존재만으로는 "시드 완료" 를 보장하지 않는다).
  await expect(categorySection.getByRole('listitem')).not.toHaveCount(0);
  const before = await categorySection.getByRole('listitem').count();
  await createCategoryInDialog(page, CATEGORY);
  await expect(categorySection.getByRole('listitem')).toHaveCount(before + 1);
  // 확인이 끝났으니 드로어를 닫는다 — 뒤의 투두 조작은 선택 날짜 패널(`main`, 모든 폭에서 항상
  // 보인다) 안에서 이뤄지고 드로어가 열려 있을 필요가 없다.
  await closeSidebarDrawer(page, drawer);
  const group = page.getByRole('region', { name: CATEGORY });
  await expect(group.getByRole('heading', { name: CATEGORY, level: 2 })).toBeVisible();

  // 2. 한글로 투두 두 개 추가. 첫 개는 IME 조합 → 확정 → Enter 경로로 넣는다.
  await group.getByRole('button', { name: '+ 할 일 추가' }).click();
  const input = page.getByRole('textbox', { name: `${CATEGORY}에 할 일 추가` });
  await expect(input).toBeFocused();

  const cdp = await context.newCDPSession(page);
  await startComposition(cdp, '수');
  await pressImeEnter(cdp); // 조합 확정 키 — 여기서 제출되면 "수" 한 글자짜리 항목이 생긴다.
  await commitComposition(cdp, KEPT);
  await page.keyboard.press('Enter');
  await expect(group.getByRole('checkbox', { name: KEPT })).toBeVisible();
  await expect(group.getByRole('checkbox')).toHaveCount(1); // 조합 중 Enter 가 샜다면 2다.

  // 입력 행은 열린 채 남아 연속 입력이 된다(R3).
  await expect(input).toHaveValue('');
  await input.fill(EDITED_FROM);
  await page.keyboard.press('Enter');
  await expect(group.getByRole('checkbox', { name: EDITED_FROM })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(input).toHaveCount(0);

  const ring = page.getByRole('complementary').getByRole('img');
  await expect(ring).toHaveAccessibleName('오늘 달성률 0퍼센트, 2개 중 0개 완료');

  // 3. 체크 → 완료 블록 아래로 이동 + 달성률 갱신.
  const kept = group.getByRole('checkbox', { name: KEPT });
  await expect(group.getByRole('heading', { name: /^완료 \d+$/ })).toHaveCount(0);
  await kept.click();
  await expect(kept).toBeChecked();
  await expectBelowDoneDivider(group, KEPT);
  await expect(group.getByRole('heading', { name: '완료 1', level: 3 })).toBeVisible();
  await expect(ring).toHaveAccessibleName('오늘 달성률 50퍼센트, 2개 중 1개 완료');

  // 4. 편집 — 항목 메뉴 → 수정 → 제목 바꿔 저장.
  await runItemMenu(page, group, EDITED_FROM, '수정');
  const panel = page.getByRole('group', { name: `${EDITED_FROM} 편집` });
  await expect(panel).toBeVisible();
  await panel.getByRole('textbox', { name: '제목' }).fill(EDITED_TO);
  await panel.getByRole('button', { name: '저장' }).click();
  await expect(panel).toHaveCount(0);
  await expect(group.getByRole('checkbox', { name: EDITED_TO })).toBeVisible();
  await expect(group.getByRole('checkbox', { name: EDITED_FROM })).toHaveCount(0);
  await expect(group.getByRole('checkbox', { name: EDITED_TO })).not.toBeChecked();

  // 5. 삭제 — 확인창이 반드시 뜨고, [취소]로는 지워지지 않는다.
  await runItemMenu(page, group, EDITED_TO, '삭제');
  const confirm = page.getByRole('alertdialog', { name: `'${EDITED_TO}'를 삭제할까요?` });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: '취소' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(group.getByRole('checkbox', { name: EDITED_TO })).toBeVisible();

  await runItemMenu(page, group, EDITED_TO, '삭제');
  await page
    .getByRole('alertdialog', { name: `'${EDITED_TO}'를 삭제할까요?` })
    .getByRole('button', { name: '삭제' })
    .click();
  await expect(group.getByRole('checkbox', { name: EDITED_TO })).toHaveCount(0);
  await expect(ring).toHaveAccessibleName('오늘 달성률 100퍼센트, 1개 중 1개 완료');

  // 6. 날짜 이동 — 다른 날은 비어 있고, 오늘로 돌아오면 그대로다.
  const today = page.getByRole('button', { name: '오늘로 이동' });
  await expect(today).toBeDisabled();
  await page
    .getByRole('radiogroup', { name: '날짜 선택' })
    .getByRole('radio', { checked: false })
    .first()
    .click();
  await expect(today).toBeEnabled();
  await expect(group.getByRole('checkbox')).toHaveCount(0);
  await expect(group.getByRole('button', { name: '+ 할 일 추가' })).toBeVisible();
  await expect(group.getByRole('listitem')).toHaveCount(1);

  await today.click();
  await expect(today).toBeDisabled();
  await expect(group.getByRole('checkbox', { name: KEPT })).toBeChecked();

  // 7. 새로고침 후 유지 — 카테고리도 투두도 완료 상태도 살아 있어야 한다.
  await page.reload();
  await waitForShell(page);
  // 드로어는 세션 안에서만 열림 상태를 갖는다(새로고침으로 리셋된다) — 사이드바 행을 다시 보려면
  // 한 번 더 연다. 접근 이름에는 달성 수가 붙는다("공부 1/1") — `⋯` 버튼 쪽이 이름이 고정이라 그걸 본다.
  const reopenedDrawer = await openSidebarDrawer(page);
  await expect(
    reopenedDrawer.getByRole('navigation').getByRole('button', { name: `${CATEGORY} 메뉴` }),
  ).toBeVisible();
  await closeSidebarDrawer(page, reopenedDrawer);
  await expect(group.getByRole('checkbox', { name: KEPT })).toBeChecked();
  await expectBelowDoneDivider(group, KEPT);
  await expect(ring).toHaveAccessibleName('오늘 달성률 100퍼센트, 1개 중 1개 완료');

  expect(errors).toEqual([]);
});
