import { expect, test } from '@playwright/test';

import { stubLogin } from './fixtures/stub-login';
import { closeSidebarDrawer, openSidebarDrawer } from './sidebar';
import {
  completedRecord,
  joinSocial,
  openAudience,
  openSocial,
  setAudience,
  shareRecord,
  socialAccount,
} from './social';

test.describe('카테고리 공개 범위', () => {
  test.skip(process.env.TASKY_E2E_SOCIAL !== '1', 'enabled 전용 공개 범위 통합');
  test('모두 공개 확인 → 익명 사본 읽기 → 나만 보기 회수 → 다시 공개', async ({
    browser,
  }, testInfo) => {
    const owner = await browser.newContext();
    const anonymous = await browser.newContext();
    const page = await owner.newPage();
    const publicPage = await anonymous.newPage();
    await stubLogin(page, socialAccount('public'));
    const category = `공개 독서 ${crypto.randomUUID().slice(0, 6)}`;
    const text = `책 한 권 읽었어요 ${crypto.randomUUID().slice(0, 6)}`;
    await completedRecord(page, category, text);
    await joinSocial(page, '독서가');
    await page.getByRole('button', { name: '내 할 일로' }).click();
    const dialog = await openAudience(page, category);
    await expect(dialog.getByRole('radio', { name: '나만 보기', exact: true })).toBeChecked();
    await dialog.getByRole('radio', { name: '모두 공개', exact: true }).check();
    await expect(dialog.getByText(/로그인하지 않은 사람도 볼 수 있어요/)).toBeVisible();
    await expect(dialog.getByText(/기존 공유 사본 0개/)).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath('category-public-390.png'), fullPage: true });
    await dialog.getByRole('button', { name: '모두에게 공개하기' }).click();
    await expect(dialog).toHaveCount(0);
    await page.keyboard.press('Escape');
    await openSocial(page);
    await shareRecord(page, text);
    await publicPage.goto('/public');
    await expect(publicPage.getByRole('article').filter({ hasText: text })).toBeVisible();
    expect(await publicPage.evaluate(() => indexedDB.databases())).toEqual([]);
    // 같은 로그인 탭의 실제 철회 신호가 공개 탭의 오래된 응답보다 먼저 내용을 가려야 한다.
    const ownerPublic = await owner.newPage();
    await ownerPublic.goto('/public');
    await expect(ownerPublic.getByRole('article').filter({ hasText: text })).toBeVisible();
    let releaseOld!: () => void;
    let capturedOld!: () => void;
    let deliveredOld!: () => void;
    const oldHeld = new Promise<void>((resolve) => (capturedOld = resolve));
    const release = new Promise<void>((resolve) => (releaseOld = resolve));
    const oldDelivered = new Promise<void>((resolve) => (deliveredOld = resolve));
    let holdFirst = true;
    await ownerPublic.route('**/api/social/public/feed**', async (route) => {
      if (!holdFirst) return route.continue();
      holdFirst = false;
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      expect(await response.text()).toContain(text);
      capturedOld();
      await release;
      await route.fulfill({ response });
      deliveredOld();
    });
    await ownerPublic.getByRole('button', { name: '새로고침', exact: true }).click();
    await oldHeld;
    await page.getByRole('button', { name: '내 할 일로' }).click();
    await setAudience(page, category, 'private');
    await expect(ownerPublic.getByRole('article').filter({ hasText: text })).toHaveCount(0);
    releaseOld();
    await oldDelivered;
    await ownerPublic.evaluate(
      () =>
        new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done())),
        ),
    );
    await expect(ownerPublic.getByText('공개 기록을 불러오는 중')).toHaveCount(0);
    await expect(ownerPublic.getByRole('article').filter({ hasText: text })).toHaveCount(0);
    const narrowed = publicPage.waitForResponse(
      (response) => response.url().includes('/api/social/public/feed') && response.ok(),
    );
    await publicPage.getByRole('button', { name: '새로고침', exact: true }).click();
    await narrowed;
    await expect(publicPage.getByRole('article').filter({ hasText: text })).toHaveCount(0);
    await setAudience(page, category, 'public');
    await publicPage.getByRole('button', { name: '새로고침', exact: true }).click();
    await expect(publicPage.getByRole('article').filter({ hasText: text })).toBeVisible();
    await owner.close();
    await anonymous.close();
  });
  test('첫 공개 응답 손실 후 닫기·재열기는 같은 요청이며 재로드 뒤 수동 연결은 개인 이름을 바꾸지 않는다', async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await stubLogin(page, socialAccount('public'));
    const category = `연결 복구 ${crypto.randomUUID().slice(0, 6)}`;
    const text = `개인 원본 ${crypto.randomUUID().slice(0, 6)}`;
    await completedRecord(page, category, text);
    await joinSocial(page, '독서가');
    await page.getByRole('button', { name: '내 할 일로' }).click();
    const commands: { key: string | undefined; body: unknown }[] = [];
    let abortFirst = true;
    await page.route('**/api/social/categories', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      commands.push({
        key: route.request().headers()['idempotency-key'],
        body: route.request().postDataJSON(),
      });
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      if (abortFirst) {
        abortFirst = false;
        await route.abort('failed');
      } else await route.fulfill({ response });
    });
    const first = await openAudience(page, category);
    await first.getByRole('radio', { name: '모두 공개', exact: true }).check();
    await first.getByRole('button', { name: '모두에게 공개하기' }).click();
    await expect(first.getByRole('button', { name: '같은 요청 다시 확인' })).toBeVisible();
    await first.getByRole('button', { name: '나중에 확인', exact: true }).click();
    const leaving = page.getByRole('alertdialog', { name: '완료 여부를 나중에 확인할까요?' });
    await expect(leaving.getByText(/창을 닫아도 요청이 취소되지 않아요/)).toBeVisible();
    await leaving.getByRole('button', { name: '나중에 확인', exact: true }).click();
    await expect(first).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: `${category} 1/1`, exact: true }),
    ).toHaveAccessibleDescription('확인 필요');
    const retry = await openAudience(page, category);
    await retry.getByRole('button', { name: '같은 요청 다시 확인' }).click();
    await expect(retry).toHaveCount(0);
    expect(commands).toHaveLength(2);
    expect(commands[1]).toEqual(commands[0]);
    expect(Object.keys(commands[0].body as Record<string, unknown>).sort()).toEqual([
      'color',
      'expectedVersion',
      'name',
      'visibility',
    ]);
    await page.keyboard.press('Escape');
    // 이 기기와 연결되지 않은 별도 공개 결과를 실제 서버에 만들고 reload로 탭 registry를 비운다.
    const secondCategory = `다른 기기 공개 ${crypto.randomUUID().slice(0, 6)}`;
    await completedRecord(page, secondCategory, `미확정 원본 ${crypto.randomUUID().slice(0, 6)}`);
    abortFirst = true;
    const second = await openAudience(page, secondCategory);
    await second.getByRole('radio', { name: '모두 공개', exact: true }).check();
    await second.getByRole('button', { name: '모두에게 공개하기' }).click();
    await expect(second.getByRole('button', { name: '같은 요청 다시 확인' })).toBeVisible();
    await page.reload();
    const drawer = await openSidebarDrawer(page);
    const unbound = page.getByRole('button', { name: `${secondCategory} 1/1`, exact: true });
    await expect(unbound).toHaveAccessibleDescription('공유 연결 없음');
    const localName = `이 기기 이름 ${crypto.randomUUID().slice(0, 6)}`;
    await page.getByRole('button', { name: `${secondCategory} 메뉴`, exact: true }).click();
    await page.getByRole('menuitem', { name: '수정', exact: true }).click();
    const editing = page.getByRole('dialog', { name: '카테고리 수정', exact: true });
    await editing.getByRole('textbox', { name: '이름', exact: true }).fill(localName);
    await editing.getByRole('button', { name: '저장', exact: true }).click();
    await expect(editing).toHaveCount(0);
    await closeSidebarDrawer(page, drawer);
    await openSocial(page);
    await page.getByRole('button', { name: '친구 관리', exact: true }).click();
    await page.getByRole('button', { name: '공유 카테고리 관리', exact: true }).click();
    const manager = page.getByRole('dialog', { name: '공유 카테고리 관리', exact: true });
    const row = manager
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: secondCategory, exact: true }) });
    await expect(row.getByText(/이 기기에 연결되지 않음/)).toBeVisible();
    await row.getByRole('button', { name: '연결하기', exact: true }).click();
    await manager
      .getByRole('combobox', { name: '연결할 이 기기 카테고리' })
      .selectOption({ label: localName });
    await manager.getByRole('button', { name: '연결 내용 확인' }).click();
    const attach = page.getByRole('dialog', { name: '공유 카테고리 연결 확인', exact: true });
    await expect(attach.getByText(`서버 카테고리: ${secondCategory}`)).toBeVisible();
    await expect(attach.getByText(`이 기기 카테고리: ${localName}`)).toBeVisible();
    await expect(attach.getByText(/로그인하지 않은 사람도 볼 수 있어요/)).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('category-manual-attach-1280.png'),
      fullPage: true,
    });
    const countBeforeAttach = commands.length;
    await attach.getByRole('button', { name: '연결하기', exact: true }).click();
    await expect(
      page.getByText('이 기기의 연결 표식을 저장했어요. 개인 이름과 할 일은 그대로예요.'),
    ).toBeVisible();
    expect(commands).toHaveLength(countBeforeAttach);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: '공유 카테고리 관리', exact: true })).toHaveCount(
      0,
    );
    await page.getByRole('button', { name: '내 할 일로' }).click();
    const linked = await openAudience(page, localName);
    await expect(linked.getByText(secondCategory, { exact: true })).toBeVisible();
    await expect(linked.getByText(localName, { exact: true })).toHaveCount(0);
    await linked.getByRole('button', { name: '취소', exact: true }).click();
    await context.close();
  });
});
