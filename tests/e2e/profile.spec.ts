// 읽기 조건: 프로필 카드·편집 대화상자(docs/specs/profile.md)를 고치거나 이 스펙이 빨간불일 때.
//
// 재는 것: 달력 위 프로필 카드에서 ✎ → 이름·소개 저장 → 카드 반영 → 새로고침 뒤 유지 → 포커스가 ✎ 로
// 복귀 · 사진 실변환(R3~R6 — jsdom 은 캔버스가 없어 여기서만 잰다): 투명 PNG 의 배경이 흰색, 회전 6
// JPEG 가 바로 서는지, 4000×4000 노이즈가 상한(16,384자) 안으로 줄어드는지, WebP 미지원(강제 폴백)에서
// JPEG 인지 · 키보드로 "사진 고르기" 에 닿아 링이 label 위에 보이고 Enter 가 파일 대화상자를 여는지 ·
// 두 컨텍스트(기기 둘) 사이에서 이름이 넘어가는지(sync.spec 방식).
//
// 셀렉터는 역할 + 접근 이름만(tests/AGENTS.md 규칙 1). 카드의 사진은 `alt=""` 라 `img` 역할이 없다 —
// 스펙(§5)이 그렇게 정했으므로 `role="presentation"` 으로 찾는다(장식 이미지의 암묵 역할).
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from './fixtures/stub-login';
import { randomAccount, stubLogin } from './fixtures/stub-login';
import { openSidebarDrawer } from './sidebar';

import type { Locator, Page } from '@playwright/test';

const NAME = '밀리';
const BIO = '오늘도 한 칸씩';
const AVATAR_MAX_CHARS = 16_384;
// ESM 스펙이라 `__dirname` 이 없다 — 파일 URL 로 픽스처 디렉토리를 잡는다.
const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));

/** 드로어가 이미 열려 있으면(직전 대화상자를 닫은 뒤 등) 그대로 쓰고, 아니면 연다. */
async function openProfileEditor(page: Page): Promise<Locator> {
  await page.waitForSelector('main#shell-main');
  await page.getByRole('button', { name: '프로필 편집' }).click();
  const dialog = page.getByRole('dialog', { name: '프로필 편집' });
  await expect(dialog).toBeVisible();
  return dialog;
}

function profileCard(page: Page): Locator {
  return page.getByRole('region', { name: '프로필', exact: true });
}

/** 저장된 사진(`img alt=""`) — 대화상자 미리보기와 카드 둘 다 같은 모양이다. */
function photoIn(scope: Locator): Locator {
  return scope.getByRole('presentation');
}

/** 사진을 캔버스에 그려 픽셀 하나를 읽는다(데이터 URL 이라 same-origin). */
async function pixelAt(img: Locator, x: number, y: number): Promise<number[]> {
  return img.evaluate(
    (el, [px, py]) => {
      const image = el as HTMLImageElement;
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx === null) throw new Error('no 2d context');
      ctx.drawImage(image, 0, 0);
      return Array.from(ctx.getImageData(px!, py!, 1, 1).data);
    },
    [x, y],
  );
}

async function uploadAndSave(page: Page, dialog: Locator, file: string): Promise<void> {
  await dialog.getByLabel('사진 고르기').setInputFiles(file);
  await expect(photoIn(dialog)).toBeVisible();
  await dialog.getByRole('button', { name: '저장' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(photoIn(profileCard(page))).toBeVisible();
}

test('이름·소개를 저장하면 카드에 보이고 새로고침 뒤에도 남으며, 포커스는 ✎ 로 돌아온다', async ({
  page,
}) => {
  const dialog = await openProfileEditor(page);
  await expect(dialog.getByLabel('이름')).toBeFocused();
  await dialog.getByLabel('이름').fill(NAME);
  await dialog.getByLabel('한 줄 소개').fill(BIO);
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '프로필 편집' })).toBeFocused();

  const card = profileCard(page);
  await expect(card).toContainText(NAME);
  await expect(card).toContainText(BIO);

  await page.reload();
  await page.waitForSelector('main#shell-main');
  await expect(profileCard(page)).toContainText(NAME);
  await expect(profileCard(page)).toContainText(BIO);
});

