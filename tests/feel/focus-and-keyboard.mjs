// T-25 항목 2(포커스 궤적) · 항목 6(키보드만으로 하루치 완주).
// 각 단계 뒤의 `document.activeElement` 를 그대로 받아 적는다 — "튀지 않는다" 를 서술이 아니라
// 요소 이름·화면 좌표로 남긴다.
//
// 실행: node tests/feel/focus-and-keyboard.mjs
import { BASE_URL, launch, log, newPage, seed, waitForShell, writeJson } from './lib/harness.mjs';

/** 지금 포커스된 요소를 사람이 읽을 수 있는 한 줄로. 좌표까지 남겨 "화면을 튀었는지" 를 잰다. */
function activeSnapshot() {
  const el = document.activeElement;
  if (el === null || el === document.body) return { name: '(body)', tag: 'body', x: null, y: null };
  const r = el.getBoundingClientRect();
  const label =
    el.getAttribute('aria-label') ??
    (el.id !== '' && document.querySelector(`[aria-labelledby~="${el.id}"]`) !== null
      ? el.textContent
      : null) ??
    el.getAttribute('placeholder') ??
    (el.textContent ?? '').trim().slice(0, 30);
  return {
    name: label === '' ? '(이름 없음)' : label,
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute('role'),
    x: Math.round(r.x),
    y: Math.round(r.y),
    inViewport: r.top >= 0 && r.bottom <= window.innerHeight,
  };
}

const browser = await launch();
const page = await newPage(browser, { width: 1440, height: 900 });
const result = { baseUrl: BASE_URL, focusTrail: [], keyboardRun: [], blockers: [] };
await page.goto(BASE_URL);
await waitForShell(page);
await page.waitForTimeout(700);

const snap = async (step) => {
  const s = await page.evaluate(activeSnapshot);
  result.focusTrail.push({ step, ...s });
  log(
    `[포커스] ${step} → ${s.tag}${s.role === null ? '' : `[${s.role}]`} "${s.name}" @(${s.x},${s.y})`,
  );
  return s;
};

// ---------- 항목 2: 포커스 궤적 (마우스 조작을 섞은 실제 사용 흐름) ----------
await snap('앱 로드 직후');
await page.keyboard.press('Tab');
await snap('첫 Tab (R10: 건너뛰기 링크여야 한다)');

await page.getByRole('button', { name: '+ 할 일 추가' }).first().click();
await snap('입력 행 열기');
await page.keyboard.type('장보기');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
await snap('Enter 저장 후 (R3: 입력 행 유지)');
await page.keyboard.type('방 청소');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await snap('Esc 로 입력 행 닫은 뒤');

// 삭제 → 확인 대화상자 → 닫힘 후 (app-shell R14: body 로 떨어지면 안 된다)
await page.locator('li[data-flip-id]').first().focus();
await snap('항목 행 포커스');
await page.keyboard.press('Delete');
await page.waitForTimeout(300);
await snap('Delete → 확인 대화상자 초기 포커스 (R14: 비파괴 요소)');
await page.getByRole('button', { name: '삭제' }).last().click();
await page.waitForTimeout(500);
await snap('삭제 확정 후 (사라진 행의 후임으로 가야 한다)');

// 카테고리 전환
await page.locator('nav[aria-label="카테고리"]').getByRole('button').first().click();
await page.waitForTimeout(300);
await snap('사이드바에서 카테고리 선택');

// 다이얼로그 개폐 — 단축키 도움말
await page.keyboard.press('Escape');
await page.locator('main#shell-main').click({ position: { x: 5, y: 400 } });
await page.keyboard.press('?');
await page.waitForTimeout(400);
await snap('? 도움말 열림');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await snap('도움말 Esc 로 닫은 뒤 (R11: 열기 전 포커스 복귀)');

// 2-b. **처음부터** 첫 투두 행까지 Tab 이 몇 번인가 — 키보드 사용자가 매번 치르는 값이다.
{
  const page3 = await newPage(browser, { width: 1440, height: 900 });
  await page3.goto(BASE_URL);
  await waitForShell(page3);
  await page3.waitForTimeout(700);
  await seed(page3, ['첫 항목', '둘째 항목']);
  await page3.reload();
  await waitForShell(page3);
  await page3.waitForTimeout(800);
  const trail = [];
  let hops = null;
  for (let i = 1; i <= 60; i += 1) {
    await page3.keyboard.press('Tab');
    const a = await page3.evaluate(activeSnapshot);
    trail.push(`${i}. ${a.tag} "${a.name}"`);
    if (a.tag === 'li') {
      hops = i;
      break;
    }
  }
  result.tabToFirstRow = { hops, trail };
  log(`[포커스] 새로고침 후 첫 투두 행까지 Tab ${hops ?? '>60'}회`);
  await page3.context().close();
}

