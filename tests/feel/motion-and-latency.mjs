// T-25 항목 1(모션 연속성) · 항목 4(입력 지연). 연속 동작에서 R8("체크 → 400ms → 이동")이 끊기는지,
// 타이핑·토글·날짜 이동의 응답이 몇 ms 인지 잰다.
//
// 실행: node tests/feel/motion-and-latency.mjs
import { BASE_URL, launch, log, newPage, seed, waitForShell, writeJson } from './lib/harness.mjs';

/** 프레임 간격과 목록 재배치 시각을 페이지 안에서 기록한다. 결과는 `window.__feel` 에 쌓인다. */
function installRecorder() {
  const w = window;
  w.__feel = { frames: [], reorders: [], shifts: [] };
  let last = performance.now();
  const tick = (t) => {
    w.__feel.frames.push(Number((t - last).toFixed(2)));
    last = t;
    w.__feel.raf = requestAnimationFrame(tick);
  };
  w.__feel.raf = requestAnimationFrame(tick);

  const list = document.querySelector('ul[data-todo-list]');
  if (list !== null) {
    const order = () => [...list.children].map((li) => li.getAttribute('data-flip-id')).join(',');
    let prev = order();
    new MutationObserver(() => {
      const now = order();
      if (now !== prev) {
        prev = now;
        w.__feel.reorders.push(Number(performance.now().toFixed(1)));
      }
    }).observe(list, { childList: true, subtree: false });
  }
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      if (!e.hadRecentInput)
        w.__feel.shifts.push({ t: Number(e.startTime.toFixed(1)), v: e.value });
    }
  }).observe({ type: 'layout-shift', buffered: true });
}

const dropStats = (frames) => {
  const body = frames.slice(2); // 첫 프레임 둘은 기록 시작 자체의 비용이다
  const dropped = body.filter((d) => d > 25).length; // 60Hz 기준 1.5 프레임 초과
  const long = body.filter((d) => d > 50).length;
  return {
    count: body.length,
    droppedOver25ms: dropped,
    droppedOver50ms: long,
    maxGapMs: body.length === 0 ? 0 : Math.max(...body),
    p95GapMs:
      body.length === 0 ? 0 : [...body].sort((a, b) => a - b)[Math.floor(body.length * 0.95)],
  };
};

const browser = await launch();
const result = { baseUrl: BASE_URL, cases: {} };
const page = await newPage(browser, { width: 1440, height: 900 });
await page.goto(BASE_URL);
await waitForShell(page);
await page.waitForTimeout(600);
await seed(page, ['장보기', '방 청소', '물 마시기', '스트레칭', '책 읽기']);
await page.evaluate(installRecorder);

const boxes = page.getByRole('checkbox');
const reset = () =>
  page.evaluate(() => {
    window.__feel.frames = [];
    window.__feel.reorders = [];
    return performance.now();
  });
const read = () => page.evaluate(() => ({ ...window.__feel }));

// --- 1-a. 단일 체크: 클릭 → 재배치까지 걸린 시간이 R8 의 400ms 대기와 맞는가 ---
{
  const t0 = await reset();
  await boxes.nth(0).check();
  await page.waitForTimeout(1400);
  const r = await read();
  result.cases.singleCheck = {
    설명: '체크 1회 → 완료 블록 이동',
    클릭기준_재배치시각ms: r.reorders.map((t) => Number((t - t0).toFixed(0))),
    프레임: dropStats(r.frames),
  };
}

// --- 1-b. 빠른 연타: 400ms 대기 안에 3개를 더 토글하면 함께 내려가는가(R8 "대기 중 병합") ---
{
  const t0 = await reset();
  await boxes.nth(1).check();
  await page.waitForTimeout(60);
  await boxes.nth(2).check();
  await page.waitForTimeout(60);
  await boxes.nth(3).check();
  await page.waitForTimeout(1600);
  const r = await read();
  result.cases.rapidToggles = {
    설명: '대기 중 연타 3회(60ms 간격)',
    클릭기준_재배치시각ms: r.reorders.map((t) => Number((t - t0).toFixed(0))),
    재배치횟수: r.reorders.length,
    프레임: dropStats(r.frames),
  };
}

