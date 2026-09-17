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

    if (SHOT_WIDTHS.has(width)) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      await page.screenshot({ path: out(`t60-${colorScheme}-${width}x${height}.png`) });
    }

    report.rows.push({ colorScheme, width, height, density, cards, completion, rings });
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
log('\n저장: ' + writeJson('t60-density-and-surface.json', report));
