import { writeFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { stubLogin } from './fixtures/stub-login';
import {
  completedRecord,
  cheerWithoutJump,
  nicknameConflict,
  joinSocial,
  measureSocialText,
  recoverMissingDelete,
  openSocial,
  setAudience,
  shareRecord,
  socialAccount,
} from './social';

test.describe('Phase 3 소셜 실제 Worker 왕복', () => {
  test.skip(process.env.TASKY_E2E_SOCIAL !== '1', '기본 off 개인 회귀와 별도 enabled 서버');
  test('초대 → 요청 → 수락 → 완료 사본 → 응원 → 삭제', async ({ browser }, testInfo) => {
    const a = await browser.newContext();
    const b = await browser.newContext();
    const pa = await a.newPage();
    const pb = await b.newPage();
    await stubLogin(pa, socialAccount('owner'));
    await stubLogin(pb, socialAccount('peer'));
    const category = `친구 공부 ${crypto.randomUUID().slice(0, 6)}`;
    const text = `수학 문제 끝냈어요 ${crypto.randomUUID().slice(0, 6)}`;
    await completedRecord(pa, category, text);
    await joinSocial(pa, '별이');
    await joinSocial(pb, '달이');
    await nicknameConflict(pa, browser);
    const friendsLoaded = pa.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/social/friends' && response.ok(),
    );
    await pa.getByRole('button', { name: '친구 관리', exact: true }).click();
    await friendsLoaded;
    const friends = pa.getByRole('region', { name: '친구 목록' });
    await expect(
      friends
        .getByText('달이', { exact: true })
        .or(friends.getByText('친구를 초대해 완료한 일을 나눠 보세요')),
    ).toBeVisible();
    await expect(friends.getByText('목록을 불러오는 중')).toHaveCount(0);
    if (await friends.getByText('달이', { exact: true }).count()) {
      await friends.getByRole('button', { name: '친구 삭제', exact: true }).click();
      await pa.getByRole('alertdialog').getByRole('button', { name: '확인', exact: true }).click();
      await expect(friends.getByText('달이', { exact: true })).toHaveCount(0);
    }
    await pa.getByRole('button', { name: '초대 만들기' }).click();
    const invite = await pa.getByLabel('초대 링크', { exact: true }).inputValue();
    expect(invite).toMatch(/#invite=[a-f0-9]{64}$/);
    await pb.goto(invite);
    await expect(pb).toHaveURL(/\/$/);
    await pb.getByRole('button', { name: '친구 요청 보내기' }).click();
    await expect(pb.getByRole('region', { name: '보낸 요청' }).getByText('별이')).toBeVisible();
    await pa.getByRole('button', { name: '내 할 일로' }).click();
    await openSocial(pa);
    await pa.getByRole('button', { name: '친구 관리', exact: true }).click();
    await pa
      .getByRole('region', { name: '받은 요청' })
      .getByRole('button', { name: '수락' })
      .click();
    await expect(pa.getByRole('region', { name: '친구 목록' }).getByText('달이')).toBeVisible();
    await pa.getByRole('button', { name: '내 할 일로' }).click();
    await setAudience(pa, category, 'friends');
    await openSocial(pa);
    await shareRecord(pa, text);
    for (let index = 0; index < 2; index += 1) {
      await pa.getByRole('button', { name: '기록 공유', exact: true }).click();
      const chooser = pa.getByRole('dialog', { name: '완료한 기록 공유', exact: true });
      await chooser.getByRole('radio', { name: new RegExp(text) }).check();
      await chooser
        .getByRole('textbox', { name: '공유 문장', exact: true })
        .fill(`위쪽 보기 ${index} ` + '완료한 기록을 남겨요 '.repeat(18));
      await chooser.getByRole('button', { name: '공유하기', exact: true }).click();
      await expect(chooser).toHaveCount(0);
    }
    await pb.getByRole('button', { name: '피드', exact: true }).click();
    await pb.getByRole('button', { name: '새로고침', exact: true }).click();
    await expect(pb.getByRole('article').filter({ hasText: text })).toBeVisible();
    const peerCard = pb.getByRole('article').filter({ hasText: text });
    await cheerWithoutJump(pb, text);
    await expect(peerCard.getByRole('button', { name: '응원 취소' })).toBeVisible();
    await pb.screenshot({ path: testInfo.outputPath('social-feed-1280.png'), fullPage: true });
    await peerCard.getByRole('button', { name: '별이 기록 더 보기' }).click();
    await pb.getByRole('menuitem', { name: '작성자 차단', exact: true }).click();
    await pb.getByRole('alertdialog').getByRole('button', { name: '차단', exact: true }).click();
    await expect(pb.getByRole('article').filter({ hasText: text })).toHaveCount(0);
    await pb.getByRole('button', { name: '친구 관리', exact: true }).click();
    const blocks = pb.getByRole('region', { name: '차단한 사용자' });
    await expect(blocks.getByText('별이', { exact: true })).toBeVisible();
    await blocks.getByRole('button', { name: '차단 해제', exact: true }).click();
    await pb.getByRole('alertdialog').getByRole('button', { name: '확인', exact: true }).click();
    await expect(blocks.getByText('별이', { exact: true })).toHaveCount(0);
    await expect(
      pb
        .getByRole('region', { name: '친구 목록' })
        .getByText('친구를 초대해 완료한 일을 나눠 보세요'),
    ).toBeVisible();
    await pb.getByRole('button', { name: '피드', exact: true }).click();

    await recoverMissingDelete(pa, text);
    await expect(pa.getByRole('article').filter({ hasText: text })).toHaveCount(0);
    await pb.getByRole('button', { name: '새로고침', exact: true }).click();
    await expect(pb.getByText('친구를 초대해 완료한 일을 나눠 보세요')).toBeVisible();
    await a.close();
    await b.close();
  });
});

test.describe('공유 복구와 키보드', () => {
  test.skip(process.env.TASKY_E2E_SOCIAL !== '1', 'enabled 전용 명령 복구');
  test('실제 저장 뒤 응답 손실·오프라인에도 사본은 한 건이고 IME Enter는 공유하지 않는다', async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await stubLogin(page, socialAccount('owner'));
    const category = `복구 ${crypto.randomUUID().slice(0, 6)}`;
    const text = `응답 손실 ${crypto.randomUUID().slice(0, 6)}`;
    await completedRecord(page, category, text);
    await joinSocial(page, '별이');
    await page.getByRole('button', { name: '내 할 일로' }).click();
    await openSocial(page);
    await page.getByRole('button', { name: '기록 공유', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '완료한 기록 공유', exact: true });
    await dialog.getByRole('radio', { name: new RegExp(text) }).check();
    const draft = dialog.getByRole('textbox', { name: '공유 문장', exact: true });
    await draft.fill(`${text} 수정`);
    await page.keyboard.press('Escape');
    const discard = page.getByRole('alertdialog', { name: '작성 중인 문장을 버릴까요?' });
    await expect(discard.getByRole('button', { name: '계속 작성' })).toBeFocused();
    await discard.getByRole('button', { name: '계속 작성' }).click();
    await expect(draft).toHaveValue(`${text} 수정`);
    let prematurePosts = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/social/posts')
        prematurePosts += 1;
    });
    await dialog.getByRole('button', { name: '공개 범위 바꾸기', exact: true }).click();
    const scope = page.getByRole('dialog', { name: '카테고리 공개 범위 확인', exact: true });
    await scope.getByRole('radio', { name: '모두 공개', exact: true }).check();
    await scope.getByRole('button', { name: '모두에게 공개하기', exact: true }).click();
    await expect(scope).toHaveCount(0);
    await expect(draft).toHaveValue(`${text} 수정`);
    await expect(dialog.getByRole('radio', { name: new RegExp(text) })).toBeChecked();
    await expect(dialog.getByRole('button', { name: '공유하기', exact: true })).toBeEnabled();
    await expect(dialog.getByRole('region', { name: '공유 미리보기' })).toContainText('모두 공개');
    expect(prematurePosts).toBe(0);
    await draft.fill(text);
    const sent: { key: string | undefined; body: unknown }[] = [];
    let first = true;
    let firstCommitted = false;
    let releaseFirst!: () => void;
    await page.route('**/api/social/posts', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      sent.push({
        key: route.request().headers()['idempotency-key'],
        body: route.request().postDataJSON(),
      });
      const response = await route.fetch();
      if (first) {
        first = false;
        expect(response.ok()).toBe(true);
        firstCommitted = true;
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
        await route.abort('failed');
      } else await route.fulfill({ response });
    });
    await draft.focus();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.imeSetComposition', { text: '완료', selectionStart: 2, selectionEnd: 2 });
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 229,
      text: '\r',
    });
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 229,
    });
    await page.keyboard.press('Enter');
    await cdp.send('Input.insertText', { text: '완료' });
    await draft.fill(text);
    // 조합 확정까지 기다린 뒤에도 명시 버튼 이전에는 요청 자체가 없어야 한다.
    await expect(dialog.getByRole('button', { name: '공유하기', exact: true })).toBeEnabled();
    expect(sent).toHaveLength(0);
    await dialog.getByRole('button', { name: '공유하기', exact: true }).click();
    await expect.poll(() => firstCommitted).toBe(true);
    await page.keyboard.press('Escape');
    await dialog.getByRole('button', { name: '닫기', exact: true }).first().click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: '완료 여부 확인' })).toBeEnabled({
      timeout: 20_000,
    });
    await context.setOffline(true);
    await expect(dialog.getByRole('button', { name: '완료 여부 확인' })).toBeVisible();
    await expect(draft).toHaveCount(0);
    await expect(dialog.getByRole('region', { name: '공유 미리보기' })).toHaveCount(0);
    await expect(dialog.getByText('이전 요청의 계정을 확인하고 있어요.')).toBeVisible();
    await expect(dialog.getByLabel('기록 날짜')).toBeDisabled();
    for (const radio of await dialog.getByRole('radio').all()) await expect(radio).toBeDisabled();
    await expect(dialog.getByRole('button', { name: '완료 여부 확인' })).toBeDisabled();
    expect(sent).toHaveLength(1);
    expect(Object.keys(sent[0].body as Record<string, unknown>).sort()).toEqual([
      'categoryId',
      'categoryVersion',
      'happenedOn',
      'text',
    ]);
    releaseFirst();
    await context.setOffline(false);
    await expect(dialog.getByRole('button', { name: '완료 여부 확인' })).toBeEnabled();
    await expect(draft).toHaveValue(text);
    await expect(draft).toBeDisabled();
    await page.keyboard.press('Escape');
    await page
      .getByRole('alertdialog', { name: '완료 여부를 나중에 확인할까요?' })
      .getByRole('button', { name: '나중에 확인' })
      .click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: '기록 공유', exact: true }).click();
    await expect(dialog.getByRole('textbox', { name: '공유 문장' })).toHaveValue(text);
    await expect(dialog.getByRole('radio', { checked: true })).toHaveCount(0);
    expect(sent).toHaveLength(1);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.screenshot({
      path: testInfo.outputPath('composer-uncertain-dark-360.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => (document.documentElement.style.zoom = '2'));
    const recoveryButton = dialog.getByRole('button', { name: '완료 여부 확인' });
    await recoveryButton.scrollIntoViewIfNeeded();
    const footer = await recoveryButton.boundingBox();
    expect(footer).not.toBeNull();
    expect(footer!.x).toBeGreaterThanOrEqual(0);
    expect(footer!.x + footer!.width).toBeLessThanOrEqual(1280);
    expect(footer!.y + footer!.height).toBeLessThanOrEqual(900);
    const measure = await measureSocialText(dialog.getByText(/직접 고른 한 건만 별도 사본으로/));
    expect(measure.contrast).toBeGreaterThanOrEqual(4.5);
    expect(measure.documentWidth).toBeLessThanOrEqual(measure.viewport);
    writeFileSync(
      testInfo.outputPath('social-a11y-css-zoom-200.json'),
      JSON.stringify(measure, null, 2),
    );
    await page.screenshot({
      path: testInfo.outputPath('composer-uncertain-dark-css-zoom-200.png'),
      fullPage: true,
    });
    await page.evaluate(() => (document.documentElement.style.zoom = '1'));
    await dialog.getByRole('button', { name: '완료 여부 확인' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('article').filter({ hasText: text })).toHaveCount(1);
    await expect(page.getByRole('article').filter({ hasText: text })).toBeFocused();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    await expect(
      page.getByText('공유 사본을 확인했어요. 내 공유에서 현재 공개 범위를 확인해 주세요.'),
    ).toBeVisible();
    await context.close();
  });
});
