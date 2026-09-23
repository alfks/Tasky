// 읽기 조건: 년·월 피커(calendar-layout.md §3 R15~R19)를 고치거나 이 스펙이 빨간불일 때.
//
// 재는 것: 월 표시 버튼 → 피커 → [다음 해] → [3월] 확정까지 실제 브라우저에서 한 번에 되고,
// 확정 뒤 팝오버가 닫히며 포커스가 월 표시 버튼으로 돌아오는가(calendar-layout.md §6).
// 지연 로드(lazy())로 받는 청크라 첫 클릭 뒤 동적 import 가 풀리길 실제로 기다려야 하는 것도
// 이 스펙만이 잴 수 있다 — jsdom 단위 테스트는 번들 분리 자체가 일어나지 않는다.
//
// 셀렉터는 `tests/AGENTS.md` 규칙대로 역할 + 접근 이름만 쓴다(클래스·색 0건).
import { expect, test } from './fixtures/stub-login';

import type { Page } from '@playwright/test';

/** `StorageFailureCard.MEMORY_MODE_BANNER_TEXT`. 메모리 모드면 화면 구성이 달라진다. */
const MEMORY_MODE_TEXT = '지금 적는 내용은 새로고침하면 사라져요';

async function waitForShell(page: Page): Promise<void> {
  await page.waitForSelector('main#shell-main');
  await expect(page.getByRole('heading', { name: 'Tasky', level: 1 })).toBeVisible();
  await expect(page.getByText(MEMORY_MODE_TEXT)).toHaveCount(0);
}

test('월 표시 → 피커 → 다음 해 → 3월 확정 → 월 표시가 바뀌고 포커스가 돌아온다', async ({
  page,
}) => {
  await page.goto('/');
  await waitForShell(page);

  // 앱이 항상 오늘로 시작하므로(date-strip.md R2) 현재 해를 기준으로 기대값을 만든다 —
  // 특정 연도를 하드코딩하면 이 스펙이 해가 바뀔 때마다 저절로 낡는다.
  const currentYear = new Date().getFullYear();
  const monthButton = page.getByRole('button', { name: /^\d{4}년 \d{1,2}월$/ });
  await expect(monthButton).toBeVisible();

  await monthButton.click();
  const picker = page.getByRole('radiogroup', { name: '월 선택' });
  await expect(picker).toBeVisible();

  await page.getByRole('button', { name: '다음 해' }).click();
  await page.getByRole('radio', { name: '3월' }).click();

  // 확정되면 팝오버가 닫힌다.
  await expect(picker).toHaveCount(0);
  // 일 유지 규칙(R15)은 lib 단위 테스트가 이미 재므로, 여기서는 년·월만 확인한다.
  await expect(monthButton).toHaveAccessibleName(`${currentYear + 1}년 3월`);
  await expect(monthButton).toBeFocused();
});
