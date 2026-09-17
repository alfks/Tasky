// T-65 part 2 — `rapid-input.mjs` 가 "앱이 흘린다" 를 보였다면, 여기서는 **그 창이 얼마나 넓고
// 사용자 손에서 어떻게 보이는지**를 잰다.
//
// 재는 것:
//   1) 저장 창(ms) — `Enter` 뒤 입력칸이 **스스로** 비워지기까지. 저장이 끝나면 앱이 텍스트를 지운다.
//   2) 그 창 안에 친 글자는 살아남는가 — `Enter` 후 N ms 뒤에 한 글자를 넣고 1.2s 뒤에 본다.
//      지워져 있으면 **사용자가 친 글자를 앱이 덮어 지운 것**이다(화면에 오류도 뜨지 않는다).
//   3) 한글 IME(R4) — 조합 → 확정 → 제출을 낱말마다 쉼 없이 반복하면 몇 건이 남는가.
//
// 사용: node tests/feel/rapid-input-window.mjs
import { BASE_URL, launch, log, newPage, waitForShell, writeJson } from './lib/harness.mjs';

const TRIALS = Number(process.env.FEEL_TRIALS ?? 3);
const DELAYS = [0, 5, 10, 15, 20, 30, 60, 150];

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
        resolve(req.result.filter((r) => r.deletedAt == null).map((r) => r.title));
      };
    };
  });
}

/** Enter 가 조합 중에 온 것인지까지 센다 — R4 가 무시해야 하는 키와 제출 키를 갈라 본다. */
function installCounters() {
  window.__t65w = { enters: [], compositionEnd: 0 };
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Enter')
        window.__t65w.enters.push({ composing: e.isComposing, code: e.keyCode });
    },
    true,
  );
  window.addEventListener(
    'compositionend',
    () => {
      window.__t65w.compositionEnd += 1;
    },
    true,
  );
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

/** 1) `Enter` 부터 입력칸이 비워지기까지 몇 ms 인가. 5ms 마다 본다. */
async function measureWindow(browser) {
  const page = await newPage(browser);
  const input = await openAddRow(page);
  const samples = [];
  for (let i = 1; i <= 5; i += 1) {
    await input.fill(`창 ${i}`);
    const t0 = Date.now();
    await input.press('Enter');
    while ((await input.inputValue()) !== '' && Date.now() - t0 < 3000) {
      await page.waitForTimeout(5);
    }
    samples.push(Date.now() - t0);
    await page.waitForTimeout(200);
  }
  await page.context().close();
  return samples;
}

/**
 * 2) 페이지 안에서: 한 건을 넣고 `delay` ms 뒤에 **한 글자를 더 친다**. 도구 왕복이 끼지 않으므로
 * 지연이 정확하고, 글자가 입력칸에 들어간 것은 반환값 `afterType` 이 증언한다.
 */
function typeIntoWindow(delay) {
  const input = document.querySelector('input[aria-label$="에 할 일 추가"]');
  if (input === null) throw new Error('입력 행을 찾지 못했다');
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  const fire = (value) => {
    setValue.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const sleep = (ms) =>
    new Promise((r) => {
      setTimeout(r, ms);
    });
  return (async () => {
    fire('첫째');
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    await sleep(delay);
    fire(`${input.value}가`); // 사용자가 다음 항목의 첫 글자를 친다
    const afterType = input.value;
    await sleep(1200);
    return { afterType, settled: input.value };
  })();
}

async function windowSweep(browser, delay) {
  const page = await newPage(browser);
  await openAddRow(page);
  const r = await page.evaluate(typeIntoWindow, delay);
  const stored = await page.evaluate(readStore);
  await page.context().close();
  return { delay, ...r, stored, survived: r.settled.includes('가') };
}

/** 한글 조합을 CDP 로 흉내 낸다(T-53 이 쓴 방식). `replacementStart/End` 는 넘기지 않는다. */
async function compose(cdp, page, steps) {
  for (const text of steps) {
    await cdp.send('Input.imeSetComposition', {
      text,
      selectionStart: text.length,
      selectionEnd: text.length,
    });
    await page.waitForTimeout(40);
  }
}

/**
 * 3) 한글 IME: 조합 → **확정** → 제출 `Enter` 를 낱말마다 쉼 없이. 확정은 `Input.insertText` 로
 * 한다 — 진짜 조합기가 확정 `Enter` 로 하는 일이 그것이고, `imeSetComposition` 만으로는 조합이
 * 끝나지 않아 뒤따르는 `Enter` 가 전부 `isComposing` 으로 남는다(그건 R4 가 무시하는 것이 맞다).
 */
async function imeRun(browser) {
  const page = await newPage(browser);
  await page.addInitScript(installCounters);
  const cdp = await page.context().newCDPSession(page);
  const input = await openAddRow(page);
  await input.click();

  const words = [
    ['ㅇ', '우', '울', '우유'],
    ['ㄱ', '계', '곌', '계란'],
    ['ㅃ', '빵'],
  ];
  for (const steps of words) {
    await compose(cdp, page, steps);
    await cdp.send('Input.insertText', { text: steps[steps.length - 1] }); // 확정
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    });
    // 기다리지 않는다 — 다음 낱말의 조합을 바로 시작한다.
  }
  await page.waitForTimeout(2000);
  const counters = await page.evaluate(() => window.__t65w);
  const settled = await input.inputValue();
  const stored = await page.evaluate(readStore);
  await page.context().close();
  return { words: words.length, counters, settled, stored };
}