// --- 1-c. 대기 중 날짜 이동: 이동 애니메이션이 진행 중일 때 목록이 통째로 갈린다 ---
{
  await boxes
    .nth(0)
    .uncheck()
    .catch(() => {});
  await page.waitForTimeout(900);
  const t0 = await reset();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await boxes.nth(0).check();
  await page.waitForTimeout(120); // R8 의 400ms 대기 한가운데
  await page.getByLabel(/9월 17일/).click();
  await page.waitForTimeout(1200);
  const r = await read();
  result.cases.dateMoveDuringWait = {
    설명: '체크 후 120ms 에 날짜 이동',
    클릭기준_재배치시각ms: r.reorders.map((t) => Number((t - t0).toFixed(0))),
    페이지오류: errors,
    프레임: dropStats(r.frames),
    이동후_목록비었나: await page.evaluate(
      () => document.querySelectorAll('li[data-flip-id]').length === 0,
    ),
  };
  await page.getByRole('button', { name: '오늘로 이동' }).click();
  await page.waitForTimeout(700);
  // 대기 중에 화면을 갈아엎었을 때 그 체크가 살아남아 **완료 블록**에 앉아 있는가.
  result.cases.dateMoveDuringWait.복귀후 = await page.evaluate(() => {
    const items = [...document.querySelectorAll('li[data-flip-id]')];
    const done = items.filter((li) => li.querySelector('input[type=checkbox]')?.checked === true);
    const firstDoneIndex = items.findIndex(
      (li) => li.querySelector('input[type=checkbox]')?.checked === true,
    );
    return {
      항목수: items.length,
      완료수: done.length,
      완료가_미완료보다_아래인가: firstDoneIndex === items.length - done.length,
    };
  });
}

// --- 4-a. 타이핑 지연(ASCII) ---
{
  await page.getByRole('button', { name: '+ 할 일 추가' }).first().click();
  const input = page.getByRole('textbox', { name: /할 일 추가/ }).first();
  await input.click();
  const lat = [];
  for (const ch of 'abcdefghij') {
    const t = await page.evaluate(() => performance.now());
    await page.keyboard.type(ch);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
    lat.push(Number(((await page.evaluate(() => performance.now())) - t).toFixed(1)));
  }
  result.cases.typingAscii = { 설명: '영문 10타 키→다음 프레임', 지연ms: lat };
}

// --- 4-b. 한글 IME 조합(CDP Input.imeSetComposition) ---
{
  const input = page.getByRole('textbox', { name: /할 일 추가/ }).first();
  await input.fill('');
  await input.click();
  const cdp = await page.context().newCDPSession(page);
  const t0 = await page.evaluate(() => performance.now());
  for (const [text, n] of [
    ['ㄱ', 1],
    ['가', 1],
    ['간', 1],
  ]) {
    await cdp.send('Input.imeSetComposition', {
      text,
      selectionStart: n,
      selectionEnd: n,
    });
    await page.waitForTimeout(40);
  }
  await cdp.send('Input.insertText', { text: '간' });
  const composed = await input.inputValue();
  // 조합 중 Enter 는 무시되어야 한다(todo R4) — 조합을 다시 열고 Enter 를 눌러 본다.
  await cdp.send('Input.imeSetComposition', { text: '다', selectionStart: 1, selectionEnd: 1 });
  const before = await page.evaluate(() => document.querySelectorAll('li[data-flip-id]').length);
  await page.keyboard.insertText('');
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 229,
    nativeVirtualKeyCode: 229,
  });
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => document.querySelectorAll('li[data-flip-id]').length);
  result.cases.imeComposition = {
    설명: '한글 조합 3단계 + 조합 중 Enter(keyCode 229)',
    조합결과: composed,
    조합소요ms: Number(((await page.evaluate(() => performance.now())) - t0).toFixed(0)),
    조합중Enter가_항목을_만들었나: after > before,
  };
  await page.keyboard.press('Escape');
}

