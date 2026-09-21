// 읽기 조건: 동기화 흐름(로그인·엔진·계정 블록·계정 삭제 안내)을 고칠 때.
//
// 실제 Worker(로컬 wrangler dev + D1)와 두 브라우저 **컨텍스트**("기기 둘")로 왕복한다 — 같은
// 컨텍스트의 두 탭은 쿠키·IndexedDB 를 공유하는 같은 기기라 동기화를 재현하지 못한다
// (tests/AGENTS.md 규칙 3 의 다기기 버전).
//
// **"두 기기, 같은 계정" 을 두 번째 `stubLogin` 으로 만들지 않는다.** 실측(이 스펙을 처음 짤 때
// 드러남): `worker/auth/handlers.ts#handleCallback`·`worker/auth/stub.ts#handleStubLogin` 둘 다
// 새 로그인마다 `DELETE FROM sessions WHERE sub = ?` 를 **무조건** 먼저 돌린다 — 계정 재가입이
// 탈취된 옛 세션을 되살리지 못하게 막는 조치인데, 부작용으로 **같은 계정의 다른 기기 로그인도
// 함께 죽는다**(재현: A 로그인 → B 로그인 → A 의 쿠키로 `/api/me` 가 즉시 401). `sessions` 테이블에
// `device_id` 컬럼조차 없다(0001_init.sql) — 세션은 애초에 기기별로 분리되지 않는다. 이건
// `worker/**`(T-93 owns) 의 동작이라 여기서 고치지 않고, 대신 **한 번만 로그인한 세션 쿠키를
// 둘째 컨텍스트에 그대로 복사**해 "같은 계정, 두 기기"를 흉내낸다 — `deviceId`(동기화 프로토콜의
// 기기 구분자, `entities.device_id`)는 클라이언트 `syncState`가 스스로 만드는 값이라 세션과
// 무관하고, 두 컨텍스트의 IndexedDB 는 어차피 따로다. **이 셋업 자체가 실제 제품의 한계를 가린다
// 는 뜻이다 — PR 본문·보고에 남긴다.**
//
// 이 파일은 `@playwright/test` 를 **직접** 쓴다(`./fixtures/stub-login` 의 `test` 가 아니다) —
// 그 fixture 는 `page` 를 건드리기 전에 자동으로 로그인시키는데, 아래 시나리오는 무쿠키 상태를
// 직접 검증해야 해서 자동 로그인이 방해가 된다. 대신 그 파일의 `randomAccount`/`stubLogin`
// 헬퍼만 가져다 쓴다.
import { execFileSync } from 'node:child_process';

import { expect, test } from '@playwright/test';

import { randomAccount, stubLogin } from './fixtures/stub-login';

import type { BrowserContext, Page } from '@playwright/test';

const CATEGORY = '동기화 확인';
const TODO = '두 기기 확인';
const SESSION_COOKIE = 'tasky_session';
/** 첫 실행 시드(category R18, `SEED_CATEGORY.name`)의 카테고리 이름 — 그 상수를 그대로 가져오면
 * 도메인 계층을 이 스펙이 import 하게 되므로, 여기서는 리터럴로만 맞춘다. */
const SEED_CATEGORY_NAME = 'todo';

async function waitForShell(page: Page): Promise<void> {
  await page.waitForSelector('main#shell-main');
  await expect(page.getByRole('heading', { name: 'Tasky', level: 1 })).toBeVisible();
}

/** A 가 이미 로그인한 세션 쿠키를 B 컨텍스트에 그대로 심는다(위 머리주석 — 둘째 기기가 새로
 * 로그인하면 첫째 기기의 세션이 죽는다). B 의 IndexedDB 는 여전히 독립이라 로컬 표식이 없으므로
 * `AuthGate` 는 `probeSession()`(배경 `/api/me`)으로 이 쿠키를 확인하고 들어간다.
 *
 * **계정 삭제 시나리오에는 쓰지 않는다** — `worker/account/delete.ts` 가 "요청을 보낸 기기 자신의
 * `sid` 만" 지우므로, A·B 가 같은 `sid`(=같은 세션 행)를 공유하면 A 의 삭제가 B 의 세션까지
 * 함께 지워 B 는 410 이 아니라 그냥 401(세션 없음)을 받는다 — 아래 `d1Query`/`d1Restore` 로 B 만의
 * 독립된 세션 행을 되살린 시나리오에서 써야 한다. */
async function joinAsSecondDevice(sourceCtx: BrowserContext, targetPage: Page): Promise<void> {
  const cookies = await sourceCtx.cookies();
  const session = cookies.find((c) => c.name === SESSION_COOKIE);
  if (session === undefined) throw new Error('세션 쿠키를 찾지 못했다 — 먼저 로그인했는지 확인');
  await targetPage.context().addCookies([session]);
  await targetPage.goto('/');
}

