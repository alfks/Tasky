// T-60 항목 1·2 — **밀도와 면**을 다시 잰다(FEEL_REPORT §8 의 #1·#2·#3·#7·#9).
//
// `visual-contrast.mjs` 와 겹치지 않는 부분만 여기 있다:
//   · 컬럼 내부 공백을 **잉크 기준**으로 잰다(T-25 가 "flex 라 항상 0" 이라 못 잰 것, §7-D)
//   · "카드" 를 계산된 스타일로 인구조사해 **뒤에 깔린 색과의 명도비**를 낸다(#1)
//   · "선택됨" 링이 실제로 그려지는지 계산된 값으로 본다(#9)
//
// 실행: node tests/feel/density-and-surface.mjs   (서버가 먼저 떠 있어야 한다)
import {
  BASE_URL,
  launch,
  log,
  newPage,
  out,
  seed,
  waitForShell,
  writeJson,
} from './lib/harness.mjs';
import { cardCensus, inkDensity, selectedRingCensus } from './lib/probe-density.mjs';
import { completionSurfaces } from './lib/probe.mjs';

const SIZES = [
  [1440, 900],
  [1280, 800],
  [1024, 800],
  [768, 800],
  [400, 800],
];
const SHOT_WIDTHS = new Set([1440, 1280, 400]);
const SCHEMES = ['light', 'dark'];

/** 컬럼 세 개. 넓은 폭에서만 서는 컬럼은 좁은 폭에서 `null` 로 나온다 — 그것도 기록이다. */
const COLUMNS = [
  ['메인 스크롤 영역', 'main#shell-main > div:nth-child(2)'],
  ['사이드바 컬럼', 'nav[aria-label="카테고리"]'],
  ['인사이트 컬럼', 'aside[aria-label="오늘 요약"]'],
];

const RING_GROUPS = [
  { group: '날짜 셀(선택)', selector: '[role="radio"][aria-checked="true"]' },
  {
    group: '강조색 스와치(선택)',
    selector: '[role="radiogroup"][aria-label="강조색"] [role="radio"][aria-checked="true"]',
  },
  {
    group: '타이머 시간 라디오(체크)',
    selector: 'input[type=radio]:checked',
    scopeSelector: 'label',
  },
];

/**
 * **그림자가 실제로 눈에 보이는가** 를 찍은 픽셀로 본다. 계산된 `box-shadow` 가 있다는 것과
 * 화면에 부유감이 생겼다는 것은 다른 말이다(T-60 티켓의 지적). 카드 아래쪽 바깥을 세로로 훑어
 * **가장 어두워진 픽셀**과 페이지 배경의 명도비를 낸다. 1.00 에 가까우면 "있지만 안 보인다" 다.
 *
 * PNG 디코더가 이 레포에 없어서 **브라우저의 canvas 로 푼다** — 찍은 이미지를 빈 페이지에
 * 올려 `getImageData` 로 읽는다.
 */
async function measureShadowPixels(browserRef, page, pngBuffer) {
  const target = await page.evaluate(() => {
    const el = document.querySelector('section[aria-label]');
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), bottom: Math.round(r.bottom) };
  });
  if (target === null) return null;
  const reader = await browserRef.newPage();
  const result = await reader.evaluate(
    async ({ dataUrl, x, bottom }) => {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = dataUrl;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const px = (yy) => {
        const d = ctx.getImageData(x, yy, 1, 1).data;
        return { r: d[0], g: d[1], b: d[2] };
      };
      const lum = (c) => {
        const f = (v) => {
          const s = v / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
      };
      // 카드 아래 14px 을 훑는다. `dy = -1` 이 1px 보더라서 **0 부터** 시작한다 — 2 부터
      // 시작했더니 그림자 띠(실측 2px)를 통째로 건너뛰어 "그림자 0" 이라는 오측이 나왔다.
      const samples = [];
      for (let dy = 0; dy <= 13; dy += 1) samples.push({ dy, c: px(bottom + dy) });
      const background = px(bottom + 40);
      const darkest = samples.reduce((a, b) => (lum(a.c) <= lum(b.c) ? a : b));
      const [hi, lo] = [lum(background), lum(darkest.c)].sort((p, q) => q - p);
      const bgLum = lum(background);
      return {
        background: `rgb(${background.r}, ${background.g}, ${background.b})`,
        darkest: `rgb(${darkest.c.r}, ${darkest.c.g}, ${darkest.c.b})`,
        darkestAtPx: darkest.dy,
        contrast: Number(((hi + 0.05) / (lo + 0.05)).toFixed(4)),
        // 배경과 다른 픽셀이 **몇 줄**인가 — 그림자의 두께다.
        bandPx: samples.filter((s2) => Math.abs(lum(s2.c) - bgLum) > 0.001).length,
        profile: samples.map((s2) => `${s2.dy}:${s2.c.r},${s2.c.g},${s2.c.b}`).join(' '),
      };
    },
    { dataUrl: `data:image/png;base64,${pngBuffer.toString('base64')}`, ...target },
  );
  await reader.close();
  return result;
}

