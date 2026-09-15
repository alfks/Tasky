// 읽기 조건: E2E 러너 설정(브라우저·서버 기동 방식)을 바꿀 때.
// 서비스워커는 프로덕션 빌드에만 있으므로(specs/pwa.md R5) dev 가 아니라 build + wrangler dev 로 띄운다.
import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});

export default config;
