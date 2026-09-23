// 읽기 조건: 사이드바 드로어(calendar-layout.md §1-A)를 여닫는 e2e 헬퍼를 새로 쓰거나 바꿀 때.
//
// 사이드바가 **모든 폭에서 드로어 기본**이 되면서(WU-3), 카테고리 목록·"+ 카테고리 추가"·계정
// 블록("계정 삭제"·"다른 기기 모두 로그아웃")·백업/복원 버튼이 전부 `nav`(ShellSidebar) 안으로
// 들어갔고, 그 `nav` 는 드로어가 열려 있는 동안만 DOM 에 있다(smoke.spec.ts 가 먼저 겪은 문제,
// calendar-layout.md §1-A). 그 `nav` 를 건드리는 **모든** 스펙이 같은 여닫기 코드를 복사하지
// 않도록 여기 한 곳에 모은다.
//
// 드로어가 열린 동안 `Dialog.tsx#makeBackgroundInert` 가 배경(메인 패널 포함)에 `inert` 를 걸어
// 접근성 트리에서 걷어낸다 — 그래서 메인 패널(할 일 목록)을 조작하기 **전에는 반드시 드로어를
// 닫아야** 한다(`closeSidebarDrawer`). 반대로 사이드바 행(카테고리 목록·손잡이·계정 블록)을
// 조작하는 동안에는 드로어가 계속 열려 있어야 한다.
import { expect } from '@playwright/test';

import type { Locator, Page } from '@playwright/test';

/**
 * 사이드바 드로어를 연다. 돌려주는 것은 그 드로어 `dialog` — 호출부가 닫을 때(`closeSidebarDrawer`)
 * 같은 로케이터로 잰다.
 *
 * `via`(기본 `'pointer'`) — 무엇으로 여는지가 **뒤이은 포커스 단언에 영향을 준다**(실측,
 * hover-and-focus.spec.ts "포커스 링" 회귀). 크로미움의 `:focus-visible` 은 "가장 최근 입력이
 * 포인터였는가"를 본다 — `'카테고리 열기'` 버튼을 **마우스로 클릭**하면 그 뒤 같은 화면의 다른
 * 버튼에 스크립트로 `.focus()` 를 걸어도(Playwright 의 `locator.focus()`) 링이 뜨지 않는다(실측:
 * `outline-style: none` 그대로, `:focus-visible` 이 거짓). `'keyboard'`(`Mod+\`, 이미 있는 배선 —
 * calendar-layout.md §1-A)로 열면 입력 양상이 키보드로 유지돼 뒤이은 `.focus()` 도 정상적으로
 * 링을 켠다(실측 확인). 포커스 링 자체를 재는 테스트만 `'keyboard'` 를 쓰고, 나머지는 기본값을
 * 그대로 둔다.
 */
export async function openSidebarDrawer(
  page: Page,
  via: 'pointer' | 'keyboard' = 'pointer',
): Promise<Locator> {
  if (via === 'keyboard') {
    await page.keyboard.press('Control+Backslash');
  } else {
    await page.getByRole('button', { name: '카테고리 열기' }).click();
  }
  const drawer = page.getByRole('dialog', { name: 'Tasky', exact: true });
  await expect(drawer).toBeVisible();
  return drawer;
}

/**
 * `openSidebarDrawer` 가 돌려준 드로어를 Esc 로 닫는다. 메인 패널(할 일 목록)을 조작하기 전에는
 * 반드시 이걸 거쳐야 한다 — 열려 있는 동안 배경이 `inert` 라 그 안의 요소는 역할로 찾을 수 없다.
 */
export async function closeSidebarDrawer(page: Page, drawer: Locator): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
}

/**
 * 카테고리 만들기 다이얼로그를 열고 채워 제출한다 — **드로어가 이미 열려 있다고 전제한다**
 * ("+ 카테고리 추가" 는 `nav` 안에 있다). 드로어를 계속 열어 둬야 하는 호출부
 * (`category-reorder.spec.ts` 의 사이드바 드래그 등)를 위해 드로어를 닫지 않는다 — 닫는 것은
 * 호출부가 `closeSidebarDrawer` 로 직접 한다.
 */
export async function createCategoryInDialog(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: '+ 카테고리 추가' }).click();
  const dialog = page.getByRole('dialog', { name: '카테고리 만들기' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('이름').fill(name);
  await dialog.getByRole('button', { name: '만들기' }).click();
  await expect(dialog).toHaveCount(0);
}

/**
 * 가장 흔한 모양: 드로어를 열고 → 카테고리 하나를 만들고 → 드로어를 닫는다. 이후 메인 패널
 * (할 일 목록)만 조작하는 대부분의 스펙이 이걸 쓴다.
 */
export async function createCategory(page: Page, name: string): Promise<void> {
  const drawer = await openSidebarDrawer(page);
  await createCategoryInDialog(page, name);
  await closeSidebarDrawer(page, drawer);
}