// ---------- 항목 6: 마우스 없이 하루치 ----------
// 2-b. **처음부터** 첫 투두 행까지 Tab 이 몇 번인가 — 키보드 사용자가 매번 치르는 값이다.
{
  const page3 = await newPage(browser, { width: 1440, height: 900 });
  await page3.goto(BASE_URL);
  await waitForShell(page3);
  await page3.waitForTimeout(700);
  await seed(page3, ['첫 항목', '둘째 항목']);
  await page3.reload();
  await waitForShell(page3);
  await page3.waitForTimeout(800);
  const trail = [];
  let hops = null;
  for (let i = 1; i <= 60; i += 1) {
    await page3.keyboard.press('Tab');
    const a = await page3.evaluate(activeSnapshot);
    trail.push(`${i}. ${a.tag} "${a.name}"`);
    if (a.tag === 'li') {
      hops = i;
      break;
    }
  }
  result.tabToFirstRow = { hops, trail };
  log(`[포커스] 새로고침 후 첫 투두 행까지 Tab ${hops ?? '>60'}회`);
  await page3.context().close();
}

// ---------- 항목 6: 마우스 없이 하루치 ----------
// 깨끗한 화면에서 다시 시작한다 — 위 궤적이 남긴 상태에 기대지 않는다.
await page.context().clearCookies();
const page2 = await newPage(browser, { width: 1440, height: 900 });
await page2.goto(BASE_URL);
await waitForShell(page2);
await page2.waitForTimeout(700);
const kb = async (keys, times = 1) => {
  for (let i = 0; i < times; i += 1) {
    await page2.keyboard.press(keys);
    await page2.waitForTimeout(120);
  }
};
const active = () => page2.evaluate(activeSnapshot);
const push = (label, ok, note = '') => {
  result.keyboardRun.push({ label, ok, note });
  if (!ok) result.blockers.push(`${label}: ${note}`);
  log(`[키보드] ${ok ? 'OK ' : 'NG '} ${label} ${note}`);
};

// 6-1. 카테고리 생성 — Tab 만으로 `+ 카테고리 추가` 에 닿는가
{
  let hops = 0;
  let found = false;
  while (hops < 40) {
    await kb('Tab');
    hops += 1;
    const a = await active();
    if ((a.name ?? '').includes('카테고리 추가')) {
      found = true;
      break;
    }
  }
  push('카테고리 추가 버튼까지 Tab', found, `Tab ${hops}회`);
  if (found) {
    await kb('Enter');
    await page2.waitForTimeout(400);
    const a = await active();
    push('카테고리 폼 초기 포커스', a.tag === 'input', `${a.tag} "${a.name}"`);
    await page2.keyboard.type('운동');
    await kb('Enter');
    await page2.waitForTimeout(500);
    const made = await page2.getByRole('button', { name: /운동/ }).count();
    push('카테고리 생성됨', made > 0, `일치 ${made}개`);
    await page2.waitForTimeout(300);
  }
}

// 6-2. 투두 3개 — `N` 으로 입력 행을 열고 Enter 연속 입력
{
  await page2.locator('main#shell-main').focus();
  await kb('N');
  await page2.waitForTimeout(400);
  const a = await active();
  push('N 으로 입력 행 열림', a.tag === 'input' || a.tag === 'textarea', `${a.tag} "${a.name}"`);
  for (const t of ['스쿼트', '달리기', '스트레칭']) {
    await page2.keyboard.type(t);
    await kb('Enter');
    await page2.waitForTimeout(250);
  }
  await kb('Escape');
  const n = await page2.locator('li[data-flip-id]').count();
  push('투두 3개 추가', n >= 3, `항목 ${n}개`);
}

// 6-3. 두 개 체크 — 행 포커스 + Space
// 완료 개수는 **항목 행 안의** 체크박스만 센다. 인사이트 패널의 "끝났을 때 소리로 알리기" 도
// `input[type=checkbox]:checked` 라, 범위를 좁히지 않으면 항상 1개가 더 세어진다(첫 측정에서 그랬다).
const doneCount = () => page2.locator('li[data-flip-id] input[type=checkbox]:checked').count();
/** Tab 을 눌러 가며 조건에 맞는 요소에 닿을 때까지. 몇 번 눌렀는지를 같이 돌려준다. */
const tabUntil = async (pred, max = 60) => {
  for (let i = 1; i <= max; i += 1) {
    await kb('Tab');
    const a = await active();
    if (pred(a)) return { ok: true, hops: i, el: a };
  }
  return { ok: false, hops: max, el: await active() };
};
const isRow = (a) => a.tag === 'li';

