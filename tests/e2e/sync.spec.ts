// 읽기 조건: 동기화 흐름(로그인·엔진·계정 블록·계정 삭제 안내)을 고칠 때.
//
// 실제 Worker(로컬 wrangler dev + D1)와 두 브라우저 **컨텍스트**("기기 둘")로 왕복한다 — 같은
// 컨텍스트의 두 탭은 쿠키·IndexedDB 를 공유하는 같은 기기라 동기화를 재현하지 못한다
// (tests/AGENTS.md 규칙 3 의 다기기 버전).
//
// **"두 기기, 같은 계정" 은 진짜 두 번째 `stubLogin` 으로 만든다.** 예전에는
// `worker/auth/handlers.ts#handleCallback`·`worker/auth/stub.ts#handleStubLogin` 이 새 로그인마다
// 그 sub 의 세션을 **무조건** 전량 폐기해(`DELETE FROM sessions WHERE sub = ?`), 둘째 기기가
// 로그인하는 순간 첫째 기기가 로그아웃됐다(사용자가 보고한 바로 그 증상) — 그래서 이 스펙은 한 번만
// 로그인한 세션 쿠키를 둘째 컨텍스트에 복사하거나, D1 에서 세션 행을 직접 되살리는 우회로 "두 기기"를
// 흉내냈고, 그 우회 자체가 실제 제품의 한계를 가린다고 스스로 적어 두었다. **그 한계는 이제 고쳤다**
// (`worker/auth/session.ts#signIn`, ADR-0020): 세션 전량 폐기는 `deleted_users` 에 그 sub 의 표식이
// 있을 때(계정을 삭제했다가 같은 구글 계정으로 재가입하는 경로)만 실행되고, 평범한 로그인은 다른
// 기기의 세션을 건드리지 않는다. 그래서 아래 시나리오는 전부 두 컨텍스트에서 각각 `stubLogin` 을
// 부르는 진짜 두 번째 로그인이다 — 쿠키 복사·D1 되살리기 헬퍼는 더 이상 없다.
//
// 이 파일은 `@playwright/test` 를 **직접** 쓴다(`./fixtures/stub-login` 의 `test` 가 아니다) —
// 그 fixture 는 `page` 를 건드리기 전에 자동으로 로그인시키는데, 아래 시나리오는 무쿠키 상태를
// 직접 검증해야 해서 자동 로그인이 방해가 된다. 대신 그 파일의 `randomAccount`/`stubLogin`
// 헬퍼만 가져다 쓴다.
import { expect, test } from '@playwright/test';

import { randomAccount, stubLogin } from './fixtures/stub-login';
import {
  closeSidebarDrawer,
  createCategory,
  createCategoryInDialog,
  openSidebarDrawer,
} from './sidebar';

import type { Page } from '@playwright/test';

const CATEGORY = '동기화 확인';
const TODO = '두 기기 확인';
/** 첫 실행 시드(category R18, `SEED_CATEGORY.name`)의 카테고리 이름 — 그 상수를 그대로 가져오면
 * 도메인 계층을 이 스펙이 import 하게 되므로, 여기서는 리터럴로만 맞춘다. */
const SEED_CATEGORY_NAME = 'todo';

