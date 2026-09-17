// T-65 — "대기 없이 Enter 연타 시 40건 중 36건만 남는다" 가 **도구 경합인지 앱 유실인지** 가른다.
//
// 세 숫자를 따로 센다:
//   보낸 것(스크립트가 시도한 횟수) / 브라우저가 실제로 받은 것(window capture 단계 keydown) /
//   저장된 것(**IndexedDB 직독** — 화면 목록은 렌더 타이밍에 좌우돼 증거가 되지 못한다).
//
// 세 모드로 돌린다. 모드가 갈리는 지점이 곧 답이다.
//   A) playwright  — `fill` + `press('Enter')`, 간격 0ms (T-60 이 유실을 본 그 경로)
//   B) playwright  — 같은 경로, 간격 150ms (T-60 이 40/40 을 본 대조군)
//   C) in-page     — CDP 입력을 통째로 빼고 페이지 안에서 직접 이벤트를 쏜다. 여기서도 유실되면
//                    **도구는 용의선상에서 빠진다**(이벤트가 전부 도착한 것을 카운터가 증명한다).
//
// 사용: node tests/feel/rapid-input.mjs   (FEEL_TRIALS 로 시행 횟수, FEEL_COUNT 로 입력 개수)
import { BASE_URL, launch, log, newPage, waitForShell, writeJson } from './lib/harness.mjs';

const COUNT = Number(process.env.FEEL_COUNT ?? 40);
const TRIALS = Number(process.env.FEEL_TRIALS ?? 3);
const TITLE = (i) => `항목 ${i}`;

/** 창 capture 단계에서 센다 — React 의 루트 리스너보다 먼저라 "앱에 닿기 전" 의 수다. */
function installCounters() {
  window.__t65 = { enter: 0, input: 0, seen: [] };
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Enter') return;
      window.__t65.enter += 1;
      window.__t65.seen.push(e.target instanceof HTMLInputElement ? e.target.value : null);
    },
    true,
  );
  window.addEventListener('input', () => {
    window.__t65.input += 1;
  }, true);
}

/** IndexedDB 를 직접 읽는다(T-53 이 쓴 방식). 툼스톤(`deletedAt`)은 뺀다. */
function readStore() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('tasky');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const req = db.transaction('todos', 'readonly').objectStore('todos').getAll();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        db.close();
        resolve(
          req.result
            .filter((r) => r.deletedAt === undefined || r.deletedAt === null)
            .map((r) => ({ title: r.title, order: r.order })),
        );
      };
    };
  });
}

/** 페이지 안에서 직접 쏘는 모드 C. 이벤트 전달에 CDP 가 끼지 않는다. */
function typeInPage(count) {
  const input = document.querySelector('input[aria-label$="에 할 일 추가"]');
  if (input === null) throw new Error('입력 행을 찾지 못했다');
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  const step = async (i) => {
    setValue.call(input, `항목 ${i}`);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    await new Promise((r) => {
      setTimeout(r, 0);
    });
  };
  return (async () => {
    for (let i = 1; i <= count; i += 1) await step(i);
  })();
}

async function openAddRow(page) {
  await page.goto(BASE_URL);
  await waitForShell(page);
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: '+ 할 일 추가' }).first().click();
  const input = page.getByRole('textbox', { name: /할 일 추가/ }).first();
  await input.waitFor({ state: 'visible' });
  return input;
}

async function runTrial(browser, mode, gapMs) {
  const page = await newPage(browser);
  await page.addInitScript(installCounters);
  const input = await openAddRow(page);

  if (mode === 'in-page') {
    await page.evaluate(typeInPage, COUNT);
  } else {
    for (let i = 1; i <= COUNT; i += 1) {
      await input.fill(TITLE(i));
      await input.press('Enter');
      if (gapMs > 0) await page.waitForTimeout(gapMs);
    }
  }

  // 마지막 저장이 IndexedDB 에 닿을 시간을 넉넉히 준다 — 여기서 짧게 끊으면 "유실" 이 아니라
  // "아직 안 쓴 것" 을 유실로 적게 된다.
  await page.waitForTimeout(3000);

  const counters = await page.evaluate(() => window.__t65);
  const leftover = await input.inputValue().catch(() => null);
  const rows = await page.evaluate(readStore);
  const domRows = await page.locator('li[data-flip-id]').count();
  await page.context().close();

  const titles = rows.map((r) => r.title);
  const missing = Array.from({ length: COUNT }, (_, i) => TITLE(i + 1)).filter(
    (t) => !titles.includes(t),
  );
  const duplicated = titles.filter((t, i) => titles.indexOf(t) !== i);
  return {
    mode,
    gapMs,
    sent: COUNT,
    received: counters.enter,
    stored: rows.length,
    dom: domRows,
    leftover,
    missing,
    duplicated,
    orders: rows.map((r) => r.order),
  };
}

const browser = await launch();
const report = { baseUrl: BASE_URL, count: COUNT, trials: TRIALS, runs: [] };

const modes = [
  ['playwright', 0],
  ['playwright', 150],
  ['in-page', 0],
];

for (const [mode, gapMs] of modes) {
  for (let t = 1; t <= TRIALS; t += 1) {
    const r = await runTrial(browser, mode, gapMs);
    report.runs.push({ trial: t, ...r });
    log(
      `${mode} 간격 ${gapMs}ms · ${t}/${TRIALS}회: 보낸 ${r.sent} / 받은 ${r.received} / 저장 ${r.stored}` +
        `  (화면 ${r.dom}, 입력칸 잔여 ${JSON.stringify(r.leftover)})` +
        (r.missing.length > 0 ? `\n    빠진 것: ${r.missing.join(', ')}` : '') +
        (r.duplicated.length > 0 ? `\n    중복: ${r.duplicated.join(', ')}` : ''),
    );
  }
}

await browser.close();

log('\n--- 모드별 요약(시행 평균) ---');
for (const [mode, gapMs] of modes) {
  const rs = report.runs.filter((r) => r.mode === mode && r.gapMs === gapMs);
  const avg = (k) => (rs.reduce((s, r) => s + r[k], 0) / rs.length).toFixed(1);
  log(
    `${mode} 간격 ${gapMs}ms (${rs.length}회): 보낸 ${COUNT} / 받은 ${avg('received')} / 저장 ${avg('stored')}`,
  );
}
log(`\n원시 출력: ${writeJson('t65-rapid-input.json', report)}`);
