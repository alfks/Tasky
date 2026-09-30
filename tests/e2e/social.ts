import { expect } from '@playwright/test';

import { stubLogin } from './fixtures/stub-login';
import { closeSidebarDrawer, createCategory, openSidebarDrawer } from './sidebar';

import type { Browser, Locator, Page } from '@playwright/test';

export async function openSocial(page: Page): Promise<void> {
  await openSidebarDrawer(page);
  await page.getByRole('button', { name: '친구', exact: true }).click();
  await expect(page.getByRole('button', { name: '내 할 일로' })).toBeVisible();
}

export async function joinSocial(page: Page, nickname: string): Promise<void> {
  await openSocial(page);
  const input = page.getByLabel('친구에게 보일 별명');
  const existing = page.getByText(`친구에게 보이는 이름: ${nickname}`);
  await expect(input.or(existing)).toBeVisible();
  if (await existing.count()) return;
  await input.fill(nickname);
  await page.getByRole('button', { name: '시작하기', exact: true }).click();
  await expect(page.getByText(`친구에게 보이는 이름: ${nickname}`)).toBeVisible();
}

export async function completedRecord(page: Page, category: string, text: string): Promise<void> {
  await createCategory(page, category);
  const group = page.getByRole('region', { name: category, exact: true });
  await group.getByRole('button', { name: '+ 할 일 추가' }).click();
  await page.getByRole('textbox', { name: `${category}에 할 일 추가` }).fill(text);
  await page.keyboard.press('Enter');
  await group.getByRole('checkbox', { name: text, exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(group.getByRole('checkbox', { name: text, exact: true })).toBeChecked();
}

export async function openAudience(page: Page, category: string) {
  const drawer = page.getByRole('dialog', { name: 'Tasky', exact: true });
  if (!(await drawer.isVisible())) await openSidebarDrawer(page);
  await page.getByRole('button', { name: `${category} 메뉴`, exact: true }).click();
  await page.getByRole('menuitem', { name: '공개 범위', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '카테고리 공개 범위 확인', exact: true });
  const radio = dialog.getByRole('radio', { name: '나만 보기', exact: true });
  const retry = dialog.getByRole('button', { name: '같은 요청 다시 확인' });
  await expect
    .poll(
      async () =>
        (await retry.count()) > 0 || ((await radio.count()) > 0 && (await radio.isEnabled())),
    )
    .toBe(true);
  return dialog;
}

export async function setAudience(
  page: Page,
  category: string,
  scope: 'friends' | 'public' | 'private',
): Promise<void> {
  const dialog = await openAudience(page, category);
  const labels = { friends: '친구만', public: '모두 공개', private: '나만 보기' };
  const actions = {
    friends: '친구에게 공개하기',
    public: '모두에게 공개하기',
    private: '나만 보기로 바꾸기',
  };
  await dialog.getByRole('radio', { name: labels[scope], exact: true }).check();
  await dialog.getByRole('button', { name: actions[scope], exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const drawer = page.getByRole('dialog', { name: 'Tasky', exact: true });
  if (await drawer.count()) await closeSidebarDrawer(page, drawer);
}

export async function shareRecord(page: Page, text: string): Promise<void> {
  await page.getByRole('button', { name: '기록 공유', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '완료한 기록 공유' });
  await expect(dialog.getByRole('button', { name: '공유하기', exact: true })).toBeDisabled();
  await dialog.getByRole('radio', { name: new RegExp(text) }).check();
  await expect(dialog.getByRole('button', { name: '공유하기', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: '공유하기', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('article').filter({ hasText: text })).toBeVisible();
  await expect(page.getByRole('article').filter({ hasText: text })).toBeFocused();
}

/** enabled 대상은 런별 정확히 세 계정이다. 임의 가입자는 기본 off를 유지한다. */
export function socialAccount(role: 'owner' | 'peer' | 'public') {
  const sub = `e2e-social-${process.env.TASKY_E2E_SOCIAL_RUN ?? 'local'}-${role}`;
  return { sub, email: `${sub}@example.com` };
}

/** 실제 계산된 글자색과 조상 배경으로 잰다. CSS zoom은 브라우저 자체 줌과 구분해 기록한다. */
export async function measureSocialText(label: Locator) {
  return label.evaluate((element) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    const rgba = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data];
    };
    let ancestor: Element | null = element;
    let background = [255, 255, 255, 255];
    while (ancestor !== null) {
      const color = rgba(getComputedStyle(ancestor).backgroundColor);
      if (color[3] === 255) {
        background = color;
        break;
      }
      ancestor = ancestor.parentElement;
    }
    const style = getComputedStyle(element);
    const luminance = (color: number[]) => {
      const linear = color.slice(0, 3).map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    };
    const foreground = rgba(style.color);
    const light = luminance(foreground);
    const dark = luminance(background);
    const bounds = element.getBoundingClientRect();
    return {
      foreground,
      background,
      contrast: (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05),
      zoom: getComputedStyle(document.documentElement).zoom,
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bounds: { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom },
    };
  });
}

/** 두 실제 클라이언트의 rename CAS: 기존 초안은 유지하고 새 명시 click만 최신 version/key를 쓴다. */
export async function nicknameConflict(page: Page, browser: Browser): Promise<void> {
  await page.getByRole('button', { name: '별명 변경', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '친구에게 보일 별명 변경', exact: true });
  await dialog.getByRole('textbox', { name: '친구에게 보일 별명', exact: true }).fill('별이');
  const context = await browser.newContext();
  const other = await context.newPage();
  await stubLogin(other, socialAccount('owner'));
  await joinSocial(other, '별이');
  await other.getByRole('button', { name: '별명 변경', exact: true }).click();
  const second = other.getByRole('dialog', { name: '친구에게 보일 별명 변경', exact: true });
  await second
    .getByRole('textbox', { name: '친구에게 보일 별명', exact: true })
    .fill('별이 다른 창');
  await second.getByRole('button', { name: '별명 저장', exact: true }).click();
  await expect(second).toHaveCount(0);
  const sent: { key: string | undefined; body: { expectedVersion: number } }[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/social/profile/name'
    ) {
      sent.push({ key: request.headers()['idempotency-key'], body: request.postDataJSON() });
    }
  });
  await dialog.getByRole('button', { name: '별명 저장', exact: true }).click();
  await expect(dialog.getByText(/현재 별명: 별이 다른 창/)).toBeVisible();
  await expect(
    dialog.getByRole('textbox', { name: '친구에게 보일 별명', exact: true }),
  ).toHaveValue('별이');
  await expect(dialog.getByRole('button', { name: '별명 저장', exact: true })).toBeEnabled();
  expect(sent).toHaveLength(1);
  await dialog.getByRole('button', { name: '별명 저장', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('친구에게 보이는 이름: 별이', { exact: true })).toBeVisible();
  expect(sent).toHaveLength(2);
  expect(sent[1].body.expectedVersion).toBe(sent[0].body.expectedVersion + 1);
  expect(sent[1].key).not.toBe(sent[0].key);
  await context.close();
}

/** 실제 scroll container의 읽던 위치와 재렌더된 cheer button focus를 함께 검증한다. */
export async function cheerWithoutJump(page: Page, text: string): Promise<void> {
  const card = page.getByRole('article').filter({ hasText: text });
  const button = card.getByRole('button', { name: '응원하기', exact: true });
  await button.scrollIntoViewIfNeeded();
  const readingTop = () =>
    card.evaluate((element) => {
      let ancestor = element.parentElement;
      while (ancestor !== null) {
        if (
          /(auto|scroll)/.test(getComputedStyle(ancestor).overflowY) &&
          ancestor.scrollHeight > ancestor.clientHeight
        )
          return ancestor.scrollTop;
        ancestor = ancestor.parentElement;
      }
      return window.scrollY;
    });
  const top = await readingTop();
  expect(top).toBeGreaterThan(0);
  await button.click();
  await expect(card.getByRole('button', { name: '응원 취소', exact: true })).toBeFocused();
  await expect(card.getByRole('button', { name: '응원 취소', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect.poll(readingTop).toBe(top);
}