async function waitForShell(page: Page): Promise<void> {
  await page.waitForSelector('main#shell-main');
  await expect(page.getByRole('heading', { name: 'Tasky', level: 1 })).toBeVisible();
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
    await stubLogin(pageB, account); // 같은 계정으로 진짜 두 번째 로그인(ADR-0020) — A 는 죽지 않는다
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

  test('빈 기기 B 가 로그인해도 A 의 카테고리·프로필이 이기고 todo 는 생기지 않는다(첫 동기화 시드 게이트)', async ({
    browser,
  }) => {
    const account = randomAccount();
    const PROFILE_NAME = '게이트 확인';
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    // A 의 첫 왕복을 막아 둔다 — 로그인 직후 사용자가 먼저 만드는 상황을 결정적으로 만든다. 게이트가
    // 없던 때는 이 상태의 빈 기기 B 가 첫 풀 전에 `todo` 와 빈 설정 행을 올려 A 의 자료를 덮었다.
    await ctxA.route('**/api/sync', (route) => route.abort());
    await stubLogin(pageA, account);
    await waitForShell(pageA);

    await pageA.getByRole('button', { name: '프로필 편집' }).click();
    const dialog = pageA.getByRole('dialog', { name: '프로필 편집' });
    await dialog.getByLabel('이름').fill(PROFILE_NAME);
    await dialog.getByRole('button', { name: '저장' }).click();
    await expect(dialog).toHaveCount(0);
    // 시드가 미뤄져 목록이 비어 있다 — 빈 상태의 [첫 카테고리 만들기] 로 연다.
    const drawerForCreate = await openSidebarDrawer(pageA);
    await drawerForCreate.getByRole('button', { name: '첫 카테고리 만들기' }).click();
    const createDialog = pageA.getByRole('dialog', { name: '카테고리 만들기' });
    await createDialog.getByLabel('이름').fill(CATEGORY);
    await createDialog.getByRole('button', { name: '만들기' }).click();
    await expect(createDialog).toHaveCount(0);
    await closeSidebarDrawer(pageA, drawerForCreate);
    await expect(pageA.getByRole('region', { name: CATEGORY })).toBeVisible();
    await expect(pageA.getByRole('region', { name: SEED_CATEGORY_NAME })).toHaveCount(0);

    await ctxA.unroute('**/api/sync');
    await pageA.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    const drawerA = await openSidebarDrawer(pageA);
    await expect(statusLine(pageA)).toHaveText('● 동기화됨', { timeout: 20_000 });
    await closeSidebarDrawer(pageA, drawerA);

    // 기기 B — 빈 IndexedDB 로 같은 계정의 진짜 두 번째 로그인.
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await stubLogin(pageB, account);
    await waitForShell(pageB);
    await expect(pageB.getByRole('region', { name: CATEGORY })).toBeVisible({ timeout: 15_000 });
    // 카테고리가 도착한 그 첫 왕복 뒤에 시드 판정이 끝났다 — 이 시점에 `todo` 가 없어야 한다.
    await expect(pageB.getByRole('region', { name: SEED_CATEGORY_NAME })).toHaveCount(0);
    await expect(pageB.getByRole('region', { name: '프로필', exact: true })).toContainText(
      PROFILE_NAME,
    );

    // A 를 새로고침해도(B 의 푸시가 A 의 설정을 덮었다면 여기서 드러난다) 프로필이 남는다.
    await pageA.reload();
    await waitForShell(pageA);
    await expect(pageA.getByRole('region', { name: '프로필', exact: true })).toContainText(
      PROFILE_NAME,
    );
    await expect(pageA.getByRole('region', { name: SEED_CATEGORY_NAME })).toHaveCount(0);

    await ctxA.close();
    await ctxB.close();
  });

  test('오프라인 큐 → 온라인 복귀로 상태 문구가 바뀐다(R6)', async ({ browser }) => {
    const account = randomAccount();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await stubLogin(page, account);
    await waitForShell(page);
    // 계정 블록의 상태 줄("● 동기화됨" 등)은 사이드바 드로어 안(`nav`)에 있다(calendar-layout.md
    // §1-A) — 이 테스트는 그 문구를 끝까지 지켜봐야 하므로 드로어를 열어 두고 간다.
    await openSidebarDrawer(page);
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
    // 드로어가 이미 열려 있다 — 다이얼로그만 처리한다("+ 카테고리 추가" 도 같은 `nav` 안).
    await createCategoryInDialog(page, '오프라인 카테고리');
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
    // 진짜 두 번째 로그인(ADR-0020) — A·B 가 서로 다른, 둘 다 유효한 세션 행을 갖는다. 계정 삭제는
    // 요청을 보낸 기기 자신의 세션만 지우므로(worker/account/delete.ts) B 의 세션은 그대로 남고,
    // 다음 확인에서 `deleted_users` 표식을 보고 410 을 받는다.
    await stubLogin(pageA, account);
    await stubLogin(pageB, account);
    await waitForShell(pageA);
    await waitForShell(pageB);

    // A: 계정 삭제. "계정 삭제" 버튼은 계정 블록(사이드바 드로어 `nav` 안, calendar-layout.md
    // §1-A)에 있다 — A 는 기본(넓은) 뷰포트라 먼저 드로어를 연다. 내보내기는 파일 저장
    // 대화상자를 여는데, 실 파일시스템 저장창은 e2e 에서 확인할 수 없으니 "취소"로 내보내기를
    // 흉내내지 않는다 — 실제로 저장이 되는지는 backup.md 쪽 e2e 몫이다. 여기서는 삭제 확인 →
    // 내보내기 다이얼로그가 뜬다는 것까지만 본다.
    await openSidebarDrawer(pageA);
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

test.describe('동기화: 다기기 로그인(ADR-0020)', () => {
  test('A 로그인 뒤 B 가 같은 계정으로 로그인해도 A 는 로그아웃되지 않는다(사용자 보고 증상)', async ({
    browser,
  }) => {
    const account = randomAccount();
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    await stubLogin(pageA, account);
    await waitForShell(pageA);

    // B 가 같은 계정으로 새로 로그인한다. 예전 코드(고치기 전 `worker/auth/session.ts`)는 로그인마다
    // 그 sub 의 세션을 무조건 전량 폐기해 이 시점에 A 의 세션 행이 죽었다 — 사용자가 보고한 증상
    // 그대로다. ADR-0020 이후에는 `deleted_users` 표식이 있을 때(계정 삭제 뒤 재가입)만 전량
    // 폐기가 실행되므로, 평범한 두 번째 로그인은 A 의 세션을 건드리지 않는다.
    await stubLogin(pageB, account);
    await waitForShell(pageB);

    // 서버 판정을 페이지 안에서 직접 확인한다. `ctxA.request`(Playwright 의 Node 쪽 API 요청
    // 컨텍스트)는 쓰지 않는다 — 세션 쿠키가 `Secure` 인데(worker/auth/cookies.ts, 프로덕션과 같은
    // 속성을 유지하려고 dev 에서도 내리지 않는다) 그 컨텍스트는 브라우저의 "localhost 는 안전
    // 출처" 예외를 모르고 평범한 HTTP(스킴 http)로만 봐서 `Secure` 쿠키를 보내지 않는다(실측 —
    // 고쳐진 코드로도 이 경로로는 401 이 난다, 세션이 죽은 것과는 무관한 오탐). 페이지 안의
    // `fetch` 는 실제 브라우저 보안 컨텍스트를 타므로 쿠키가 정상적으로 실린다.
    const meStatus = await pageA.evaluate(async () => (await fetch('/api/me')).status);
    expect(meStatus).toBe(200);

    // UI 로도 확인한다 — `visibilitychange` 는 sync-engine 의 확인 사이클(2초 디바운스 뒤
    // `verifySession` → `/api/me`, `sync-engine.ts#TRIGGER_DEBOUNCE_MS`)을 깨운다. `waitForResponse`
    // 로 그 왕복이 실제로 끝나길 기다린다 — 곧장 `main#shell-main` 을 다시 재면 이미 그려져 있던
    // 걸 또 확인하는 것뿐이라 디바운스가 끝나기도 전에 항상 통과한다(tests/AGENTS.md 규칙 2, 음성
    // 대조로 실측). 예전 코드라면 이 왕복이 401 을 돌려주고 `AuthGate` 가 `phase: 'login'` 으로
    // 바뀌어 `main#shell-main` 이 사라진다.
    const [response] = await Promise.all([
      pageA.waitForResponse((res) => res.url().includes('/api/me'), { timeout: 10_000 }),
      pageA.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))),
    ]);
    expect(response.status()).toBe(200);
    await expect(pageA.getByRole('main')).toBeVisible();

    await ctxA.close();
    await ctxB.close();
  });
});

