// T-25 항목 3(레이아웃 안정성 CLS) · 항목 5(첫 페인트의 테마 플래시).
//
// 항목 5 는 **녹화로** 본다: CDP `Page.startScreencast` 로 새로고침 직후의 프레임을 전부 받아
// 각 프레임의 실제 픽셀 밝기를 읽는다. "흰 화면이 한 프레임이라도 보이는가" 는 그래야 답이 된다.
//
// 실행: node tests/feel/stability-and-theme.mjs
import { writeFileSync } from 'node:fs';

import {
  BASE_URL,
  dayLabel,
  launch,
  log,
  newPage,
  out,
  seed,
  waitForShell,
  writeJson,
} from './lib/harness.mjs';

/** 문서 시작 시점에 걸어 두는 기록기. layout-shift 는 `buffered` 로 첫 페인트 것까지 받는다. */
function installShiftRecorder() {
  const w = window;
  w.__cls = { entries: [], total: 0 };
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      if (e.hadRecentInput) continue;
      w.__cls.total += e.value;
      w.__cls.entries.push({
        t: Number(e.startTime.toFixed(1)),
        v: Number(e.value.toFixed(5)),
        sources: (e.sources ?? []).slice(0, 3).map((s) => s.node?.nodeName ?? '?'),
      });
    }
  }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((l) => {
    w.__paint = (w.__paint ?? []).concat(
      l.getEntries().map((e) => ({ name: e.name, t: Number(e.startTime.toFixed(1)) })),
    );
  }).observe({ type: 'paint', buffered: true });
}

const browser = await launch();
const result = { baseUrl: BASE_URL, cls: {}, themeFlash: {} };

// ---------- 항목 3: CLS ----------
{
  const page = await newPage(browser, { width: 1440, height: 900 });
  await page.addInitScript(installShiftRecorder);
  await page.goto(BASE_URL);
  await waitForShell(page);
  await page.waitForTimeout(2500);
  const read = () => page.evaluate(() => ({ ...window.__cls, paint: window.__paint ?? [] }));
  result.cls.firstLoadEmpty = { 설명: '빈 상태로 첫 로드(폰트 로드 포함) 2.5s', ...(await read()) };

  const reset = () =>
    page.evaluate(() => {
      window.__cls.entries = [];
      window.__cls.total = 0;
    });

  await reset();
  await seed(page, ['장보기', '방 청소', '물 마시기']);
  await page.waitForTimeout(800);
  result.cls.emptyToPopulated = { 설명: '빈 상태 → 항목 3개', ...(await read()) };

  await reset();
  await page.getByLabel(new RegExp(dayLabel(1))).click(); // 항목 없는 날 → 빈 상태
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: '오늘로 이동' }).click();
  await page.waitForTimeout(700);
  result.cls.dateEmptyRoundTrip = { 설명: '항목 있는 날 ↔ 빈 날 왕복', ...(await read()) };

  await reset();
  await page.getByRole('checkbox').first().check();
  await page.waitForTimeout(1200);
  result.cls.completionMove = { 설명: '체크 → 완료 블록 이동(FLIP)', ...(await read()) };

  // 폰트 로드만 따로: 캐시를 비우고 다시 연다(웹폰트가 늦게 붙을 때의 재배치를 보려는 것).
  await page.context().clearCookies();
  const cold = await newPage(browser, { width: 1440, height: 900 });
  await cold.addInitScript(installShiftRecorder);
  const client = await cold.context().newCDPSession(cold);
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cold.goto(BASE_URL);
  await waitForShell(cold);
  await cold.waitForTimeout(2500);
  result.cls.coldLoadNoCache = {
    설명: '캐시 없이 첫 로드(폰트 네트워크 로드 포함)',
    ...(await cold.evaluate(() => ({ ...window.__cls, paint: window.__paint ?? [] }))),
  };
  await cold.context().close();
  await page.context().close();
}