const D1_PERSIST = '.wrangler/e2e';

/** 로컬 D1(SQLite, wrangler dev 가 쓰는 바로 그 파일)에 SELECT 한다 — `sessions` 행 조작 전용. */
function d1Query<T>(sql: string): T[] {
  const out = execFileSync(
    'pnpm',
    [
      'exec',
      'wrangler',
      'd1',
      'execute',
      'tasky',
      '--local',
      '--persist-to',
      D1_PERSIST,
      '--command',
      sql,
      '--json',
    ],
    { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const [batch] = JSON.parse(out) as { results: T[] }[];
  return batch?.results ?? [];
}

function d1Run(sql: string): void {
  execFileSync(
    'pnpm',
    [
      'exec',
      'wrangler',
      'd1',
      'execute',
      'tasky',
      '--local',
      '--persist-to',
      D1_PERSIST,
      '--command',
      sql,
    ],
    { stdio: 'ignore' },
  );
}

/**
 * A 로그인 → **B 도 새로 로그인**(같은 계정) → A 의 세션 행이 로그인 순간 지워지므로(위 머리주석)
 * D1 에서 직접 되살린다. 결과: A·B 가 **서로 다른, 둘 다 유효한** 세션 행을 갖는다 — 실제 두 기기와
 * 같은 모양이라 계정 삭제의 410 판정(요청을 보낸 기기의 세션만 지운다, worker/account/delete.ts)을
 * 그대로 시험할 수 있다.
 */
async function loginTwoIndependentSessions(
  pageA: Page,
  pageB: Page,
  account: { sub: string; email: string },
): Promise<void> {
  await stubLogin(pageA, account);
  const [rowA] = d1Query<{ sid: string; created_at: string; expires_at: string }>(
    `SELECT sid, created_at, expires_at FROM sessions WHERE sub='${account.sub}'`,
  );
  if (rowA === undefined) throw new Error('A 의 세션 행을 D1 에서 못 찾았다');
  await stubLogin(pageB, account); // A 의 행을 지우고 B 의 행을 만든다
  d1Run(
    `INSERT INTO sessions (sid, sub, created_at, expires_at) VALUES ('${rowA.sid}', '${account.sub}', '${rowA.created_at}', '${rowA.expires_at}')`,
  );
  // A 의 브라우저 쿠키는 그대로다(서명은 D1 행과 무관) — 행만 되살리면 다시 유효해진다.
}

async function createCategory(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: '+ 카테고리 추가' }).click();
  const dialog = page.getByRole('dialog', { name: '카테고리 만들기' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('이름').fill(name);
  await dialog.getByRole('button', { name: '만들기' }).click();
  await expect(dialog).toHaveCount(0);
}

/** 계정 블록의 상태 줄("● 동기화됨"/"○ 대기 N건"/"○ 오프라인 …") — AccountBlock.tsx 의
 * STATUS_TEXT 그대로. 접근 가능한 role 이 없는 `<p>` 라 텍스트로 잡는다(smoke.spec.ts 의
 * `MEMORY_MODE_TEXT` 선례와 같은 방식). */
const statusLine = (page: Page) => page.getByText(/^(●|○)\s/);

test.describe('동기화: 두 기기(sync.md R5·R6)', () => {
  test('A 가 만든 카테고리·투두가 B 의 visibilitychange 로 보인다(30초를 기다리지 않는다)', async ({
    browser,
  }) => {
    const account = randomAccount();
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    await stubLogin(pageA, account);
    await joinAsSecondDevice(ctxA, pageB);
    await waitForShell(pageA);
    await waitForShell(pageB);

    await createCategory(pageA, CATEGORY);
    const groupA = pageA.getByRole('region', { name: CATEGORY });
    await groupA.getByRole('button', { name: '+ 할 일 추가' }).click();
    await pageA.getByRole('textbox', { name: `${CATEGORY}에 할 일 추가` }).fill(TODO);
    await pageA.keyboard.press('Enter');
    await expect(groupA.getByRole('checkbox', { name: TODO })).toBeVisible();

    // 트리거 전에는 B 에 아직 없다 — 아래 단언이 "가만히 둬도 결국 보인다"(폴링 30초)가 아니라
    // **visibilitychange 트리거 덕분**임을 대조한다.
    await expect(pageB.getByRole('region', { name: CATEGORY })).toHaveCount(0);

    await pageB.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(pageB.getByRole('region', { name: CATEGORY })).toBeVisible({ timeout: 10_000 });
    await expect(
      pageB.getByRole('region', { name: CATEGORY }).getByRole('checkbox', { name: TODO }),
    ).toBeVisible();

    await ctxA.close();
    await ctxB.close();
  });

  test('오프라인 큐 → 온라인 복귀로 상태 문구가 바뀐다(R6)', async ({ browser }) => {
    const account = randomAccount();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await stubLogin(page, account);
    await waitForShell(page);
    // 첫 실행 시드(category R18)가 카테고리 + 설정 두 로우를 아웃박스에 남긴다 — `waitForShell`
    // 은 `<h1>` 만 보고 이 시드가 로컬에 커밋됐는지는 보장하지 않는다. 시드 카테고리가 실제로
    // 보일 때까지 기다려 "로컬 커밋은 끝났다"를 확인한다.
    //
    // **`visibilitychange` 강제 호출은 이제 없다**(리뷰 Minor 5 — 근본 수정 후 제거, 이전엔 여기서
    // 사이클을 강제로 앞당겨 "동기화됨"이 뜨기 전에 시드 두 로우가 실제로 나갔는지를 가렸다).
    // `sync-engine.ts` 가 로컬 쓰기 직후(`onLocalWrite`) `pendingCount` 를 디바운스 없이 바로
    // 반영하므로, 시드 커밋이 엔진의 첫 사이클보다 늦어도 "대기 N건" 이 먼저 뜨고, 1.5초 뒤
    // 디바운스 사이클이 실제로 밀어 보낸 다음에야 "동기화됨"으로 바뀐다 — 문구가 항상 사실을
    // 따라간다. 아래는 그 자연스러운 전이를 그대로 기다린다(폴링 30초보다 한참 짧다).
    await expect(page.getByRole('region', { name: SEED_CATEGORY_NAME })).toBeVisible({
      timeout: 15_000,
    });
    await expect(statusLine(page)).toHaveText('● 동기화됨', { timeout: 15_000 });

    await ctx.setOffline(true);
    await createCategory(page, '오프라인 카테고리');
    await expect(statusLine(page)).toHaveText('○ 대기 1건', { timeout: 10_000 });

    await ctx.setOffline(false);
    await expect(statusLine(page)).toHaveText('● 동기화됨', { timeout: 15_000 });

    await ctx.close();
  });
});

test.describe('동기화: 계정 삭제 안내(sync.md §6, ADR-0019)', () => {
  test('A 가 계정을 삭제하면 B 는 다음 확인에서 410 을 받고 안내가 뜬다', async ({ browser }) => {
    const account = randomAccount();
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    // File System Access API(showSaveFilePicker)는 네이티브 OS 대화상자를 여는데 헤드리스에서는
    // 그걸 조작할 수 없다 — 미리 지워 앵커 다운로드 경로(browser-file.ts#anchorTarget)로 떨어뜨린다.
    // 그 경로는 피커 없이 즉시 "확정 못 함(confirmable:false)"으로 저장을 마친다.
    await pageA.addInitScript(() => {
      Reflect.deleteProperty(window, 'showSaveFilePicker');
    });
    // B 는 **좁은 뷰포트**(<1024px, `layout.ts` narrow)로, 드로어를 한 번도 열지 않는다 —
    // 리뷰 Major 3 회귀 가드다. 예전엔 계정 삭제 안내가 `ShellSidebar`(사이드바가 컬럼일 때,
    // 또는 드로어를 연 동안만 마운트)에 얹혀 있어 이 조합에서 영원히 뜨지 않았다.
    await pageB.setViewportSize({ width: 375, height: 740 });
    await loginTwoIndependentSessions(pageA, pageB, account);
    await waitForShell(pageA);
    await waitForShell(pageB);

    // A: 계정 삭제. 내보내기는 파일 저장 대화상자를 여는데, 실 파일시스템 저장창은 e2e 에서
    // 확인할 수 없으니 "취소"로 내보내기를 흉내내지 않는다 — 실제로 저장이 되는지는
    // backup.md 쪽 e2e 몫이다. 여기서는 삭제 확인 → 내보내기 다이얼로그가 뜬다는 것까지만 본다.
    await pageA.getByRole('button', { name: '계정 삭제' }).click();
    await pageA
      .getByRole('alertdialog', { name: '계정을 삭제할까요?' })
      .getByRole('button', { name: '삭제' })
      .click();

    // B: 다음 확인(visibilitychange 트리거)에서 410 을 받는다.
    await pageB.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(pageB.getByRole('alertdialog', { name: '계정이 삭제됐어요' })).toBeVisible({
      timeout: 15_000,
    });

    await ctxA.close();
    await ctxB.close();
  });
});

test.describe('동기화: 인증 엔드포인트', () => {
  test('무쿠키 GET /api/me 는 401 JSON 이다(HTML 아님)', async ({ request }) => {
    const response = await request.get('/api/me');
    expect(response.status()).toBe(401);
    expect(response.headers()['content-type']).toContain('application/json');
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });

  test('GET /auth/callback?code=x&state=bad 는 302 다', async ({ request }) => {
    const response = await request.get('/auth/callback?code=x&state=bad', { maxRedirects: 0 });
    expect(response.status()).toBe(302);
  });
});