const browser = await launch();
const report = { baseUrl: BASE_URL, measuredAt: new Date().toISOString(), rows: [] };

for (const colorScheme of SCHEMES) {
  for (const [width, height] of SIZES) {
    const page = await newPage(browser, { width, height, colorScheme });
    await page.goto(BASE_URL);
    await waitForShell(page);
    await page.waitForTimeout(600);
    await seed(page).catch((e) => log(`  seed 실패(${width}/${colorScheme}):`, e.message));
    await page.locator('li[data-flip-id] input[type=checkbox]').first().check();
    await page.waitForTimeout(900);

    const density = {};
    for (const [name, selector] of COLUMNS) {
      density[name] = await page.evaluate(inkDensity, selector);
    }
    const cards = await page.evaluate(cardCensus);
    const completion = await page.evaluate(completionSurfaces);
    // 테마 설정(⚙) 팝오버를 열어야 강조색 스와치가 화면에 선다 — 링 조사는 그 상태에서 한다.
    const themeButton = page.getByRole('button', { name: '테마 설정' }).first();
    if (await themeButton.isVisible().catch(() => false)) {
      await themeButton.click().catch(() => undefined);
      await page.waitForTimeout(500);
    }
    const rings = await page.evaluate(selectedRingCensus, RING_GROUPS);

    let shadowPixels = null;
    if (SHOT_WIDTHS.has(width)) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      const png = await page.screenshot({ path: out(`t60-${colorScheme}-${width}x${height}.png`) });
      if (width === 1440) shadowPixels = await measureShadowPixels(browser, page, png);
    }

    report.rows.push({
      colorScheme,
      width,
      height,
      density,
      cards,
      completion,
      rings,
      shadowPixels,
    });
    const main = density['메인 스크롤 영역'];
    log(
      `${colorScheme} ${width}px  메인공백 ${main?.emptyRatio ?? '?'} (꼬리 ${main?.tailEmptyPx ?? '?'}px)  ` +
        `사이드바공백 ${density['사이드바 컬럼']?.emptyRatio ?? '없음'}  ` +
        `인사이트공백 ${density['인사이트 컬럼']?.emptyRatio ?? '없음'}  ` +
        `카드 ${cards.length}개(그림자 ${cards.filter((c) => c.hasShadow).length})  ` +
        `달성률텍스트 ${completion.texts.length}`,
    );
    await page.context().close();
  }
}

await browser.close();

const wide = report.rows.find((r) => r.colorScheme === 'light' && r.width === 1440);
log('\n--- 1440 라이트 카드 명도비(뒤에 깔린 색 대비) ---');
for (const c of wide.cards) {
  log(
    `  ${c.w}x${c.h} ${c.bg} vs ${c.behind} = ${c.contrast}:1  ` +
      `보더 ${c.borderWidth}  그림자 ${c.hasShadow ? `있음(a=${c.shadowAlpha})` : '없음'}  ${c.label}`,
  );
}
log('\n--- 선택됨 링(1440 라이트) ---');
for (const e of wide.rings.entries) {
  log(`  ${e.group}: ${e.found ? JSON.stringify(e.ring) : '화면에 없음'}`);
}
log(`\n링 토큰: 색 ${wide.rings.ringColorToken} / 굵기 ${wide.rings.ringWidthToken}`);
log('\n--- 카드 아래 그림자의 실제 픽셀(1440) ---');
for (const scheme of SCHEMES) {
  const row = report.rows.find((r) => r.colorScheme === scheme && r.width === 1440);
  log(`  ${scheme}: ${JSON.stringify(row?.shadowPixels)}`);
}
log('\n저장: ' + writeJson('t60-density-and-surface.json', report));
