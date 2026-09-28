// 읽기 조건: Phase 3 친구 화면의 실제 로컬 Worker/D1 상태 전이를 검증할 때.
// 두 배우는 같은 loopback 출처의 독립 브라우저 컨텍스트/쿠키/IndexedDB를 사용한다.
import { test, expect } from './fixtures/social';
import { stubLogin } from './fixtures/stub-login';
import { createCategory, openSidebarDrawer } from './sidebar';

import type { Page } from '@playwright/test';

const TODO = '완료한 소셜 기록';
const POST = '오늘의 완료 기록을 친구에게 나눕니다';
const CATEGORY = '소셜 E2E';

test.describe.configure({ timeout: 300_000 });

async function openSocial(page: Page): Promise<void> {
  const drawer = await openSidebarDrawer(page);
  await drawer.getByRole('button', { name: '친구', exact: true }).click();
  if (await drawer.isVisible()) await page.keyboard.press('Escape');
  await expect(page.getByRole('tablist', { name: '친구 화면' })).toBeVisible();
}

async function tab(page: Page, name: string): Promise<void> {
  const target = page.getByRole('tab', { name });
  await target.click();
  await expect(target).toHaveAttribute('aria-selected', 'true');
}

async function profile(page: Page, nickname: string): Promise<void> {
  await tab(page, '친구 관리');
  await page.getByRole('textbox', { name: '친구에게 보일 별명' }).fill(nickname);
  await page.getByRole('button', { name: '시작하기' }).click();
  await expect(page.getByRole('region', { name: '내 별명' })).toContainText(nickname);
}

async function noHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const root = document.documentElement;
        return root.scrollWidth <= root.clientWidth;
      }),
    )
    .toBe(true);
}

async function feedTabIsUncovered(page: Page): Promise<void> {
  const feedTab = page.getByRole('tab', { name: '피드' });
  await expect(feedTab).toBeInViewport();
  expect(
    await feedTab.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return hit !== null && element.contains(hit);
    }),
  ).toBe(true);
}

