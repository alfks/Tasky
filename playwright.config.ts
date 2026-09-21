// 읽기 조건: E2E 러너 설정(브라우저·서버 기동 방식)을 바꿀 때.
// 서비스워커는 프로덕션 빌드에만 있으므로(specs/pwa.md R5) dev 가 아니라 build + wrangler dev 로 띄운다.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

/**
 * 이 환경에는 Chromium 이 이미 설치돼 있고(`PLAYWRIGHT_BROWSERS_PATH`), **`playwright install` 은 막혀 있다**
 * (`cdn.playwright.dev` 403). Playwright 가 기대하는 리비전 번호가 설치본과 어긋나면 "Executable doesn't exist"
 * 로 죽는데, 그 메시지를 "브라우저가 없다" 로 읽고 jsdom 으로 물러난 사고가 실제로 있었다.
 * 그래서 설치돼 있는 빌드를 직접 찾아 `executablePath` 로 넘긴다. 못 찾으면 undefined 를 돌려 Playwright 의
 * 기본 해석에 맡긴다(브라우저를 정상적으로 내려받는 환경에서는 이 함수가 아무 일도 하지 않는다).
 */
function installedChromium(): string | undefined {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (root === undefined || root === '' || !existsSync(root)) return undefined;
  const candidates = readdirSync(root)
    .filter((d) => d.startsWith('chromium'))
    // headless_shell 을 먼저 본다(헤드리스 기본 채널), 없으면 전체 chrome.
    .sort((a, b) => Number(b.includes('headless')) - Number(a.includes('headless')))
    .flatMap((d) => [
      join(root, d, 'chrome-linux', 'headless_shell'),
      join(root, d, 'chrome-linux', 'chrome'),
    ]);
  return candidates.find((p) => existsSync(p));
}

const executablePath = installedChromium();

const config = defineConfig({
  // `tests/feel/` 는 여기에 들어오지 않는다 — 합격/불합격을 내지 않는 수동 계측 도구다(tests/feel/AGENTS.md).
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  // 흐름 하나가 카테고리 생성부터 새로고침까지 가고, 중간에 체크 재배치 400ms 대기(todo R8)가 낀다.
  // 로컬 실측 2.5~3.0s 지만 CI 러너는 더 느리므로 기본 30s 보다 넉넉히 둔다.
  timeout: 60_000,
  // 개별 단언도 같은 이유로 기본 5s 에서 올린다. 늘려도 **틀린 단언은 그대로 실패한다** — 느려질 뿐이다.
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(executablePath === undefined ? {} : { launchOptions: { executablePath } }),
      },
    },
  ],
  webServer: {
    // `AUTH_STUB:1` 는 `worker/auth/stub.ts` 의 `GET /auth/stub-login` 을 연다(localhost 호스트
    // 조건과 함께 2중 가드) — e2e 는 이 경로로 구글 왕복 없이 로그인한다. `SESSION_SECRET` 은 세션
    // 쿠키 서명 비밀(값 자체는 e2e 안에서만 쓰고 다른 의미가 없다). `--persist-to .wrangler/e2e`
    // 를 마이그레이션과 dev 서버 양쪽에 **같은 값으로** 줘야 dev 서버가 방금 만든 스키마를 본다.
    command:
      `pnpm build && ` +
      `pnpm exec wrangler d1 migrations apply tasky --local --persist-to .wrangler/e2e && ` +
      `pnpm start --port ${PORT} --var AUTH_STUB:1 --var SESSION_SECRET:e2e --persist-to .wrangler/e2e`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});

export default config;
