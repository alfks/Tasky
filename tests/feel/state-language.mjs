// T-25 항목 7 보강 — **상태의 언어가 컴포넌트마다 같은가.**
//
// 색·라운드·폰트가 토큰으로 통일돼 있어도, "선택됨" 을 한쪽은 강조색으로 꽉 채워 말하고 다른 쪽은
// 1.1:1 회색으로 말하면 화면이 한 제품으로 읽히지 않는다. 그 불일치는 어느 컴포넌트의 R 규칙에도
// 안 걸린다 — 각자는 자기 규칙을 지켰기 때문이다. 그래서 여기서 **가로로** 본다.
//
// 실행: node tests/feel/state-language.mjs
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
  disabledCensus,
  focusRingOf,
  nativeControlCensus,
  stateLanguageReport,
} from './lib/probe-state.mjs';

const browser = await launch();
const result = { baseUrl: BASE_URL, schemes: {} };

for (const colorScheme of ['light', 'dark']) {
  const page = await newPage(browser, { width: 1440, height: 900, colorScheme });
  await page.goto(BASE_URL);
  await waitForShell(page);
  await page.waitForTimeout(700);
  await seed(page, ['장보기', '방 청소']);
  await page.waitForTimeout(400);

  const scheme = { selection: {}, focusRings: [], disabled: [], hover: [] };

  // (1) 화면에 이미 떠 있는 선택 묶음: 날짜 스트립 · 타이머 시간
  scheme.selection.기본화면 = await page.evaluate(stateLanguageReport);

  // (2) 테마 설정 팝오버를 열어 모드 라디오 + 강조색 스와치를 노출시킨다
  await page.getByRole('button', { name: '테마 설정' }).click();
  await page.waitForTimeout(500);
  scheme.selection.테마설정 = await page.evaluate(stateLanguageReport);
  await page.screenshot({ path: out(`state-theme-popover-${colorScheme}.png`) });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // (3) 카테고리 만들기 폼의 색상 스와치
  await page.getByRole('button', { name: '+ 카테고리 추가' }).click();
  await page.waitForTimeout(500);
  scheme.selection.카테고리폼 = await page.evaluate(stateLanguageReport);
  await page.screenshot({ path: out(`state-category-form-${colorScheme}.png`) });
  scheme.disabled = await page.evaluate(disabledCensus);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // (4) 포커스 링 — Tab 궤적 22칸의 outline 값을 모은다.
  // **전이가 끝난 뒤에 읽는다.** 대부분의 버튼이 `transition-colors` 를 달고 있어 outline-color 까지
  // 전이 대상이라, 포커스 직후에 읽으면 중간값(currentColor 쪽)이 잡힌다. 그걸 "포커스 링 색이
  // 컴포넌트마다 다르다" 로 읽은 오측이 이 패스에서 실제로 한 번 있었다.
  await page.evaluate(() => document.activeElement?.blur());
  for (let i = 0; i < 22; i += 1) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    const ring = await page.evaluate(focusRingOf);
    if (ring !== null) scheme.focusRings.push({ ...ring, outlineClassCount: undefined });
  }

  // (6) 네이티브 컨트롤이 공용 프리미티브와 섞여 있는가
  scheme.nativeControls = await page.evaluate(nativeControlCensus);

  // (5) 호버 — 같은 종류의 컨트롤이 호버를 같은 방식으로 말하는가
  const hoverTargets = [
    ['날짜 셀', 'button[role=radio]'],
    ['사이드바 카테고리 행', 'nav[aria-label="카테고리"] button'],
    ['투두 행 제목', 'li[data-flip-id] button[id]'],
    ['투두 행 ⋯ 메뉴', 'li[data-flip-id] button[aria-haspopup=menu]'],
    ['+ 할 일 추가', 'main button'],
    ['투두 행(li) 전체', 'li[data-flip-id]'],
    ['인사이트 [집중 시작](primary)', 'aside[aria-label="오늘 요약"] button'],
  ];
  for (const [label, selector] of hoverTargets) {
    const el = page.locator(selector).first();
    if ((await el.count()) === 0) continue;
    const read = () =>
      el.evaluate((n) => {
        const s = getComputedStyle(n);
        // 배경만 보면 primary 버튼을 놓친다 — 그쪽 호버는 `opacity-90` 이다(Button.tsx).
        return {
          bg: s.backgroundColor,
          color: s.color,
          opacity: s.opacity,
          boxShadow: s.boxShadow,
        };
      });
    const before = await read();
    await el.hover();
    await page.waitForTimeout(250);
    const after = await read();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(200);
    scheme.hover.push({
      label,
      기본: `${before.bg} / opacity ${before.opacity}`,
      호버: `${after.bg} / opacity ${after.opacity}`,
      바뀌었나:
        before.bg !== after.bg || before.color !== after.color || before.opacity !== after.opacity,
    });
  }

  result.schemes[colorScheme] = scheme;
  await page.context().close();
}

// 커맨드 팔레트는 이 베이스에 **없다**(T-19/#35 미머지). 없다는 사실 자체를 기록으로 남긴다.
{
  const page = await newPage(browser, { width: 1440, height: 900 });
  await page.goto(BASE_URL);
  await waitForShell(page);
  await page.waitForTimeout(700);
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(600);
  result.palettePresent = await page.evaluate(
    () => document.querySelector('[role=dialog][aria-label="명령 팔레트"]') !== null,
  );
  await page.context().close();
}

await browser.close();

for (const [scheme, data] of Object.entries(result.schemes)) {
  log(`\n=== ${scheme} ===`);
  for (const [where, groups] of Object.entries(data.selection)) {
    for (const [name, g] of Object.entries(groups)) {
      log(`  [${where}] ${name}: 신호=${g.선택신호} 명도비=${g.선택_대_비선택_명도비 ?? '-'}`);
    }
  }
  const rings = new Set(data.focusRings.map((r) => `${r.outline} / ${r.outlineOffset}`));
  log(`  포커스 링 종류 ${rings.size}가지: ${[...rings].join(' | ')}`);
  log(
    `  호버: ${data.hover.map((h) => `${h.label}=${h.바뀌었나 ? '변함' : '안변함'}`).join(', ')}`,
  );
  log(
    `  네이티브 컨트롤 ${data.nativeControls.length}개: ` +
      data.nativeControls
        .map((n) => `${n.type} ${n.size}${n.hasFocusRingClass ? '' : ' (앱 포커스링 없음)'}`)
        .join(', '),
  );
}
log(`\n커맨드 팔레트가 이 베이스에 있는가: ${result.palettePresent}`);
log('\n저장: ' + writeJson('state-language.json', result));