/**
 * 4) **차가운 첫 방문 + 느린 회선.** Dexie 는 지연 로드 청크라(ADR-0013) 첫 저장이 그 청크를
 * 기다린다. 그 사이 사람 속도(`gapMs`)로 친 다음 항목들이 남는지 본다 — 창이 ms 가 아니라
 * 초 단위로 벌어지는 유일한 현실 경로다.
 */
async function coldSlowRun(browser, gapMs, titles) {
  const page = await newPage(browser);
  await page.addInitScript(installCounters);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 400,
    downloadThroughput: (400 * 1024) / 8,
    uploadThroughput: (400 * 1024) / 8,
  });
  const input = await openAddRow(page);
  for (const title of titles) {
    await input.fill(title);
    await input.press('Enter');
    await page.waitForTimeout(gapMs);
  }
  await page.waitForTimeout(6000);
  const counters = await page.evaluate(() => window.__t65w);
  const leftover = await input.inputValue().catch(() => null);
  const stored = await page.evaluate(readStore);
  await page.context().close();
  const missing = titles.filter((t) => !stored.includes(t));
  return {
    gapMs,
    sent: titles.length,
    received: counters.enters.length,
    stored,
    missing,
    leftover,
  };
}

const browser = await launch();
const report = { baseUrl: BASE_URL, trials: TRIALS, window: null, sweep: [], ime: [], cold: [] };

report.window = await measureWindow(browser);
log(
  `저장 창(Enter→입력칸 자동 비움): ${report.window.join(', ')} ms  최대 ${Math.max(...report.window)}ms`,
);

log('\n--- Enter 뒤 N ms 에 친 한 글자는 살아남는가 ---');
for (const delay of DELAYS) {
  const rs = [];
  for (let t = 1; t <= TRIALS; t += 1) rs.push(await windowSweep(browser, delay));
  report.sweep.push(...rs);
  const alive = rs.filter((r) => r.survived).length;
  log(
    `+${String(delay).padStart(3)}ms: 살아남음 ${alive}/${TRIALS}회  ` +
      `입력 직후 ${JSON.stringify(rs[0].afterType)} → 1.2s 뒤 ${JSON.stringify(rs[0].settled)}` +
      `  저장 ${JSON.stringify(rs[0].stored)}`,
  );
}

log('\n--- 한글 IME 로 3낱말 연속 (R4) ---');
for (let t = 1; t <= TRIALS; t += 1) {
  const r = await imeRun(browser);
  report.ime.push(r);
  log(
    `${t}/${TRIALS}회: Enter ${r.counters.enters.length}회(조합 중 ` +
      `${r.counters.enters.filter((e) => e.composing).length}회) · compositionend ` +
      `${r.counters.compositionEnd}회  잔여 ${JSON.stringify(r.settled)}  ` +
      `저장 ${r.stored.length}/${r.words}건 ${JSON.stringify(r.stored)}`,
  );
}

log('\n--- 차가운 첫 방문 + 느린 회선(400ms 지연·400kbps)에서 사람 속도로 5건 ---');
for (const gapMs of [300, 800]) {
  for (let t = 1; t <= TRIALS; t += 1) {
    const r = await coldSlowRun(browser, gapMs, ['우유', '계란', '빵', '사과', '물']);
    report.cold.push(r);
    log(
      `간격 ${gapMs}ms · ${t}/${TRIALS}회: 보낸 ${r.sent} / 받은 ${r.received} / 저장 ${r.stored.length}` +
        `  ${JSON.stringify(r.stored)}` +
        (r.missing.length > 0 ? `  빠진 것 ${JSON.stringify(r.missing)}` : '') +
        `  입력칸 잔여 ${JSON.stringify(r.leftover)}`,
    );
  }
}

await browser.close();
log(`\n원시 출력: ${writeJson('t65-rapid-input-window.json', report)}`);