// ---------- 항목 5: 테마 플래시 (녹화) ----------
{
  const page = await newPage(browser, { width: 1280, height: 800, colorScheme: 'light' });
  await page.goto(BASE_URL);
  await waitForShell(page);
  // OS 는 라이트인데 앱은 다크 — 첫 페인트 스크립트가 localStorage 미러를 읽어야만 검게 나온다.
  await page.getByRole('button', { name: /다크 모드로 전환/ }).click();
  await page.waitForTimeout(600);
  result.themeFlash.mirror = await page.evaluate(() => localStorage.getItem('tasky.theme.v1'));

  const client = await page.context().newCDPSession(page);
  const frames = [];
  client.on('Page.screencastFrame', async (f) => {
    frames.push({ t: f.metadata.timestamp, data: f.data });
    await client.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await client.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  const t0 = Date.now();
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await client.send('Page.stopScreencast');

  // 프레임을 실제 픽셀로 읽는다 — 별도 페이지에서 캔버스로 디코드한다(노드 쪽 PNG 의존성 없이).
  const decoder = await browser.newPage();
  const samples = [];
  for (const [i, f] of frames.entries()) {
    const lum = await decoder.evaluate(async (data) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      // 화면 왼쪽 아래 — 상단 알림 배너와 겹치지 않는 자리에서 배경을 읽는다.
      const pts = [
        [Math.floor(img.width * 0.05), Math.floor(img.height * 0.8)],
        [Math.floor(img.width * 0.5), Math.floor(img.height * 0.9)],
      ];
      return pts.map(([x, y]) => {
        const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
        return Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
      });
    }, f.data);
    samples.push({ frame: i, msFromReload: Math.round(f.t * 1000 - t0) < 0 ? null : null, lum });
    if (i < 6)
      writeFileSync(
        out(`theme-flash-frame-${String(i).padStart(2, '0')}.png`),
        Buffer.from(f.data, 'base64'),
      );
  }
  await decoder.close();

  const light = samples.filter((s) => s.lum.some((v) => v > 180));
  result.themeFlash.frames = samples.length;
  result.themeFlash.samples = samples.map((s) => s.lum);
  result.themeFlash.lightFrames = light.map((s) => s.frame);
  result.themeFlash.verdict =
    light.length === 0
      ? '흰 프레임 없음 — 첫 프레임부터 다크'
      : `흰 프레임 ${light.length}개(프레임 번호 ${light.map((s) => s.frame).join(',')})`;
  result.themeFlash.docTheme = await page.evaluate(() => document.documentElement.dataset.theme);

  // 녹화만으로는 "새로고침 **직전** 프레임" 과 "직후 프레임" 이 둘 다 검을 때 구분이 약하다.
  // 그래서 한 번 더 결정적으로 본다: **앱 JS 를 통째로 막고** 새로고침한다. 그러면 화면에 남는 것은
  // `index.html` + CSS 뿐이고, 그 상태의 배경색이 곧 "React 가 붙기 전 첫 페인트" 다.
  // theme.md R6(첫 페인트 전 localStorage 미러를 읽는 인라인 스크립트)이 실제로 도는지의 직접 증거다.
  await page.route('**/assets/*.js', (route) => route.abort());
  await page.reload({ waitUntil: 'commit' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: out('theme-flash-js-blocked.png') });
  result.themeFlash.jsBlocked = await page.evaluate(() => ({
    dataTheme: document.documentElement.getAttribute('data-theme'),
    htmlBg: getComputedStyle(document.documentElement).backgroundColor,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    rootChildren: document.getElementById('root')?.childElementCount ?? null,
  }));
  await page.context().close();
}

await browser.close();
for (const [k, v] of Object.entries(result.cls)) {
  log(
    `[CLS] ${k}: total=${v.total.toFixed(5)} entries=${v.entries.length} paint=${JSON.stringify(v.paint)}`,
  );
}
log('[테마] 미러:', result.themeFlash.mirror, '/', result.themeFlash.verdict);
log('\n저장:', writeJson('stability-and-theme.json', result));
