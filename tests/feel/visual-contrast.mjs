// T-25 항목 7 — 시각 대조. 라이트/다크 × 1440/1280/1024/768/400 을 찍고, 화면의 색·라운드·그림자·
// 여백을 **수치로** 뽑아 `docs/research/` 의 레퍼런스 앱 UX 문서 §6(디자인 시스템 추정)과 대조한다.
//
// 실행: node tests/feel/visual-contrast.mjs   (서버가 먼저 떠 있어야 한다 — harness 가 없으면 멈춘다)
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
import {
  completionSurfaces,
  emptinessReport,
  fixedHeaderHeight,
  paletteReport,
  radiusCensus,
  shadowCensus,
  surfaceReport,
} from './lib/probe.mjs';

/** 리서치 §6 "컬러 팔레트 (추정 HEX 후보)" — 대조의 기준값. 출처는 그 문서 한 곳이다. */
const RESEARCH = {
  bgLight: ['#ffffff', '#fafafc'],
  bgDark: ['#121212', '#1a1a1e'],
  accent: ['#7cc6ff', '#5fa8e0', '#b9a6f5'],
  text: '#2b2b33',
  muted: '#8e8e96',
  done: '#c7c7cc',
  radiusRange: [12, 20],
};

/** R3 은 1280×800 에서 규정된다 — 그 조합을 반드시 포함한다. */
const SIZES = [
  [1440, 900],
  [1280, 800],
  [1024, 800],
  [768, 800],
  [400, 800],
];
const SCHEMES = ['light', 'dark'];

const browser = await launch();
const report = { baseUrl: BASE_URL, research: RESEARCH, shots: [], measures: [] };

for (const colorScheme of SCHEMES) {
  for (const [width, height] of SIZES) {
    const page = await newPage(browser, { width, height, colorScheme });
    await page.goto(BASE_URL);
    await waitForShell(page);
    await page.waitForTimeout(600);
    // 데이터가 있는 화면과 빈 화면은 여백이 다르다 — 항목이 있는 쪽을 기준으로 잰다.
    await seed(page).catch((e) => log(`  seed 실패(${width}/${colorScheme}):`, e.message));
    // 완료 상태의 색(리서치 §6 "취소선 + 저채도 회색")도 대조 대상이라 한 건은 완료시켜 둔다.
    await page.locator('li[data-flip-id] input[type=checkbox]').first().check();
    await page.waitForTimeout(900);

    const name = `${colorScheme}-${width}x${height}.png`;
    await page.screenshot({ path: out(name), fullPage: false });
    report.shots.push(name);

    const measure = {
      colorScheme,
      width,
      height,
      palette: await page.evaluate(paletteReport),
      surfaces: await page.evaluate(surfaceReport),
      shadows: await page.evaluate(shadowCensus),
      emptiness: await page.evaluate(emptinessReport),
      fixedHeaderHeight: await page.evaluate(fixedHeaderHeight),
      completion: await page.evaluate(completionSurfaces),
      radii: await page.evaluate(radiusCensus),
      docTheme: await page.evaluate(() => document.documentElement.dataset.theme ?? '(없음)'),
      hasHorizontalScroll: await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    };
    report.measures.push(measure);
    log(
      `${colorScheme} ${width}px  고정영역 ${measure.fixedHeaderHeight}px  ` +
        `그림자 ${measure.shadows.shadowed}/${measure.shadows.total}  ` +
        `메인공백 ${measure.emptiness.mainScroller?.emptyRatio ?? '?'}  ` +
        `달성률표면 ${measure.completion.texts.length}텍스트/${measure.completion.rings.length}링`,
    );
    await page.context().close();
  }
}

await browser.close();
log('\n저장:', writeJson('visual-contrast.json', report));
log('스크린샷:', out('<scheme>-<width>.png'));
