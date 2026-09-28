// 읽기 조건: Phase 3 친구 화면의 서버 mode 전환(enabled→off→enabled)과 실제 로컬 Worker/D1 상태 전이를 검증할 때.
// 두 배우는 같은 loopback 출처의 독립 브라우저 컨텍스트/쿠키/IndexedDB를 사용한다.
// 화면 조작은 `./social` 헬퍼를 재사용하고, 서버 기동·mode 재시작은 `./fixtures/social` 이 맡는다.
import { test, expect } from './fixtures/social';
import { stubLogin } from './fixtures/stub-login';
import { completedRecord, joinSocial, openSocial, setAudience, shareRecord } from './social';

import type { Page } from '@playwright/test';

test.describe.configure({ timeout: 300_000 });

async function tab(page: Page, name: string): Promise<void> {
  const target = page.getByRole('button', { name, exact: true });
  await target.click();
  await expect(target).toHaveAttribute('aria-pressed', 'true');
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
  const feedTab = page.getByRole('button', { name: '피드', exact: true });
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
  const category = `소셜 E2E ${crypto.randomUUID().slice(0, 6)}`;
  const text = `완료한 소셜 기록 ${crypto.randomUUID().slice(0, 6)}`;
  try {
    await stubLogin(a, social.a);
    await stubLogin(b, social.b);
    await expect(a.getByRole('heading', { name: 'Tasky', level: 1 })).toBeVisible();
    await expect(b.getByRole('heading', { name: 'Tasky', level: 1 })).toBeVisible();

    // 완료 기록은 개인 UI에서 만든다. 공유는 이를 별도 공개 문장으로 복사해야 한다.
    await completedRecord(a, category, text);
    await joinSocial(a, '배우 A');
    await joinSocial(b, '배우 B');

    await tab(a, '친구 관리');
    await a.getByRole('button', { name: '초대 만들기' }).click();
    const invite = await a.getByLabel('초대 링크', { exact: true }).inputValue();
    expect(invite).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/#invite=[a-f0-9]{64}$/);
    // 이미 친구 화면이 열린 탭에서 같은 문서의 초대 해시로 이동해도 처리해야 한다.
    await b.goto(invite);
    await expect.poll(() => b.evaluate(() => location.hash.length === 0)).toBe(true);
    await expect(b.getByRole('button', { name: '친구 요청 보내기' })).toBeVisible();
    // 받은 링크를 새 문서에서 여는 경로도 별도로 확인한다.
    await b.goto('about:blank');
    await b.goto(invite);
    await expect.poll(() => b.evaluate(() => location.hash.length === 0)).toBe(true);
    await b.getByRole('button', { name: '친구 요청 보내기' }).click();
    await expect(b.getByRole('region', { name: '보낸 요청' }).getByText('배우 A')).toBeVisible();

    await a.getByRole('button', { name: '내 할 일로' }).click();
    await openSocial(a);
    await tab(a, '친구 관리');
    await a
      .getByRole('region', { name: '받은 요청' })
      .getByRole('button', { name: '수락' })
      .click();
    await expect(a.getByRole('region', { name: '친구 목록' }).getByText('배우 B')).toBeVisible();

    await a.getByRole('button', { name: '내 할 일로' }).click();
    await setAudience(a, category, 'friends');
    await openSocial(a);
    await shareRecord(a, text);

    await tab(b, '피드');
    await b.getByRole('button', { name: '새로고침', exact: true }).click();
    const feedPost = b.getByRole('article').filter({ hasText: text });
    await expect(feedPost).toBeVisible();
    await feedPost.getByRole('button', { name: '응원하기', exact: true }).click();
    await expect(feedPost.getByRole('button', { name: '응원 취소', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // 실제 네트워크 단절과 복귀. 이전 글이 오프라인에서도 계속 노출되면 실패한다.
    await ctxB.setOffline(true);
    await b.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(b.getByText('친구 화면은 인터넷 연결이 필요해요.').first()).toBeVisible();
    await expect(feedPost).toHaveCount(0);
    await ctxB.setOffline(false);
    await b.evaluate(() => window.dispatchEvent(new Event('online')));
    await b.getByRole('button', { name: '새로고침', exact: true }).click();
    await expect(feedPost).toBeVisible();

    // 한 번의 전송 실패 뒤 명시적 재시도로 실제 HTTP 피드를 다시 받는다.
    await b.route('**/api/social/feed**', (route) => route.abort('failed'));
    await b.getByRole('button', { name: '새로고침', exact: true }).click();
    await expect(b.getByRole('alert').filter({ hasText: '다시 시도' })).toBeVisible();
    await b.unroute('**/api/social/feed**');
    await b.getByRole('alert').getByRole('button', { name: '다시 시도' }).click();
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
      const feedTab = b.getByRole('button', { name: '피드', exact: true });
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
    await b.setViewportSize({ width: 1280, height: 800 });

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
    await feedPost.getByRole('button', { name: '배우 A 기록 더 보기' }).click();
    await b.getByRole('menuitem', { name: '작성자 차단', exact: true }).click();
    await b.getByRole('alertdialog').getByRole('button', { name: '차단', exact: true }).click();
    await expect(feedPost).toHaveCount(0);

    await a.reload();
    await openSocial(a);
    await tab(a, '내 공유');
    const ownPost = a.getByRole('article').filter({ hasText: text });
    await ownPost.getByRole('button', { name: '배우 A 기록 더 보기' }).click();
    await a.getByRole('menuitem', { name: '공유 삭제', exact: true }).click();
    await a
      .getByRole('alertdialog')
      .getByRole('button', { name: '공유 삭제', exact: true })
      .click();
    await expect(ownPost).toHaveCount(0);
    await a.getByRole('button', { name: '내 할 일로' }).click();
    await expect(
      a.getByRole('region', { name: category }).getByRole('checkbox', { name: text }),
    ).toBeChecked();
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