test.describe('동기화: 다른 기기 모두 로그아웃(ADR-0020 §결정 5, 리뷰 Minor 4)', () => {
  test('A 가 누르면 A 는 로그인 상태를 유지하고, B 는 다음 확인에서 로그인 화면으로 돌아간다', async ({
    browser,
  }) => {
    const account = randomAccount();
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    // 진짜 두 번째 로그인(ADR-0020) — A·B 가 서로 다른, 둘 다 유효한 세션 행을 갖는다.
    await stubLogin(pageA, account);
    await stubLogin(pageB, account);
    await waitForShell(pageA);
    await waitForShell(pageB);

    // "다른 기기 모두 로그아웃" 도 계정 블록(사이드바 드로어 `nav` 안)에 있다 — 먼저 연다.
    await openSidebarDrawer(pageA);
    await pageA.getByRole('button', { name: '다른 기기 모두 로그아웃' }).click();
    await pageA
      .getByRole('alertdialog', { name: '다른 기기를 모두 로그아웃할까요?' })
      .getByRole('button', { name: '로그아웃' })
      .click();
    await expect(pageA.getByText('다른 기기를 로그아웃했어요.')).toBeVisible();

    // A: 이 기기 자신은 로그인 상태를 유지한다 — 새로고침해도 셸이 그대로 보인다.
    await pageA.reload();
    await waitForShell(pageA);

    // B: 다음 확인(visibilitychange 트리거)에서 401 을 받아 로그인 화면으로 돌아간다. `sync-engine.ts`
    // 의 확인 사이클(`verifySession`)이 `/api/me` 를 부르고, 세션이 없어졌으니 `AuthGate` 가
    // `phase: 'login'` 으로 바뀌어 `main#shell-main` 이 사라진다(리뷰 Major 3, user — 로그인 화면이
    // "왜" 인지 한 줄을 남긴다).
    const [response] = await Promise.all([
      pageB.waitForResponse((res) => res.url().includes('/api/me'), { timeout: 10_000 }),
      pageB.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))),
    ]);
    expect(response.status()).toBe(401);
    await expect(pageB.getByRole('link', { name: 'Google로 계속하기' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      pageB.getByText(
        '로그인이 풀렸어요. 세션이 만료되었거나 다른 기기에서 로그아웃했을 수 있어요.',
      ),
    ).toBeVisible();

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
