// 사용감 대조 패스(T-25)의 공용 하네스. 브라우저 띄우기 · 서버 확인 · 데이터 심기 · 출력 경로.
//
// 왜 `.mjs` 인가: 이 스크립트들은 `pnpm test`(vitest, `tests/**` 제외)에도
// `pnpm test:e2e`(playwright, `testDir: tests/e2e`)에도 들어가지 않는 **수동 계측 도구**다.
// 러너 없이 `node tests/feel/<이름>.mjs` 로 직접 돈다. tsconfig 의 include 는 ts/tsx 뿐이라
// 타입 검사 대상도 아니다(의도).
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from '@playwright/test';

export const BASE_URL = process.env.FEEL_BASE_URL ?? 'http://127.0.0.1:3200';
export const OUT_DIR = process.env.FEEL_OUT_DIR ?? '/tmp/feel-report';

/**
 * 설치돼 있는 chromium 을 직접 찾는다. `playwright install` 은 이 환경에서 403 으로 막혀 있고
 * Playwright 가 기대하는 리비전과 설치본이 어긋날 수 있다(playwright.config.ts 와 같은 이유·같은 방식).
 */
export function installedChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (root === undefined || root === '' || !existsSync(root)) return undefined;
  return readdirSync(root)
    .filter((d) => d.startsWith('chromium'))
    .sort((a, b) => Number(b.includes('headless')) - Number(a.includes('headless')))
    .flatMap((d) => [
      join(root, d, 'chrome-linux', 'headless_shell'),
      join(root, d, 'chrome-linux', 'chrome'),
    ])
    .find((p) => existsSync(p));
}

/** 서버가 떠 있지 않으면 **멈춘다**. 조용히 건너뛰면 "측정했다"는 거짓 기록이 남는다. */
export async function requireServer() {
  const res = await fetch(BASE_URL, { redirect: 'manual' }).catch(() => undefined);
  if (res === undefined || res.status >= 400) {
    throw new Error(
      `서버 없음: ${BASE_URL}. 먼저 \`pnpm build && npx wrangler dev --config wrangler.jsonc --port 3200\` 을 띄워라.`,
    );
  }
}

export async function launch() {
  await requireServer();
  mkdirSync(OUT_DIR, { recursive: true });
  return chromium.launch({
    executablePath: installedChromium(),
    args: ['--force-color-profile=srgb', '--disable-lcd-text'],
  });
}

/**
 * 새 페이지. `colorScheme` 으로 OS 다크를 흉내 내고(theme R7), `reducedMotion` 은 기본 'no-preference'
 * — 모션을 재려면 모션이 켜져 있어야 한다.
 */
export async function newPage(browser, { width = 1440, height = 900, colorScheme = 'light' } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme });
  const page = await context.newPage();
  return page;
}

/** 셸이 뜰 때까지. 제목(`h1` 또는 sr-only `h1`)이 나오면 마운트된 것이다. */
export async function waitForShell(page) {
  await page.waitForSelector('main#shell-main', { timeout: 15_000 });
  await page.waitForFunction(() => document.fonts.status === 'loaded', undefined, {
    timeout: 15_000,
  });
}

/**
 * 투두 n개를 **UI 로** 심는다. 레포지토리를 직접 찌르지 않는 이유: 이 티켓이 재는 것이 곧 그 UI
 * 경로의 사용감이고, 심는 경로가 다르면 재는 대상과 어긋난다.
 *
 * 첫 실행에는 기본 카테고리(`todo`)가 이미 한 개 있다 — 그래서 카테고리를 만들지 않는다.
 */
export async function seed(page, titles = ['장보기', '방 청소', '물 마시기']) {
  for (const title of titles) {
    const addRow = page.getByRole('button', { name: '+ 할 일 추가' }).first();
    if (await addRow.isVisible().catch(() => false)) await addRow.click();
    const input = page.getByRole('textbox', { name: /할 일 추가/ }).first();
    await input.fill(title);
    await input.press('Enter');
    await page.waitForTimeout(120);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

/**
 * 오늘 기준 **상대 날짜**의 접근 이름 조각(`9월 18일`). 스크립트가 `9월 17일` 같은 절대 날짜를
 * 박아 두면 **측정한 날에만 돈다** — T-25 가 그렇게 적어 둔 탓에 하루 뒤 `오늘로 이동` 이
 * 비활성(오늘이라서)이 되어 `motion-and-latency.mjs` 가 통째로 죽었다(T-60 실측).
 */
export function dayLabel(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function writeJson(name, data) {
  mkdirSync(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, name);
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  return path;
}

export const out = (name) => join(OUT_DIR, name);

/**
 * 표준 출력. `console.log` 를 쓰지 않는 이유는 취향이 아니라 규칙이다 — 이 레포의 ESLint 는
 * `no-console` 을 `warn`/`error` 만 허용하는데, 이 스크립트들의 **산출물이 곧 표준 출력**이라
 * 경고로 내보낼 수 없다. CLI 도구답게 스트림에 직접 쓴다.
 */
export const log = (...parts) => {
  process.stdout.write(`${parts.join(' ')}\n`);
};