{
  const r1 = await tabUntil(isRow);
  push('항목 행까지 Tab', r1.ok, `Tab ${r1.hops}회`);
  await kb('Space');
  await page2.waitForTimeout(800);
  const after1 = await active();
  push(
    'Space 완료 후 포커스가 그 행에 남는가 (todo §5)',
    after1.tag === 'li',
    `${after1.tag} "${after1.name}"`,
  );
  push('첫 체크 반영', (await doneCount()) === 1, `완료 ${await doneCount()}개`);

  const r2 = await tabUntil(isRow);
  push('두 번째 행까지 Tab', r2.ok, `Tab ${r2.hops}회`);
  await kb('Space');
  await page2.waitForTimeout(800);
  push('두 번째 체크 반영', (await doneCount()) === 2, `완료 ${await doneCount()}개`);
}

// 6-4. 하나 편집 — 미완료 행에 포커스하고 Enter
{
  const r = await tabUntil((a) => a.tag === 'li');
  push('편집할 행 포커스', r.ok, r.ok ? `"${r.el.name}" (Tab ${r.hops}회)` : '행에 닿지 못함');
  const title = r.el.name;
  await kb('Enter');
  await page2.waitForTimeout(600);
  const a = await active();
  push(
    'Enter 로 편집 패널 열림',
    a.tag === 'input' || a.tag === 'textarea',
    `${a.tag} "${a.name}"`,
  );
  if (a.tag === 'input' || a.tag === 'textarea') {
    await page2.keyboard.press('Control+a');
    await page2.keyboard.type('스쿼트 30회');
    await kb('Enter');
    await page2.waitForTimeout(600);
    const changed = await page2.getByRole('button', { name: '스쿼트 30회' }).count();
    push('편집 저장', changed > 0, `기존 "${title}" → 일치 ${changed}개`);
  }
  await kb('Escape');
  await page2.waitForTimeout(300);
}

// 6-5. 하나 삭제 — 행 포커스 Delete → 대화상자 → 키보드로 확정
{
  const r = await tabUntil((a) => a.tag === 'li');
  push('삭제할 행 포커스', r.ok, r.ok ? `"${r.el.name}" (Tab ${r.hops}회)` : '행에 닿지 못함');
  const before = await page2.locator('li[data-flip-id]').count();
  await kb('Delete');
  await page2.waitForTimeout(500);
  const dialogOpen = await page2.locator('[role=alertdialog]').count();
  push(
    'Delete 가 확인 대화상자를 연다 (todo R13)',
    dialogOpen === 1,
    `alertdialog ${dialogOpen}개`,
  );
  const dlg = await active();
  push('대화상자 초기 포커스가 비파괴 요소인가 (R14)', dlg.name !== '삭제', `"${dlg.name}"`);
  const reach = await tabUntil((a) => a.name === '삭제', 8);
  push('대화상자 안에서 [삭제] 까지 Tab', reach.ok, `Tab ${reach.hops}회`);
  await kb('Enter');
  await page2.waitForTimeout(800);
  const after = await page2.locator('li[data-flip-id]').count();
  push('삭제 반영', after === before - 1, `${before} → ${after}`);
  const back = await active();
  push(
    '삭제 후 포커스가 body 로 떨어지지 않음 (R14)',
    back.tag !== 'body',
    `${back.tag} "${back.name}"`,
  );
}

// 6-6. 날짜 이동 — 전역 `←`/`→`, `T` (R1: 포커스가 입력에 없을 때)
{
  await page2.locator('main#shell-main').focus();
  const label = () =>
    page2.evaluate(
      () =>
        document.querySelector('[role=radio][aria-checked=true]')?.getAttribute('aria-label') ??
        null,
    );
  const start = await label();
  await kb('ArrowRight');
  await page2.waitForTimeout(500);
  const next = await label();
  push('→ 로 하루 이동', next !== start, `${start} → ${next}`);
  await kb('ArrowLeft');
  await page2.waitForTimeout(500);
  push('← 로 되돌아오기', (await label()) === start, `→ ${await label()}`);
  await page2.keyboard.press('Shift+ArrowRight');
  await page2.waitForTimeout(500);
  const week = await label();
  push('Shift+→ 로 한 주 이동', week !== start, `${start} → ${week}`);
  await kb('T');
  await page2.waitForTimeout(500);
  const today = await label();
  push('T 로 오늘 복귀', (today ?? '').includes('오늘'), `${today}`);
}

await browser.close();
log('\n저장:', writeJson('focus-and-keyboard.json', result));
log('막힌 지점:', result.blockers.length === 0 ? '없음' : result.blockers.join(' / '));
