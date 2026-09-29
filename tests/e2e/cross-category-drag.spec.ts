// 읽기 조건: 카테고리 간 드래그(todo.md R20)를 고치거나, 그룹 섹션·손잡이의 접근 이름을 바꿔
// 이 테스트가 깨졌을 때.
//
// **실제 마우스 드래그는 여기서만 검사된다.** jsdom 에는 레이아웃도 `DataTransfer` 도 없어서
// 단위 테스트가 재는 것은 "드롭이 어떤 값으로 스토어에 닿는가" 까지다. 두 제스처(같은 그룹 순서
// 변경 / 다른 카테고리로 이동)가 **한 화면에서 갈리는지**는 브라우저에서만 드러난다.
//
// 이동이 저장까지 갔는지는 **새로고침 뒤**에 잰다 — 화면만 보면 낙관적 갱신이 저장 실패를 가린다.
import { expect, test } from './fixtures/stub-login';
import { closeSidebarDrawer, createCategoryInDialog, openSidebarDrawer } from './sidebar';

import type { Locator, Page } from '@playwright/test';

/** 메모리 모드 배너 문구(`StorageFailureCard.MEMORY_MODE_BANNER_TEXT`). */
const MEMORY_MODE_TEXT = '지금 적는 내용은 새로고침하면 사라져요';

const 공부 = '공부';
const 운동 = '운동';

async function waitForShell(page: Page): Promise<void> {
  await page.waitForSelector('main#shell-main');
  await expect(page.getByRole('heading', { name: 'Tasky', level: 1 })).toBeVisible();
  // 메모리 구현으로 내려간 상태에서 "새로고침해도 남는다" 를 재면 거짓 기록이 된다.
  await expect(page.getByText(MEMORY_MODE_TEXT)).toHaveCount(0);
}

/** 그룹의 입력 행으로 할 일을 넣는다(UI 경로 그대로 — 데이터를 심지 않는다). */
async function addTodo(page: Page, category: string, title: string): Promise<void> {
  const group = page.getByRole('region', { name: category });
  await group.getByRole('button', { name: '+ 할 일 추가' }).click();
  const input = page.getByRole('textbox', { name: `${category}에 할 일 추가` });
  await input.fill(title);
  await page.keyboard.press('Enter');
  await expect(group.getByRole('checkbox', { name: title })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(input).toHaveCount(0);
}

function group(page: Page, name: string): Locator {
  return page.getByRole('region', { name });
}

/** 항목의 드래그 손잡이. 드래그는 여기서만 시작한다(R11). */
function handle(page: Page, title: string): Locator {
  return page.getByRole('button', { name: `${title} 순서 변경 (Alt+위/아래)` });
}

/**
 * 그 그룹의 할 일 제목을 화면 순서대로. 체크박스의 접근 이름은 `aria-labelledby` 로 **제목 버튼**을
 * 가리키므로(§5) 그 요소의 글자를 따라간다 — 속성 하나만 읽으면 전부 빈 문자열이 된다.
 */
async function titles(page: Page, category: string): Promise<string[]> {
  return group(page, category)
    .getByRole('checkbox')
    .evaluateAll((boxes) =>
      boxes.map(
        (box) =>
          document.getElementById(box.getAttribute('aria-labelledby') ?? '')?.textContent ?? '',
      ),
    );
}

/**
 * 카테고리 둘과 할 일 하나(공부)를 만든다. 카테고리 생성은 드로어 경유다(calendar-layout.md
 * §1-A) — 드로어를 열어 둘 다 만들고, 이후 할 일 조작은 메인 패널 몫이라 닫는다.
 */
async function setup(page: Page, title: string): Promise<void> {
  await page.goto('/');
  await waitForShell(page);
  const drawer = await openSidebarDrawer(page);
  await createCategoryInDialog(page, 공부);
  await createCategoryInDialog(page, 운동);
  await closeSidebarDrawer(page, drawer);
  await addTodo(page, 공부, title);
}

test('다른 카테고리 그룹에 떨어뜨리면 그 카테고리로 옮겨지고 새로고침해도 남는다', async ({
  page,
}) => {
  const 할일 = '수학 문제 풀기';
  await setup(page, 할일);

  await handle(page, 할일).dragTo(group(page, 운동));

  await expect(group(page, 운동).getByRole('checkbox', { name: 할일 })).toBeVisible();
  await expect(group(page, 공부).getByRole('checkbox')).toHaveCount(0);
  await expect(group(page, 공부).getByRole('button', { name: '+ 할 일 추가' })).toBeVisible();
  await expect(group(page, 공부).getByRole('listitem')).toHaveCount(1);

  // 저장까지 갔는가. 낙관적 갱신이 아니어도 화면만 보면 "옮겨 보이는데 저장은 안 된" 상태를 놓친다.
  await page.reload();
  await waitForShell(page);
  await expect(group(page, 운동).getByRole('checkbox', { name: 할일 })).toBeVisible();
  await expect(group(page, 공부).getByRole('checkbox')).toHaveCount(0);
});

test('되돌리기 토스트가 원래 카테고리로 되돌린다', async ({ page }) => {
  const 할일 = '영어 단어 외우기';
  await setup(page, 할일);

  await handle(page, 할일).dragTo(group(page, 운동));
  await expect(page.getByText(`${운동} 카테고리로 옮겼어요`)).toBeVisible();

  await page.getByRole('button', { name: '되돌리기' }).click();

  await expect(group(page, 공부).getByRole('checkbox', { name: 할일 })).toBeVisible();
  await expect(group(page, 운동).getByRole('checkbox')).toHaveCount(0);

  await page.reload();
  await waitForShell(page);
  await expect(group(page, 공부).getByRole('checkbox', { name: 할일 })).toBeVisible();
});

test('같은 그룹 안에서는 지금처럼 순서만 바뀐다 (R11 회귀)', async ({ page }) => {
  const 첫째 = '수학 문제 풀기';
  const 둘째 = '영어 단어 외우기';
  await setup(page, 첫째);
  await addTodo(page, 공부, 둘째);
  expect(await titles(page, 공부)).toEqual([첫째, 둘째]);

  // 첫 행의 **위쪽**에 떨어뜨린다. 정중앙은 중간점과 같은 값이라 앞/뒤 판정이 반올림에 걸린다.
  await handle(page, 둘째).dragTo(handle(page, 첫째), { targetPosition: { x: 8, y: 2 } });

  await expect.poll(async () => titles(page, 공부)).toEqual([둘째, 첫째]);
  // 카테고리는 그대로다 — 같은 그룹 드래그가 이동으로 새 나가면 여기서 걸린다.
  await expect(group(page, 운동).getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByText(`${운동} 카테고리로 옮겼어요`)).toHaveCount(0);

  await page.reload();
  await waitForShell(page);
  await expect.poll(async () => titles(page, 공부)).toEqual([둘째, 첫째]);
});
