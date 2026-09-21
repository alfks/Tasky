// 읽기 조건: 뽀모도로(timer §6-A)를 고치거나 이 테스트가 깨졌을 때.
//
// 진짜 브라우저에서 **기기별 저장 → 화면**의 왕복을 본다: 모드를 켜면 기억되는가(P1),
// 새로고침해도 휴식이 이어지는가(P4), 휴식이 끝나면 다음 집중이 저절로 시작되지는 않는가(P3).
//
// **25분을 기다리지 않는다.** 휴식은 `시작 시각 + 길이` 두 값으로만 계산되므로(P2), 시작 시각을
// 과거로 심으면 원하는 지점의 상태를 곧바로 만들 수 있다. 여기서 실시간에 매달리는 단언은 없다 —
// 심은 시각이 절대적이라 러너가 느려도 판정이 바뀌지 않는다.
//
// 셀렉터는 smoke.spec.ts 와 같이 **역할 + 접근 이름**만 쓴다.
import { expect, test } from './fixtures/stub-login';

import type { Page } from '@playwright/test';

/** 타이머의 기기별 설정·상태 키 (`timer-prefs.ts`·`pomodoro-state.ts`). */
const PREFS_KEY = 'tasky.timer.v1';
const STATE_KEY = 'tasky.pomodoro.v1';

const MEMORY_MODE_TEXT = '지금 적는 내용은 새로고침하면 사라져요';

/** 셸이 실제로 마운트됐는지 (smoke.spec.ts 와 같은 판정). */
async function waitForShell(page: Page): Promise<void> {
  await page.waitForSelector('main#shell-main');
  await expect(page.getByRole('heading', { name: 'Tasky', level: 1 })).toBeVisible();
  await expect(page.getByText(MEMORY_MODE_TEXT)).toHaveCount(0);
}

/**
 * 앱이 뜨기 **전에** 기기별 레코드를 심는다. 휴식의 시작 시각은 페이지 안에서 계산해야
 * 러너와 브라우저의 시계 차이가 끼어들지 않는다.
 *
 * **주의**: `addInitScript` 는 새로고침에서도 다시 돈다. 그래서 "화면에서 바꾼 값이 기억되는가" 를
 * 보는 테스트에서는 이것을 쓰지 않는다 — 심은 값이 매번 사용자의 선택을 덮어써 버린다.
 */
async function seed(
  page: Page,
  options: { pomodoro: boolean; breakStartedSecondsAgo?: number; plannedSeconds?: number },
): Promise<void> {
  await page.addInitScript(
    ([prefsKey, stateKey, config]) => {
      const settings = config as {
        pomodoro: boolean;
        breakStartedSecondsAgo?: number;
        plannedSeconds?: number;
      };
      localStorage.setItem(
        prefsKey as string,
        JSON.stringify({ minutes: 25, soundOff: true, pomodoro: settings.pomodoro }),
      );
      const ago = settings.breakStartedSecondsAgo;
      if (ago === undefined) {
        localStorage.removeItem(stateKey as string);
        return;
      }
      localStorage.setItem(
        stateKey as string,
        JSON.stringify({
          breakSession: {
            kind: 'short',
            startedAt: new Date(Date.now() - ago * 1000).toISOString(),
            plannedSeconds: settings.plannedSeconds ?? 300,
          },
          cycle: { date: new Date().toISOString().slice(0, 10), completed: 1 },
        }),
      );
    },
    [PREFS_KEY, STATE_KEY, options] as const,
  );
}

test.use({ viewport: { width: 1440, height: 900 } });

test('뽀모도로는 옵션이고, 켜면 파생된 휴식 길이가 보이고 기억된다 (P1)', async ({ page }) => {
  // 아무것도 심지 않은 새 브라우저다 — 기본값이 무엇인지까지 여기서 본다.
  await page.goto('/');
  await waitForShell(page);

  const toggle = page.getByRole('checkbox', { name: '뽀모도로로 집중하기' });
  // 기본은 꺼짐 — 지금까지의 단일 집중 세션이 그대로 기본 동작이다.
  await expect(toggle).not.toBeChecked();
  await expect(page.getByText('4번째마다')).toHaveCount(0);

  await toggle.check();
  // 고른 값은 여전히 집중 길이 하나이고, 파생된 분 수는 화면이 말한다.
  await expect(page.getByText('집중이 끝나면 5분 휴식 · 4번째마다 15분 휴식')).toBeVisible();

  await page.reload();
  await waitForShell(page);
  await expect(page.getByRole('checkbox', { name: '뽀모도로로 집중하기' })).toBeChecked();
});

test('진행 중인 휴식은 새로고침해도 이어진다 (P4)', async ({ page }) => {
  // 5분짜리 휴식이 2분 전에 시작됐다 → 3분 남아 있어야 한다.
  await seed(page, { pomodoro: true, breakStartedSecondsAgo: 120 });
  await page.goto('/');
  await waitForShell(page);

  const timer = page.getByRole('timer');
  await expect(timer).toHaveAccessibleName(/짧은 휴식, 3분/);
  // 패널이 접혀 있어도 알 수 있도록 헤더 칩도 휴식을 보여 준다.
  await expect(page.getByRole('button', { name: /짧은 휴식/ })).toBeVisible();

  await page.reload();
  await waitForShell(page);
  // 새로고침으로 되감기지 않는다 — 시작 시각이 원천이라 그 사이 지난 시간은 그대로 지나간다.
  await expect(page.getByRole('timer')).toHaveAccessibleName(/짧은 휴식, [12]분/);
});

test('휴식이 끝나도 다음 집중은 사용자가 눌러야 시작된다 (P3)', async ({ page }) => {
  // 5분짜리 휴식이 5분 10초 전에 시작됐다 → 끝난 지 10초(2분 이내)라 카드가 뜬다.
  await seed(page, { pomodoro: true, breakStartedSecondsAgo: 310 });
  await page.goto('/');
  await waitForShell(page);

  const card = page.getByRole('alertdialog', { name: '짧은 휴식 끝!' });
  await expect(card).toBeVisible();
  // 카드가 떠 있는 동안 타이머는 돌지 않는다 — 하지 않은 집중이 기록되지 않는다.
  await expect(page.getByRole('timer')).toHaveCount(0);

  await page.getByRole('button', { name: '다음 집중 시작' }).click();
  await expect(page.getByRole('timer')).toHaveAccessibleName(/집중 타이머, 2[45]분/);
  await expect(card).toHaveCount(0);
});
