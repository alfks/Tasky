// T-60 항목 2 — T-25 가 **재지 못한 것** 두 가지를 잰다(FEEL_REPORT §8 "측정하지 않은 것").
//
//   · 커맨드 팔레트가 **열린 상태**의 사용감 (T-25 베이스에는 팔레트가 없었다)
//   · **긴 목록(100건+)** 에서의 여백과 모션
//
// 실행: node tests/feel/palette-and-longlist.mjs   (서버가 먼저 떠 있어야 한다)
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
import { cardCensus, inkDensity } from './lib/probe-density.mjs';

const LONG_COUNT = 120;
const report = { baseUrl: BASE_URL, measuredAt: new Date().toISOString(), palette: {}, long: {} };

/**
 * 팔레트가 열렸는지 확인하는 **접근 이름** 기준 셀렉터. T-25 의 프로브는
 * `[role=dialog][aria-label="명령 팔레트"]` 를 찾았는데, 실제 팔레트는 `aria-labelledby` 로
 * 제목을 가리킨다 — 그래서 팔레트가 있는데도 `palettePresent: false` 가 나왔다(오측).
 * 여기서는 팔레트 고유의 콤보박스로 판정한다.
 */
const PALETTE_INPUT = 'input[role=combobox][aria-label="할 일 검색 또는 명령"]';

function paletteSurface() {
  const dialog = document.querySelector('[role=dialog]');
  if (dialog === null) return { open: false };
  const r = dialog.getBoundingClientRect();
  const s = getComputedStyle(dialog);
  const input = document.querySelector('input[role=combobox]');
  const ir = input === null ? null : input.getBoundingClientRect();
  const options = [...document.querySelectorAll('[role=option]')];
  const selected = options.find((o) => o.getAttribute('aria-selected') === 'true') ?? null;
  const painted = s.boxShadow
    .split(/,(?![^(]*\))/)
    .map((x) => x.trim())
    .filter((x) => {
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(x);
      return m !== null && (m[4] === undefined || Number(m[4]) > 0);
    });
  return {
    open: true,
    size: `${Math.round(r.width)}x${Math.round(r.height)}`,
    top: Math.round(r.top),
    background: s.backgroundColor,
    radius: s.borderTopLeftRadius,
    shadow: painted.length === 0 ? null : painted.join(' | '),
    // 입력칸 위에 남는 빈 띠 — 팔레트 리뷰가 "53px 빈 띠" 로 지적했던 자리다.
    inputTopGapPx: ir === null ? null : Math.round(ir.top - r.top),
    optionCount: options.length,
    selectedRow:
      selected === null
        ? null
        : {
            text: (selected.textContent ?? '').trim().slice(0, 28),
            background: getComputedStyle(selected).backgroundColor,
            boxShadow: getComputedStyle(selected).boxShadow.slice(-48),
            height: Math.round(selected.getBoundingClientRect().height),
          },
    // "선택됨" 을 무엇으로 말하는가 — 선택 행과 **바로 옆 비선택 행**을 같이 찍어야 비교가 된다.
    unselectedRow: (() => {
      const other = options.find((o) => o.getAttribute('aria-selected') !== 'true');
      return other === undefined
        ? null
        : {
            background: getComputedStyle(other).backgroundColor,
            color: getComputedStyle(other).color,
          };
    })(),
    selectedKbd: (() => {
      const k = selected === null ? null : selected.querySelector('kbd');
      return k === null
        ? null
        : {
            background: getComputedStyle(k).backgroundColor,
            color: getComputedStyle(k).color,
            borderColor: getComputedStyle(k).borderTopColor,
            size: `${Math.round(k.getBoundingClientRect().width)}x${Math.round(k.getBoundingClientRect().height)}`,
          };
    })(),
  };
}

/** rAF 간격을 모아 둔다 — 긴 목록에서 스크롤·체크가 끊기는지 보기 위한 것. */
function startFrameProbe() {
  window.__feelFrames = [];
  let last = performance.now();
  const tick = (now) => {
    window.__feelFrames.push(now - last);
    last = now;
    window.__feelRaf = requestAnimationFrame(tick);
  };
  window.__feelRaf = requestAnimationFrame(tick);
}

function stopFrameProbe() {
  cancelAnimationFrame(window.__feelRaf);
  const f = window.__feelFrames.slice(1);
  return {
    frames: f.length,
    over25ms: f.filter((x) => x > 25).length,
    max: Number(Math.max(0, ...f).toFixed(1)),
  };
}

const browser = await launch();