test('초대·공유·응원·오프라인·off 철회·차단·삭제가 두 계정과 실제 D1에서 이어진다', async ({
  browser,
  social,
}) => {
  const ctxA = await browser.newContext({
    baseURL: social.origin,
    viewport: { width: 1280, height: 800 },
  });
  const ctxB = await browser.newContext({
    baseURL: social.origin,
    viewport: { width: 1280, height: 800 },
  });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  try {
    await stubLogin(a, social.a);
    await stubLogin(b, social.b);
    await expect(a.getByRole('heading', { name: 'Tasky', level: 1 })).toBeVisible();
    await expect(b.getByRole('heading', { name: 'Tasky', level: 1 })).toBeVisible();

    // 완료 기록은 개인 UI에서 만든다. 공유는 이를 별도 공개 문장으로 복사해야 한다.
    await createCategory(a, CATEGORY);
    const group = a.getByRole('region', { name: CATEGORY });
    await group.getByRole('button', { name: '+ 할 일 추가' }).click();
    await a.getByRole('textbox', { name: `${CATEGORY}에 할 일 추가` }).fill(TODO);
    await a.keyboard.press('Enter');
    await group.getByRole('checkbox', { name: TODO }).check();
    await expect(group.getByRole('checkbox', { name: TODO })).toBeChecked();

    await openSocial(a);
    await openSocial(b);
    await profile(a, '배우 A');
    await profile(b, '배우 B');

    await a.getByRole('button', { name: '초대 만들기' }).click();
    const invite = await a.getByRole('textbox', { name: '초대 링크' }).inputValue();
    expect(invite).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/#invite=/);
    // 이미 친구 화면이 열린 탭에서 같은 문서의 초대 해시로 이동해도 처리해야 한다.
    await b.goto(invite);
    await expect.poll(() => b.evaluate(() => location.hash.length === 0)).toBe(true);
    await expect(b.getByRole('region', { name: '받은 초대' })).toContainText('배우 A');
    // 받은 링크를 새 문서에서 여는 경로도 별도로 확인한다.
    await b.goto('about:blank');
    await b.goto(invite);
    await expect.poll(() => b.evaluate(() => location.hash.length === 0)).toBe(true);
    await expect(b.getByRole('region', { name: '받은 초대' })).toContainText('배우 A');
    await b.getByRole('button', { name: '친구 요청 보내기' }).click();
    await a.getByRole('button', { name: '새로고침', exact: true }).click();
    await expect(a.getByRole('region', { name: '받은 요청' })).toContainText('배우 B');
    await a
      .getByRole('region', { name: '받은 요청' })
      .getByRole('button', { name: '수락' })
      .click();
    await expect(a.getByRole('region', { name: '친구', exact: true })).toContainText('배우 B');

    await tab(a, '내 공유');
    await a.getByRole('button', { name: '기록 공유' }).click();
    const composer = a.getByRole('dialog', { name: '기록 공유' });
    await composer
      .getByRole('group', { name: '완료한 할 일 선택' })
      .getByRole('button', { name: TODO })
      .click();
    await composer.getByRole('textbox', { name: '공개 문장' }).fill(POST);
    await composer.getByRole('button', { name: '친구에게 공유' }).click();
    await expect(composer).toHaveCount(0);
    await expect(a.getByRole('tabpanel', { name: '내 공유' }).getByRole('article')).toContainText(
      POST,
    );

    await tab(b, '피드');
    await b.getByRole('button', { name: '새로고침', exact: true }).click();
    const feedPost = b
      .getByRole('tabpanel', { name: '피드' })
      .getByRole('article')
      .filter({ hasText: POST });
    await expect(feedPost).toBeVisible();
    const reaction = feedPost.getByRole('button', { name: /배우 A님의 .* 공유 응원 0개/ });
    await reaction.click();
    await expect(
      feedPost.getByRole('button', { name: /배우 A님의 .* 공유 응원 1개/ }),
    ).toHaveAttribute('aria-pressed', 'true');

    // 실제 네트워크 단절과 복귀. 이전 글이 오프라인에서도 계속 노출되면 실패한다.
    await ctxB.setOffline(true);
    await b.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(b.getByText('친구 화면은 인터넷 연결과 로그인이 필요해요.').first()).toBeVisible();
    await expect(feedPost).toHaveCount(0);
    await ctxB.setOffline(false);
    await b.evaluate(() => window.dispatchEvent(new Event('online')));
    await b.getByRole('button', { name: '새로고침', exact: true }).click();
    await expect(feedPost).toBeVisible();

    // 한 번의 전송 실패 뒤 명시적 재시도로 실제 HTTP 피드를 다시 받는다.
    await b.route('**/api/social/feed**', (route) => route.abort('failed'));
    await b.getByRole('button', { name: '새로고침', exact: true }).click();
    const feedPanel = b.getByRole('tabpanel', { name: '피드' });
    await expect(feedPanel.getByRole('alert')).toContainText('불러오지 못했어요.');
    await b.unroute('**/api/social/feed**');
    await feedPanel.getByRole('button', { name: '다시 시도' }).click();
    await expect(feedPost).toBeVisible();
    expect(
      await b.evaluate(async () => {
        const urls = (
          await Promise.all(
            (await caches.keys()).map(async (key) =>
              (await (await caches.open(key)).keys()).map((request) => request.url),
            ),
          )
        ).flat();
        return urls.some((url) => new URL(url).pathname.startsWith('/api/social/'));
      }),
    ).toBe(false);

    // 각 폭과 CSS 200% 확대에서 본문 가로 넘침·탭 가림·포커스를 확인한다.
    for (const width of [360, 390, 1024, 1280]) {
      await b.setViewportSize({ width, height: 800 });
      await noHorizontalOverflow(b);
      const feedTab = b.getByRole('tab', { name: '피드' });
      await feedTab.focus();
      await expect(feedTab).toBeFocused();
      await feedTabIsUncovered(b);
    }
    await b.evaluate(() => {
      document.documentElement.style.zoom = '2';
    });
    await noHorizontalOverflow(b);
    await feedTabIsUncovered(b);
    await b.evaluate(() => {
      document.documentElement.style.zoom = '';
    });

    // 운영 mode=off 재시작 후 *새로고침*한 화면에서도 본인 응원 목록과 취소가 살아 있어야 한다.
    await social.setMode('off');
    await b.reload();
    await openSocial(b);
    await tab(b, '친구 관리');
    const mineReactions = b.getByRole('region', { name: '보낸 응원' });
    await expect(mineReactions.getByRole('button', { name: '응원 취소' })).toHaveCount(1);
    await mineReactions.getByRole('button', { name: '응원 취소' }).click();
    await b
      .getByRole('alertdialog', { name: '이 응원을 취소할까요?' })
      .getByRole('button', { name: '응원 취소' })
      .click();
    await expect(mineReactions).toContainText('아직 보낸 응원이 없어요.');

    await social.setMode('enabled');
    await b.reload();
    await openSocial(b);
    await tab(b, '피드');
    await expect(feedPost).toBeVisible();
    await feedPost.getByRole('button', { name: '배우 A님 공유 더 보기' }).click();
    await b.getByRole('menuitem', { name: '사용자 차단' }).click();
    await b
      .getByRole('alertdialog', { name: '이 사용자를 차단할까요?' })
      .getByRole('button', { name: '차단' })
      .click();
    await expect(feedPost).toHaveCount(0);

    await a.reload();
    await openSocial(a);
    await tab(a, '내 공유');
    const ownPost = a
      .getByRole('tabpanel', { name: '내 공유' })
      .getByRole('article')
      .filter({ hasText: POST });
    await ownPost.getByRole('button', { name: '더 보기' }).click();
    await ownPost.getByRole('button', { name: '공유 삭제' }).click();
    await a
      .getByRole('alertdialog', { name: '이 공유를 삭제할까요?' })
      .getByRole('button', { name: '공유 삭제' })
      .click();
    await expect(ownPost).toHaveCount(0);
    await a.getByRole('button', { name: '내 할 일로' }).click();
    await expect(
      a.getByRole('region', { name: CATEGORY }).getByRole('checkbox', { name: TODO }),
    ).toBeChecked();
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
