// T-65 최소 재현 — **`Enter` 두 번이면 난다.** 40건도 playwright 도 필요 없다.
//
// 앞의 저장이 끝나기 전에 두 번째 `Enter` 가 오면 두 번째 항목이 **조용히 사라진다**(오류 문구도
// 토스트도 없다). 두 `Enter` 모두 페이지 안에서 쏘므로 도구는 개입하지 않고, 두 번째 키가
// **제 제목을 담은 입력칸에서** 났다는 것을 반환값이 증언한다.
//
// 사용: node tests/feel/rapid-input-minimal.mjs
import { BASE_URL, launch, log, newPage, waitForShell, writeJson } from './lib/harness.mjs';

const TRIALS = Number(process.env.FEEL_TRIALS ?? 5);

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

/** 두 항목을 `gap` ms 간격으로 넣는다. `seen` 은 각 `Enter` 가 났을 때 입력칸에 있던 값이다. */
function twoEnters(gap) {
  const input = document.querySelector('input[aria-label$="에 할 일 추가"]');
  if (input === null) throw new Error('입력 행을 찾지 못했다');
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  const seen = [];
  const enter = (value) => {
    setValue.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    seen.push(input.value);
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
  };
  return (async () => {
    enter('첫째');
    if (gap > 0) {
      await new Promise((r) => {
        setTimeout(r, gap);
      });
    }
    enter('둘째');
    await new Promise((r) => {
      setTimeout(r, 2000);
    });
    return { seen, leftover: input.value };
  })();
}

async function run(browser, gap) {
  const page = await newPage(browser);
  await page.goto(BASE_URL);
  await waitForShell(page);
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: '+ 할 일 추가' }).first().click();
  await page
    .getByRole('textbox', { name: /할 일 추가/ })
    .first()
    .waitFor({ state: 'visible' });
  const r = await page.evaluate(twoEnters, gap);
  const stored = await page.evaluate(readStore);
  await page.context().close();
  return { gap, ...r, stored };
}

const browser = await launch();
const report = { baseUrl: BASE_URL, trials: TRIALS, runs: [] };

for (const gap of [0, 1, 5, 20]) {
  let lost = 0;
  for (let t = 1; t <= TRIALS; t += 1) {
    const r = await run(browser, gap);
    report.runs.push(r);
    if (!r.stored.includes('둘째')) lost += 1;
  }
  const last = report.runs[report.runs.length - 1];
  log(
    `간격 ${String(gap).padStart(2)}ms: "둘째" 유실 ${lost}/${TRIALS}회  ` +
      `(마지막 시행 — Enter 시점 입력칸 ${JSON.stringify(last.seen)}, ` +
      `저장 ${JSON.stringify(last.stored)}, 입력칸 잔여 ${JSON.stringify(last.leftover)})`,
  );
}

await browser.close();
log(`\n원시 출력: ${writeJson('t65-rapid-input-minimal.json', report)}`);
