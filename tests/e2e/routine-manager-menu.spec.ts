// 읽기 조건: 대화상자 안에 팝오버(⋯ 메뉴)를 여는 화면을 건드릴 때, 또는 이 스펙이 빨간불일 때.
//
// 리뷰 #104 Blocker 회귀 가드: `Popover`(z-[var(--z-popover)]=20) 를 `Dialog`(z-[var(--z-modal)]=30)
// 안에서 열면 고정 토큰만으로는 팝오버가 **모달 아래에 깔린다** — 메뉴가 DOM 에는 있고 접근성
// 트리에도 잡히지만, 마우스로는 클릭할 수 없다(elementFromPoint 가 모달 본문을 돌려준다).
// jsdom 은 페인트 순서가 없어 단위 테스트로는 이 종류의 결함을 못 잡는다(tests/AGENTS.md).
//
// 루틴 관리 화면(routine.md §2)이 그 조합(대화상자 안의 행 `⋯` 메뉴)이 main 에 처음 생긴 자리다.
//
// **음성 대조 기록(정확한 재현 방법, 리뷰 #104 라운드2 Minor-4)**: 이 파일 아래 `deleteItem` 의
// 패널 `style.zIndex` 를 **리터럴 상수**(예: 5)로 덮어써야 빨간불이 된다 — `overlayZIndex` 가
// 계산하는 `z` 변수 자체를 안 거치게 만드는 경로다. `Popover.tsx`/`Dialog.tsx` 의 `BASE_Z_POPOVER`/
// `BASE_Z_MODAL` **상수만** 낮추는 것은 재현되지 않는다(`overlayZIndex` 가 스택 깊이로 그 값을
// 보정하므로 — 가드가 상수 값 자체엔 둔감한 것은 의도된 성질이다). 확인 없이 상수를 낮춰 "재현
// 안 됨" 으로 결론짓지 마라.
import { expect, test } from '@playwright/test';

import type { Page } from '@playwright/test';

const MEMORY_MODE_TEXT = '지금 적는 내용은 새로고침하면 사라져요';
const TITLE = '아침 스트레칭';

async function waitForShell(page: Page): Promise<void> {
  await page.waitForSelector('main#shell-main');
  await expect(page.getByRole('heading', { name: 'Tasky', level: 1 })).toBeVisible();
  await expect(page.getByText(MEMORY_MODE_TEXT)).toHaveCount(0);
}

/**
 * `routines` 테이블에 무기한 루틴 한 건을 직접 심는다.
 *
 * **왜 UI 경로가 아닌가**(tests/AGENTS.md 규칙 3의 예외): "루틴으로 등록"(routine.md R12-a)이
 * `Routine` 레코드를 함께 저장하는 것은 T-82 의 몫이고, 지금 `todo-actions.ts#createRoutine` 은
 * 아직 그 이전의 R21 그대로(`endDate` 필수, 레코드 미저장)다 — 즉 **레코드를 만드는 UI 경로 자체가
 * 아직 없다.** 이 회귀 가드가 재려는 것도 그 경로가 아니라 "관리 화면 행의 `⋯` 메뉴가 대화상자
 * 안에서 실제로 클릭되는가" 뿐이라 대상 규칙의 취지(빈 눈속임으로 초록불을 만들지 않는다)를
 * 해치지 않는다. T-82 가 그 경로를 만들면 이 헬퍼는 "루틴으로 등록" UI 흐름으로 바꿀 수 있다.
 */
async function seedRoutine(page: Page, title: string): Promise<void> {
  await page.evaluate(
    (routineTitle) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('tasky');
        request.onerror = () => reject(request.error ?? new Error('IndexedDB 열기 실패'));
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('routines', 'readwrite');
          const now = new Date().toISOString();
          tx.objectStore('routines').put({
            id: crypto.randomUUID(),
            createdAt: now,
            updatedAt: now,
            rev: 1,
            title: routineTitle,
            categoryId: 'e2e-무관-카테고리',
            recurrence: { type: 'weekly', daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
            startDate: '2020-01-01',
            active: true,
            fillFloor: '2020-01-01',
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error ?? new Error('routines 쓰기 실패'));
        };
      }),
    title,
  );
}

test('대화상자 안에서 연 행 ⋯ 메뉴는 실제로 클릭할 수 있다 (리뷰 #104 Blocker)', async ({
  page,
}) => {
  await page.goto('/');
  await waitForShell(page);
  await seedRoutine(page, TITLE);
  await page.reload();
  await waitForShell(page);

  // 루틴 관리 화면 — 대화상자다. 그 **안**에서 행의 `⋯` 를 연다(리뷰가 재현한 정확한 조건).
  await page.getByRole('button', { name: '루틴' }).click();
  const manager = page.getByRole('dialog', { name: '루틴' });
  await expect(manager).toBeVisible();
  await expect(manager.getByText(TITLE)).toBeVisible();

  await manager.getByRole('button', { name: `${TITLE} 루틴 메뉴` }).click();
  const menu = page.getByRole('menu', { name: `${TITLE} 루틴 메뉴` });
  const deleteItem = menu.getByRole('menuitem', { name: '삭제' });
  await expect(deleteItem).toBeVisible();

  // 접근성 트리에는 있어도 **화면에는 없을 수 있다** — 실제 페인트 순서를 elementFromPoint 로 잰다.
  const box = await deleteItem.boundingBox();
  if (box === null) throw new Error('삭제 항목의 화면 위치를 잴 수 없다.');
  const hit = await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el === null ? null : { role: el.getAttribute('role'), text: el.textContent };
    },
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(hit).toEqual({ role: 'menuitem', text: '삭제' });

  // 실제로 눌러서 지워진다 — 가려져 있었다면 Playwright 의 actionability 검사가 여기서 먼저 멈춘다.
  await deleteItem.click();
  await expect(manager.getByText(TITLE)).toHaveCount(0);
});