// ── 1. 커맨드 팔레트가 열린 화면 ────────────────────────────────────────────────
for (const colorScheme of ['light', 'dark']) {
  const page = await newPage(browser, { width: 1440, height: 900, colorScheme });
  await page.goto(BASE_URL);
  await waitForShell(page);
  await page.waitForTimeout(600);
  await seed(page).catch((e) => log('  seed 실패:', e.message));
  await page.keyboard.press('Control+k');
  await page.waitForSelector(PALETTE_INPUT, { timeout: 5000 });
  await page.waitForTimeout(500);
  const empty = await page.evaluate(paletteSurface);
  await page.screenshot({ path: out(`t60-palette-${colorScheme}-1440x900.png`) });
  // 질의를 넣은 상태 — 실제로 쓰는 모습은 이쪽이다.
  await page.locator(PALETTE_INPUT).fill('장');
  await page.waitForTimeout(400);
  const queried = await page.evaluate(paletteSurface);
  await page.screenshot({ path: out(`t60-palette-query-${colorScheme}-1440x900.png`) });
  report.palette[colorScheme] = { empty, queried };
  log(
    `팔레트 ${colorScheme}: ${empty.size} top=${empty.top} 입구여백 ${empty.inputTopGapPx}px  ` +
      `옵션 ${empty.optionCount}→${queried.optionCount}  그림자 ${empty.shadow === null ? '없음' : '있음'}  ` +
      `선택행 ${JSON.stringify(empty.selectedRow)}`,
  );
  await page.context().close();
}

// ── 2. 긴 목록(120건) ──────────────────────────────────────────────────────────
{
  const page = await newPage(browser, { width: 1440, height: 900 });
  await page.goto(BASE_URL);
  await waitForShell(page);
  await page.waitForTimeout(600);
  await seed(page, ['첫 항목']);
  const addRow = page.getByRole('button', { name: '+ 할 일 추가' }).first();
  await addRow.click();
  const input = page.getByRole('textbox', { name: /할 일 추가/ }).first();
  for (let i = 2; i <= LONG_COUNT; i += 1) {
    await input.fill(`항목 ${i}`);
    await input.press('Enter');
    // 대기 없이 연속으로 넣으면 **10% 가량이 유실된다**(실측: 40건 중 36건). 원인이 도구 쪽
    // 입력 경합인지 앱 쪽 연속 입력 유실인지는 이 티켓에서 가리지 않았다 — 재현 조건만
    // FEEL_REPORT 에 적어 두고, 여기서는 세는 대상이 흔들리지 않도록 기다린다.
    await page.waitForTimeout(150);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1200);

  const count = await page.locator('li[data-flip-id]').count();
  const density = await page.evaluate(inkDensity, 'main#shell-main > div:nth-child(2)');
  const scroll = await page.evaluate(() => {
    const el = document.querySelector('main#shell-main > div:nth-child(2)');
    const rows = [...document.querySelectorAll('li[data-flip-id]')];
    const gaps = rows
      .slice(1)
      .map((r, i) => r.getBoundingClientRect().top - rows[i].getBoundingClientRect().bottom);
    return {
      scrollHeight: el === null ? null : el.scrollHeight,
      clientHeight: el === null ? null : el.clientHeight,
      rowHeight: rows.length === 0 ? null : Math.round(rows[0].getBoundingClientRect().height),
      rowGap: gaps.length === 0 ? null : Number((gaps[0] ?? 0).toFixed(1)),
      domNodes: document.querySelectorAll('body *').length,
    };
  });

  // 스크롤 프레임
  await page.evaluate(startFrameProbe);
  await page.mouse.move(700, 500);
  for (let i = 0; i < 20; i += 1) {
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(300);
  const scrollFrames = await page.evaluate(stopFrameProbe);

  // 체크 한 번 — 긴 목록에서 재배치가 얼마나 걸리는가
  await page.evaluate(() =>
    document.querySelector('main#shell-main > div:nth-child(2)')?.scrollTo(0, 0),
  );
  await page.waitForTimeout(400);
  await page.evaluate(startFrameProbe);
  const t0 = Date.now();
  await page.locator('li[data-flip-id] input[type=checkbox]').first().check();
  await page.waitForTimeout(1500);
  const toggleFrames = await page.evaluate(stopFrameProbe);
  const toggleMs = Date.now() - t0;
  const cards = await page.evaluate(cardCensus);
  await page.screenshot({ path: out('t60-long-light-1440x900.png') });

  report.long = { count, density, scroll, scrollFrames, toggleFrames, toggleMs, cards };
  log(
    `\n긴 목록 ${count}건: 메인공백 ${density?.emptyRatio}  스크롤높이 ${scroll.scrollHeight}px/` +
      `${scroll.clientHeight}px  행 ${scroll.rowHeight}px(간격 ${scroll.rowGap}px)  DOM ${scroll.domNodes}개\n` +
      `  스크롤 프레임 >25ms ${scrollFrames.over25ms}/${scrollFrames.frames} 최대 ${scrollFrames.max}ms  ` +
      `체크 프레임 >25ms ${toggleFrames.over25ms}/${toggleFrames.frames} 최대 ${toggleFrames.max}ms`,
  );
  await page.context().close();
}

await browser.close();
log('\n저장: ' + writeJson('t60-palette-and-longlist.json', report));
