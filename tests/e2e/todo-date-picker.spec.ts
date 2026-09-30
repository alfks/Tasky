// 읽기 조건: 일 피커(calendar-layout.md §3-A, todo.md R10-b·c)를 고치거나 이 스펙이 빨간불일 때.
//
// 재는 것: (1) 항목 메뉴 "날짜 바꾸기…" → `grid "날짜 고르기"` → [다음 달] → 칸 확정 → "…로 옮겼어요"
// 토스트 → 오늘 목록에서 사라짐 → [되돌리기] 로 복귀. (2) 편집 패널의 날짜 버튼 → [내일] → [저장]
// → 다음 날 목록에 있음. 피커 본문은 지연 로드 청크라 첫 클릭 뒤 동적 import 가 풀리길 실제로
// 기다려야 하는 것도 이 스펙만이 잰다(jsdom 단위 테스트는 번들 분리 자체가 일어나지 않는다).
//
// 셀렉터는 `tests/AGENTS.md` 규칙대로 역할 + 접근 이름만 쓴다. 피커 격자의 이름 "날짜 고르기" 는
// 스트립의 "날짜 선택" 과 일부러 다르다 — 둘이 같은 화면에 있다.
import { expect, test } from './fixtures/stub-login';
import { createCategory } from './sidebar';

import type { Locator, Page } from '@playwright/test';

/** `StorageFailureCard.MEMORY_MODE_BANNER_TEXT`. 메모리 모드면 화면 구성이 달라진다. */
const MEMORY_MODE_TEXT = '지금 적는 내용은 새로고침하면 사라져요';
const CATEGORY = '공부';
const TITLE = '책 읽기';

async function waitForShell(page: Page): Promise<void> {
  await page.waitForSelector('main#shell-main');
  await expect(page.getByRole('heading', { name: 'Tasky', level: 1 })).toBeVisible();
  await expect(page.getByText(MEMORY_MODE_TEXT)).toHaveCount(0);
}

/** 카테고리 하나를 만들고 그 그룹에 할 일 하나를 넣는다. 그룹 로케이터를 돌려준다. */
async function seedTodo(page: Page): Promise<Locator> {
  await createCategory(page, CATEGORY);
  const group = page.getByRole('region', { name: CATEGORY });
  await group.getByRole('button', { name: '+ 할 일 추가' }).click();
  const input = page.getByRole('textbox', { name: `${CATEGORY}에 할 일 추가` });
  await input.fill(TITLE);
  await input.press('Enter');
  await expect(group.getByRole('checkbox', { name: TITLE })).toBeVisible();
  return group;
}

/** 오늘 + 1 의 'M월 D일' — 앱은 항상 오늘로 시작하므로(date-strip R2) 기대값도 실제 시계로 만든다. */
function tomorrowLabel(): string {
  const at = new Date();
  at.setDate(at.getDate() + 1);
  return `${at.getMonth() + 1}월 ${at.getDate()}일`;
}

test('항목 메뉴 → 날짜 고르기 → 다음 달 → 칸 확정 → 옮겼어요 토스트 → 되돌리기', async ({
  page,
}) => {
  await page.goto('/');
  await waitForShell(page);
  const group = await seedTodo(page);

  await group.getByRole('button', { name: TITLE, exact: true }).click();
  await page.getByRole('menuitem', { name: '날짜 바꾸기…', exact: true }).click();

  const picker = page.getByRole('grid', { name: '날짜 고르기' });
  await expect(picker).toBeVisible();
  await expect(page.getByText(`'${TITLE}'를 어느 날로 옮길까요?`)).toBeVisible();

  // 주 보기의 스트립 헤더는 `이전 주`/`다음 주` 라 `다음 달` 은 지금 피커 안에만 있다(date-strip R14).
  await page.getByRole('button', { name: '다음 달', exact: true }).click();
  // 어느 달이든 격자에 15일은 그 달 것 하나뿐이다(이 달 밖 칸은 25~31·1~6일뿐이다).
  const target = picker.getByRole('gridcell', { name: /^\d{1,2}월 15일 / });
  const targetName = await target.getAttribute('aria-label');
  await target.click();

  // 확정 → 피커가 닫히고 토스트가 그 날짜를 말한다.
  await expect(picker).toHaveCount(0);
  const dayLabel = targetName?.match(/^\d{1,2}월 15일/)?.[0] ?? '';
  const toast = page.getByRole('status').filter({ hasText: `${dayLabel}로 옮겼어요` });
  await expect(toast).toBeVisible();
  await expect(group.getByRole('checkbox', { name: TITLE })).toHaveCount(0);

  // 되돌리기 → 오늘 목록으로 돌아온다.
  await toast.getByRole('button', { name: '되돌리기' }).click();
  await expect(group.getByRole('checkbox', { name: TITLE })).toBeVisible();
});

test('편집 패널 → 날짜 버튼 → 내일 → 저장 → 다음 날 목록에 있다', async ({ page }) => {
  await page.goto('/');
  await waitForShell(page);
  const group = await seedTodo(page);

  await group.getByRole('button', { name: TITLE, exact: true }).click();
  await page.getByRole('menuitem', { name: '수정', exact: true }).click();
  const panel = group.getByRole('group', { name: `${TITLE} 편집` });
  await expect(panel).toBeVisible();

  const dateButton = panel.getByRole('button', { name: /^날짜 / });
  await dateButton.click();
  const picker = page.getByRole('grid', { name: '날짜 고르기' });
  await expect(picker).toBeVisible();
  // 편집 패널에서 연 피커에는 "옮길까요" 힌트가 없다.
  await expect(page.getByText(/어느 날로 옮길까요/)).toHaveCount(0);

  await page.getByRole('button', { name: '내일', exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(dateButton).toBeFocused();
  // 고르기만 해서는 옮겨지지 않는다 — 아직 오늘 목록에 있다.
  await expect(group.getByRole('checkbox', { name: TITLE })).toBeVisible();

  await panel.getByRole('button', { name: '저장' }).click();
  await expect(group.getByRole('checkbox', { name: TITLE })).toHaveCount(0);

  // 내일로 이동해 확인한다. 오늘이 일요일이면 내일은 다음 주라 한 칸 넘긴다.
  const strip = page.getByRole('radiogroup', { name: '날짜 선택' });
  const tomorrow = strip.getByRole('radio', { name: new RegExp(`^${tomorrowLabel()} `) });
  if ((await tomorrow.count()) === 0) {
    await page.getByRole('button', { name: '다음 주', exact: true }).click();
  }
  await tomorrow.click();
  await expect(group.getByRole('checkbox', { name: TITLE })).toBeVisible();
});