test('달력 컬럼에서 빈 상태 자리표시 문구가 잘리지 않고, 60자 소개가 한 줄이다', async ({
  page,
}) => {
  await page.waitForSelector('main#shell-main');
  const drawer = await openSidebarDrawer(page);
  await drawer.getByRole('button', { name: '사이드바 고정' }).click();
  await expect(drawer).toHaveCount(0);
  const column = page.getByRole('navigation', { name: '사이드바' });
  const placeholder = profileCard(page).getByText('한 줄 소개를 적어 보세요');
  await expect(placeholder).toBeVisible();
  // 잘림은 계산된 박스로 잰다(규칙 1) — 리뷰 B-M1 이 잡은 4px 부족이 다시 오면 여기서 빨개진다.
  const box = await placeholder.evaluate((el) => ({
    scroll: el.scrollWidth,
    client: el.clientWidth,
  }));
  expect(box.scroll, '자리표시 문구가 말줄임됐다').toBeLessThanOrEqual(box.client);

  // 고정 컬럼에는 드로어가 없다 — ✎ 를 바로 누른다.
  await profileCard(page).getByRole('button', { name: '프로필 편집' }).click();
  const dialog = page.getByRole('dialog', { name: '프로필 편집' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('한 줄 소개').fill('나'.repeat(60));
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await column.getByRole('button', { name: '사이드바 고정 해제' }).click();
  await page.setViewportSize({ width: 960, height: 800 });
  const bio = profileCard(page).getByText('나'.repeat(60));
  const lineBox = await bio.evaluate((el) => ({
    height: el.clientHeight,
    line: parseFloat(getComputedStyle(el).lineHeight),
  }));
  expect(lineBox.height, '60자 소개가 두 줄로 늘어났다').toBeLessThanOrEqual(lineBox.line + 1);
});

test('작은 투명 PNG → 카드의 img src 가 data:image/ 로 시작하고 16,384자 이하이며 배경이 흰색, 지우기가 된다', async ({
  page,
}) => {
  const dialog = await openProfileEditor(page);
  await uploadAndSave(page, dialog, join(FIXTURES, 'avatar.png'));

  const img = photoIn(profileCard(page));
  const src = await img.getAttribute('src');
  expect(src).toMatch(/^data:image\/(webp|jpeg);base64,/);
  expect(src!.length).toBeLessThanOrEqual(AVATAR_MAX_CHARS);
  // 원본은 투명 배경 + 가운데 파란 원 — 모서리(투명이던 곳)가 흰색이어야 한다(R3).
  const [r, g, b] = await pixelAt(img, 2, 2);
  expect(r).toBeGreaterThan(240);
  expect(g).toBeGreaterThan(240);
  expect(b).toBeGreaterThan(240);

  const again = await openProfileEditor(page);
  await again.getByRole('button', { name: '사진 지우기' }).click();
  await expect(photoIn(again)).toHaveCount(0);
  await again.getByRole('button', { name: '저장' }).click();
  await expect(again).toHaveCount(0);
  await expect(photoIn(profileCard(page))).toHaveCount(0);
});

test('EXIF 회전 6 사진은 사용자가 보는 방향으로 저장된다(위 빨강/아래 파랑 원본 → 왼쪽 파랑/오른쪽 빨강)', async ({
  page,
}) => {
  const dialog = await openProfileEditor(page);
  await uploadAndSave(page, dialog, join(FIXTURES, 'avatar-rotated.jpg'));
  const img = photoIn(profileCard(page));
  const [lr, , lb] = await pixelAt(img, 10, 48);
  const [rr, , rb] = await pixelAt(img, 86, 48);
  expect(lb, '왼쪽은 파랑').toBeGreaterThan(lr!);
  expect(rr, '오른쪽은 빨강').toBeGreaterThan(rb!);
});

test('4000×4000 노이즈 사진도 품질을 내려 16,384자 안으로 들어온다(R6)', async ({ page }) => {
  const dialog = await openProfileEditor(page);
  // 파일은 브라우저 안에서 만들어 input 에 직접 심는다 — 노이즈 JPEG 수 MB 를 Node 로 옮기지 않는다.
  await dialog.getByLabel('사진 고르기').evaluate(async (el) => {
    const input = el as HTMLInputElement;
    const canvas = document.createElement('canvas');
    canvas.width = 4000;
    canvas.height = 4000;
    const ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(4000, 4000);
    for (let i = 0; i < image.data.length; i += 4) {
      image.data[i] = Math.random() * 255;
      image.data[i + 1] = Math.random() * 255;
      image.data[i + 2] = Math.random() * 255;
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', 0.3),
    );
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], 'noise.jpg', { type: 'image/jpeg' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(photoIn(dialog)).toBeVisible({ timeout: 20_000 });
  const src = await photoIn(dialog).getAttribute('src');
  expect(src).toMatch(/^data:image\/(webp|jpeg);base64,/);
  expect(src!.length).toBeLessThanOrEqual(AVATAR_MAX_CHARS);
});

test('WebP 를 인코딩하지 못하는 브라우저(강제 폴백)에서는 JPEG 로 저장한다(R4)', async ({
  page,
}) => {
  // 미지원 브라우저의 실제 동작 — `toDataURL('image/webp')` 가 PNG 를 돌려준다.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function patched(type?: string, quality?: number) {
      return original.call(this, type === 'image/webp' ? 'image/png' : type, quality);
    };
  });
  await page.reload();
  await page.waitForSelector('main#shell-main');
  const dialog = await openProfileEditor(page);
  await uploadAndSave(page, dialog, join(FIXTURES, 'avatar.png'));
  const src = await photoIn(profileCard(page)).getAttribute('src');
  expect(src).toMatch(/^data:image\/jpeg;base64,/);
  expect(src!.length).toBeLessThanOrEqual(AVATAR_MAX_CHARS);
});

test('키보드: Shift+Tab 으로 "사진 고르기" 에 닿으면 링이 label 위에 보이고 Enter 가 파일 대화상자를 연다', async ({
  page,
}) => {
  // 셸이 서기 전에는 `Mod+\` 배선이 없다 — hover-and-focus.spec 과 같은 순서로 기다린 뒤 키보드로 연다.
  await page.waitForSelector('main#shell-main');
  await page.getByRole('button', { name: '프로필 편집' }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: '프로필 편집' });
  await expect(dialog.getByLabel('이름')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  const input = dialog.getByLabel('사진 고르기');
  await expect(input).toBeFocused();
  // 링은 input(시각만 숨김)이 아니라 버튼 모양의 label 에 그려진다(§5). 계산된 스타일로 잰다(규칙 1).
  const chooser = page.waitForEvent('filechooser');
  const ring = await dialog.getByText('사진 고르기').evaluate((el) => {
    const style = getComputedStyle(el);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(ring.style).toBe('solid');
  expect(ring.width).toBe('2px');
  await page.keyboard.press('Enter');
  const opened = await chooser;
  expect(opened.isMultiple()).toBe(false);
});

test('두 기기: A 가 적은 이름이 B 의 카드에 동기화돼 보인다(sync.md R5)', async ({ browser }) => {
  const account = randomAccount();
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  await stubLogin(pageA, account);
  await stubLogin(pageB, account);
  await pageA.waitForSelector('main#shell-main');
  await pageB.waitForSelector('main#shell-main');

  const dialog = await openProfileEditor(pageA);
  await dialog.getByLabel('이름').fill(NAME);
  await dialog.getByRole('button', { name: '저장' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(profileCard(pageA)).toContainText(NAME);

  await pageB.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(profileCard(pageB)).toContainText(NAME, { timeout: 15_000 });

  await ctxA.close();
  await ctxB.close();
});
