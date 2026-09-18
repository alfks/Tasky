// 읽기 조건: 카테고리 이모지 피커(category.md R4-a)를 건드릴 때, 또는 이 스펙이 빨간불일 때.
//
// 왜 e2e 인가, 둘이다.
//  1. **선택 표시는 계산된 CSS 로만 존재한다.** jsdom 은 CSS 를 계산하지 않아 단위 테스트가 잴 수
//     있는 것은 클래스 문자열뿐이고, 그 단언은 링을 통째로 지워도 초록불이었다(T-46 실측:
//     세 파일에서 링을 지워도 1936/1936 통과). `selection-ring.spec.ts` 가 푼 함정을 여기서도
//     같은 방식으로 푼다 — 프로덕션 빌드 + 진짜 CSS 위에서 `getComputedStyle` 을 읽는다.
//  2. **저장 경로는 화면으로 확인되지 않는다.** 낙관적 갱신이 있어 "고르면 보인다" 는 저장 없이도
//     참이다. 새로고침 뒤 다시 열어 그 칸이 여전히 골라져 있는지를 본다 — IndexedDB 를 거쳐 돌아온
//     값만 그 단언을 통과한다.
//
// 헬퍼는 `selection-ring.spec.ts` 의 것과 같은 모양이지만 **복사본**이다: 그 파일은 다른 티켓과
// 공유하는 자리라 export 를 추가하려면 그쪽을 건드려야 한다. 재는 대상이 달라 함께 움직일 이유도 없다.
import { expect, test } from '@playwright/test';

import type { Locator, Page } from '@playwright/test';

/** `StorageFailureCard.MEMORY_MODE_BANNER_TEXT`. 메모리 모드면 새로고침 유지를 잴 수 없다. */
const MEMORY_MODE_TEXT = '지금 적는 내용은 새로고침하면 사라져요';

async function waitForShell(page: Page): Promise<void> {
  await page.waitForSelector('main#shell-main');
  await expect(page.getByRole('heading', { name: 'Tasky', level: 1 })).toBeVisible();
  await expect(page.getByText(MEMORY_MODE_TEXT)).toHaveCount(0);
}

/** 토큰을 **런타임에 해석된 색**으로 읽는다(사용자 지정 속성의 계산값은 적힌 그대로라 비교가 안 된다). */
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

/** 길이 토큰도 같은 방식으로. 테두리 폭에 실어 `2px` 같은 절대값을 받는다. */
function resolveLength(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement('span');
    probe.style.cssText = `position:absolute;visibility:hidden;border-style:solid;border-top-width:var(${name})`;
    document.body.append(probe);
    const width = getComputedStyle(probe).borderTopWidth;
    probe.remove();
    return width;
  }, token);
}

/**
 * 이모지 칸의 **보이는 표시**는 `aria-hidden` 인 자식이다(같은 정보가 라디오의 상태로 이미 있어
 * 이중 낭독을 피한 결과 — 색 스와치와 같은 구조). 역할이 없으니 접근 이름으로 주소를 매길 수 없어,
 * 여기서만 라디오에서 자식 한 칸을 내려간다.
 */
function markerBorderOf(radio: Locator): Promise<{ color: string; width: string }> {
  return radio.evaluate((element) => {
    const marker = element.firstElementChild;
    if (marker === null) throw new Error('선택 표시를 그리는 요소가 없다.');
    const style = getComputedStyle(marker);
    return { color: style.borderTopColor, width: style.borderTopWidth };
  });
}

/** 카테고리 만들기 다이얼로그를 열고 이모지 라디오 그룹을 돌려준다. */
async function openEmojiPicker(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: '+ 카테고리 추가' }).click();
  const dialog = page.getByRole('dialog', { name: '카테고리 만들기' });
  await expect(dialog).toBeVisible();
  return dialog.getByRole('radiogroup', { name: '이모지' });
}

test.describe('카테고리 이모지 피커 (category.md R4-a)', () => {
  test.use({ colorScheme: 'light' });

  test('고른 칸에 앱 공통 잉크 링이 진다 (theme R19)', async ({ page }) => {
    await page.goto('/');
    await waitForShell(page);

    const picker = await openEmojiPicker(page);
    // 처음엔 "없음" 이 골라져 있다 — 고르지 않음도 하나의 칸이다.
    await expect(picker.getByRole('radio', { name: '없음' })).toBeChecked();

    await picker.getByRole('radio', { name: '커피' }).click();
    const selected = picker.getByRole('radio', { checked: true });
    await expect(selected).toHaveCount(1);
    await expect(picker.getByRole('radio', { name: '커피' })).toBeChecked();

    const border = await markerBorderOf(selected);
    expect(border.color).toBe(await resolveColor(page, '--color-selected-ring'));
    expect(border.width).toBe(await resolveLength(page, '--control-selected-ring'));

    // 고르지 않은 칸에는 그 굵기가 없다 — 모든 칸에 두르면 "선택" 을 말하지 못한다.
    const other = await markerBorderOf(picker.getByRole('radio', { name: '책' }));
    expect(Number.parseFloat(other.width)).toBeLessThan(Number.parseFloat(border.width));
  });

  test('키보드만으로 고를 수 있다', async ({ page }) => {
    await page.goto('/');
    await waitForShell(page);

    const picker = await openEmojiPicker(page);
    // 탭 진입점은 골라진 칸 하나("없음")다. 거기서 오른쪽 한 칸이 목록의 첫 이모지(📝 메모).
    await picker.getByRole('radio', { name: '없음' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(picker.getByRole('radio', { name: '메모' })).toBeChecked();
    // 아래는 한 줄(6칸) 건너뛴다.
    await page.keyboard.press('ArrowDown');
    await expect(picker.getByRole('radio', { name: '달리기' })).toBeChecked();
  });

  // NC-1 이 겨냥하는 경로: 화면이 아니라 **저장소에 남았는가**. 새로고침 뒤 다시 열어 확인한다.
  test('고른 이모지가 새로고침 뒤에도 남아 있다', async ({ page }) => {
    await page.goto('/');
    await waitForShell(page);

    const picker = await openEmojiPicker(page);
    await picker.getByRole('radio', { name: '커피' }).click();
    const dialog = page.getByRole('dialog', { name: '카테고리 만들기' });
    await dialog.getByLabel('이름').fill('커피타임');
    await dialog.getByRole('button', { name: '만들기' }).click();
    await expect(dialog).toHaveCount(0);

    await page.reload();
    await waitForShell(page);

    await page.getByRole('button', { name: '커피타임 메뉴' }).click();
    await page.getByRole('menuitem', { name: '수정' }).click();
    const editing = page.getByRole('dialog', { name: '카테고리 수정' });
    await expect(editing).toBeVisible();
    await expect(
      editing.getByRole('radiogroup', { name: '이모지' }).getByRole('radio', { name: '커피' }),
    ).toBeChecked();
  });
});
