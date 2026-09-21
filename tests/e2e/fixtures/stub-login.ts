// 읽기 조건: e2e 스펙이 `page` 를 처음 쓰기 전에. `AuthGate`(sync.md R1)가 표식 없으면 로그인
// 화면 외 아무것도 안 보여주므로, 기존 11개 스펙을 포함해 **모든** e2e 는 이 파일의 `test`(기본
// `@playwright/test` 의 `test` 를 감싼 것)를 써야 한다 — `page` 를 받는 순간 이미 스텁 로그인이
// 끝나 있다. `@playwright/test` 를 직접 import 하면 로그인 화면만 보고 죽는다.
//
// 스텁 로그인은 `GET /auth/stub-login?sub=&email=` 하나뿐이다(worker/auth/stub.ts) — `AUTH_STUB=1`
// + localhost 호스트일 때만 열리고(playwright.config.ts 의 webServer 가 그 변수를 준다), 구글 왕복
// 없이 즉시 세션 쿠키를 심고 `/` 로 302 한다. 로컬 IndexedDB 는 새 컨텍스트라 비어 있으므로 첫
// 로그인 R8("로컬 데이터 없음 → 바로")을 타 업로드 다이얼로그도 뜨지 않는다.
import { test as base, expect } from '@playwright/test';

import type { Page } from '@playwright/test';

export type Account = { sub: string; email: string };

/** D1 사용자를 테스트끼리 안 섞이게 매번 새로 만든다(`fullyParallel: true` 라 워커가 겹친다). */
export function randomAccount(): Account {
  const sub = `e2e-${crypto.randomUUID()}`;
  return { sub, email: `${sub}@example.com` };
}

export async function stubLogin(page: Page, account: Account): Promise<void> {
  await page.goto(
    `/auth/stub-login?sub=${encodeURIComponent(account.sub)}&email=${encodeURIComponent(account.email)}`,
  );
  await page.waitForURL('/');
}

export const test = base.extend<{ account: Account }>({
  // `page` 를 안 받는 순수 값 fixture — 아래 `page` 오버라이드가 이 값으로 로그인한다. `page` 가
  // `account` 를 먼저 요청하게 해 두면(의존 방향이 반대라 순환이 안 생긴다) 호출부는 로그인 뒤
  // 어떤 계정으로 들어갔는지가 필요할 때(sync.spec.ts 의 "같은 계정, 다른 기기") `account` 를
  // 그대로 가져다 둘째 컨텍스트에 다시 로그인시킬 수 있다.
  //
  // 두 번째 인자 이름을 Playwright 관용구인 `use` 대신 `provide` 로 둔다 — `eslint-plugin-react-hooks`
  // 가 이름만 보고 React 의 `use()` 훅으로 오인해 `rules-of-hooks` 를 건다(이 레포는 tests/e2e 도
  // 같은 규칙 세트 아래 있다, 실측). 동작은 Playwright 문서의 `use` 콜백과 동일하다.
  // Playwright 는 fixture 함수의 첫 인자를 실제 구조분해 패턴으로 파싱해 의존 fixture 를
  // 알아낸다(`_fixtures` 처럼 평범한 식별자로 바꾸면 "must use the object destructuring pattern"
  // 로 즉시 실패한다, 실측). `account` 는 아무 것도 의존하지 않으므로 빈 패턴이 맞는 표기다.
  account: async ({}, provide) => {
    await provide(randomAccount());
  },
  // `@playwright/test` 의 `page` 를 감싼다 — `{ page }` 는 이 오버라이드 이전(기본) 구현을
  // 가리킨다(Playwright fixture 오버라이드 규약). 모든 스펙이 이 파일에서 `test` 를 가져오면
  // `page` 를 처음 쓰는 시점에 이미 로그인이 끝나 있다.
  page: async ({ page, account }, provide) => {
    await stubLogin(page, account);
    await provide(page);
  },
});

export { expect };
