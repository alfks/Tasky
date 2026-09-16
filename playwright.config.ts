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
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
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
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});

export default config;