// --- 4-c. 날짜 스트립 이동 지연 (date-strip R10: 100ms 안에 목록이 그려져야 한다) ---
{
  const lat = [];
  for (const day of ['9월 18일', '9월 19일', '9월 17일', '9월 15일']) {
    const t = await page.evaluate(() => performance.now());
    await page.getByLabel(new RegExp(day)).click();
    await page.waitForFunction(
      () => document.querySelector('main [aria-busy="true"]') === null,
      undefined,
      { timeout: 3000 },
    );
    lat.push(Number(((await page.evaluate(() => performance.now())) - t).toFixed(0)));
  }
  result.cases.dateStripEmptyTarget = {
    설명: '빈 날짜로 이동 → aria-busy 해제까지(참고값 — 그릴 항목이 없어 하한에 가깝다)',
    지연ms: lat,
  };
}

// --- 4-d. 체크 토글 반영 지연 (todo R6: 50ms 안 반영) ---
{
  await page.getByRole('button', { name: '오늘로 이동' }).click();
  await page.waitForTimeout(500);
  // 앞선 케이스들이 오늘 것을 전부 완료 처리했다 — 토글할 미완료 항목을 하나 새로 심는다.
  await seed(page, ['토글 대상']);
  await page.waitForTimeout(300);
  // **DOM 인덱스로 기다리지 않는다.** 400ms 뒤 항목이 완료 블록으로 옮겨 가 인덱스가 갈리므로,
  // 인덱스로 재면 토글 지연이 아니라 이동 시각(≈450ms)이 찍힌다(첫 측정에서 실제로 그랬다).
  const flipId = await page.evaluate(() => {
    const li = [...document.querySelectorAll('li[data-flip-id]')].find(
      (n) => n.querySelector('input[type=checkbox]')?.checked === false,
    );
    return li?.getAttribute('data-flip-id') ?? null;
  });
  const lat = [];
  for (let i = 0; i < 4; i += 1) {
    const want = i % 2 === 0;
    const t = await page.evaluate(() => performance.now());
    await page.locator(`li[data-flip-id="${flipId}"] input[type=checkbox]`).click();
    await page.waitForFunction(
      ([id, w]) =>
        document.querySelector(`li[data-flip-id="${id}"] input[type=checkbox]`)?.checked === w,
      [flipId, want],
      { timeout: 2000 },
    );
    lat.push(Number(((await page.evaluate(() => performance.now())) - t).toFixed(0)));
    await page.waitForTimeout(900);
  }
  result.cases.toggleLatency = { 설명: '같은 항목 토글 4회 → checked 반영(R6 ≤50ms)', 지연ms: lat };
}

// --- 4-e. 날짜 스트립 이동 지연, 양쪽 날짜에 항목이 있을 때 (date-strip R10: ≤100ms) ---
{
  await page.getByLabel(/9월 18일/).click();
  await page.waitForTimeout(600);
  await seed(page, ['18일 할 일 하나', '18일 할 일 둘']);
  const count = () => page.evaluate(() => document.querySelectorAll('li[data-flip-id]').length);
  const n18 = await count();
  await page.getByLabel(/9월 16일/).click();
  await page.waitForTimeout(600);
  const n16 = await count();
  const lat = [];
  for (const [day, want] of [
    ['9월 18일', n18],
    ['9월 16일', n16],
    ['9월 18일', n18],
    ['9월 16일', n16],
  ]) {
    const t = await page.evaluate(() => performance.now());
    await page.getByLabel(new RegExp(day)).click();
    await page.waitForFunction(
      (n) => document.querySelectorAll('li[data-flip-id]').length === n,
      want,
      { timeout: 3000 },
    );
    lat.push(Number(((await page.evaluate(() => performance.now())) - t).toFixed(0)));
    await page.waitForTimeout(400);
  }
  result.cases.dateStripBothPopulated = {
    설명: `항목이 있는 두 날짜를 오갈 때 목록이 그려지기까지(R10 ≤100ms). 16일 ${n16}개 ↔ 18일 ${n18}개`,
    지연ms: lat,
  };
}

await browser.close();
log(JSON.stringify(result, null, 2));
log('\n저장:', writeJson('motion-and-latency.json', result));
