// 읽기 조건: 통계 화면(`src/features/reports/`)의 추이 막대·히트맵 대체 표를 고칠 때.
//
// 재는 것은 **실제 브라우저 레이아웃에서만 드러나는 것** 하나다: 대체 `<table class="sr-only">`
// 가 실제로 접히는가. jsdom 단위 테스트는 레이아웃을 계산하지 않아 `sr-only` 의 `width/height:1px`
// 가 `display:table` 박스엔 최소값으로만 먹혀 표가 안 접히는 버그(design review 라운드2 M5,
// Blocker)를 구조(클래스 유무) 단정만으로는 못 잡는다 — 실측: 라운드2 1차 수정(`flex-1` 제거)이
// 구조 테스트는 초록불을 냈는데 실브라우저 `documentElement.scrollHeight` 는 여전히 900 → 5805
// (올해)까지 부풀었다. 그래서 여기서 **문서 높이**를 실제로 잰다.
//
// 데이터는 UI 경로로만 만든다(tests/AGENTS.md 규칙3) — 표 행 수는 기간의 날 수(`periodDays.length`)
// 로 정해지므로(TrendChart 는 데이터가 없는 날도 표에 "기록 없음" 행을 낸다) 투두 하나만 있어도
// "이 기간에 기록이 없어요" 빈 상태를 벗어나 표 전체가 그려진다 — 대량 시드가 필요 없다.
import { expect, test } from './fixtures/stub-login';

import type { Page } from '@playwright/test';

const CATEGORY = '공부';

async function waitForShell(page: Page): Promise<void> {
  await page.waitForSelector('main#shell-main');
  await expect(page.getByRole('heading', { name: 'Tasky', level: 1 })).toBeVisible();
}

async function createCategory(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: '+ 카테고리 추가' }).click();
  const dialog = page.getByRole('dialog', { name: '카테고리 만들기' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('이름').fill(name);
  await dialog.getByRole('button', { name: '만들기' }).click();
  await expect(dialog).toHaveCount(0);
}

async function addTodo(page: Page, categoryName: string, title: string): Promise<void> {
  const group = page.getByRole('region', { name: categoryName });
  await group.getByRole('button', { name: '+ 할 일 추가' }).click();
  const input = page.getByRole('textbox', { name: `${categoryName}에 할 일 추가` });
  await input.fill(title);
  await page.keyboard.press('Enter');
  await expect(group.getByRole('checkbox', { name: title })).toBeVisible();
}

/** 팔레트로 통계 화면을 연다("통계 보기" 명령). */
async function openReports(page: Page): Promise<void> {
  await page.keyboard.press('Control+k');
  const list = page.getByRole('listbox', { name: '명령과 할 일' });
  await expect(list.getByRole('option').first()).toBeVisible();
  await list.getByRole('option', { name: /통계 보기/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: '통계' })).toBeVisible();
}

test('통계를 "올해"로 열어도 문서 높이가 비정상으로 늘지 않는다(design review 라운드2 M5, Blocker)', async ({
  page,
}) => {
  await page.goto('/');
  await waitForShell(page);
  await createCategory(page, CATEGORY);
  await addTodo(page, CATEGORY, '수학 문제 풀기');

  const closedHeight = await page.evaluate(() => document.documentElement.scrollHeight);

  await openReports(page);
  const trendImg = page.getByRole('img', { name: /^최근 \d+일 평균 달성률/ });
  await expect(trendImg).toBeVisible();
  const last7Label = await trendImg.getAttribute('aria-label'); // "최근 7일 평균 달성률 …"
  const last7Height = await page.evaluate(() => document.documentElement.scrollHeight);

  await page.getByText('올해', { exact: true }).click();
  // review m17(SWR) 때문에 카드 제목·틀은 그대로다 — 실제로 새 기간(365개 안팎)의 trend 표로
  // 다시 그려졌는지는 role=img 의 접근 이름이 "최근 N일"의 N 으로 바뀌는 것으로 확인한다.
  await expect.poll(async () => trendImg.getAttribute('aria-label')).not.toBe(last7Label);
  const thisYearHeight = await page.evaluate(() => document.documentElement.scrollHeight);

  // review 라운드2 M5 실측 재현 수치: 고쳐지기 전엔 열기 전 900 → 지난 7일 2383 → 올해 5805 로,
  // "올해" 가 "지난 7일" 의 2.4배를 넘었다(3000px 내리면 완전 백지 스크린샷까지 났다). 고친 뒤엔
  // `<main>` 이 자기 콘텐츠를 내부 스크롤로 담아 documentElement 자체는 거의 그대로다.
  const RATIO_THRESHOLD = 1.5;
  expect(thisYearHeight).toBeLessThanOrEqual(last7Height * RATIO_THRESHOLD);
  // 더 엄격한 불변식도 함께 잰다 — 셸은 뷰포트에 고정돼 있어(CLAUDE.md), 리포트 카드가 무엇을
  // 그리든 문서 자체는 통계를 열기 전과 사실상 같아야 한다(`<main>` 내부 스크롤이 전부 담는다).
  expect(thisYearHeight).toBeLessThanOrEqual(closedHeight * RATIO_THRESHOLD);

  // nit2 — m18 의 유일한 단위 테스트는 `whitespace-nowrap` 클래스 유무만 세는 구조 단정이라
  // 라운드2 의 거짓 초록불과 같은 모양이다. 여기서는 클래스가 아니라 **렌더된 박스**를 잰다:
  // 월 눈금("10월")이 실제로 한 줄(≈10px)인지, 서로 겹치지 않는지.
  const tickBoxes = await trendImg.locator('span').evaluateAll((spans) =>
    spans
      .filter((s) => (s.textContent ?? '').trim() !== '')
      .map((s) => {
        const r = s.getBoundingClientRect();
        return { text: s.textContent, x: r.x, width: r.width, height: r.height };
      }),
  );
  expect(tickBoxes.length).toBeGreaterThan(0); // 올해(365일 안팎)엔 월 눈금이 여러 개 찍힌다
  for (const box of tickBoxes) {
    // 두 줄로 접히면("1"/"월") 높이가 거의 두 배로 뛴다 — 한 줄(10px 폰트 + leading-none) 근처인지.
    expect(box.height, `"${box.text}" 의 높이`).toBeLessThanOrEqual(16);
  }
  const byX = [...tickBoxes].sort((a, b) => a.x - b.x);
  for (let i = 1; i < byX.length; i++) {
    const prev = byX[i - 1]!;
    const cur = byX[i]!;
    expect(cur.x, `"${prev.text}" 다음 "${cur.text}" 가 겹치지 않는다`).toBeGreaterThanOrEqual(
      prev.x + prev.width,
    );
  }
});
