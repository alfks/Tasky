// 앱이 실제로 뜨는지만 확인하는 스모크. 기능 시나리오는 기능 티켓에서 추가한다.
import { expect, test } from '@playwright/test';

test('앱을 열면 제목이 보인다', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tasky' })).toBeVisible();
});
