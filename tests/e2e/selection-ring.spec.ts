// 읽기 조건: "선택됨" 표시(theme.md §3-G R17~R20)를 건드릴 때, 또는 이 스펙이 빨간불일 때.
//
// 왜 e2e 인가: 선택 표시는 **계산된 CSS 로만 존재한다**. jsdom 은 CSS 를 계산하지 않아
// 단위 테스트가 잴 수 있는 것은 클래스 문자열뿐이고, 클래스 문자열 단언은 링을 통째로
// 지워도 초록불이었다(T-46 리뷰에서 재현 — 세 파일에서 링을 지워도 1936/1936 통과).
// 여기서는 프로덕션 빌드 + 진짜 CSS 위에서 `getComputedStyle` 을 읽는다.
//
// 재는 것은 셋이다.
//  1. 링이 **있다** — 선택된 면의 inset 그림자 레이어 색이 `--color-selected-ring` 과 같다.
//  2. 링이 **보인다** — 링 색 vs 채움 색 대비가 WCAG 2.2 §1.4.11 의 3:1 이상. 실측값
//     (T-46 의 6.49~11.76)을 하드코딩하지 않고 **계산한다** — 프리셋이 바뀌어도 지켜져야
//     하는 것은 "3:1 이상" 이지 특정 숫자가 아니다.
//  3. 선택 ≠ 오늘 — 잉크 링과 강조색 링이 같은 색이 되는 회귀를 막는다.
//
// 셀렉터는 `tests/AGENTS.md` 규칙대로 역할 + 접근 이름만 쓴다. 다만 링을 그리는 면이
// `aria-hidden` 인 곳(색 스와치·타이머 프리셋)은 역할이 없어 주소를 매길 수 없다 —
// 그때만 `evaluate` 안에서 한 칸 내려간다(그 한 칸을 주석으로 못 박는다).
import { expect, test } from './fixtures/stub-login';
import { openSidebarDrawer } from './sidebar';

import type { Locator, Page } from '@playwright/test';

/** `StorageFailureCard.MEMORY_MODE_BANNER_TEXT`. 메모리 모드면 화면 구성이 달라진다. */
const MEMORY_MODE_TEXT = '지금 적는 내용은 새로고침하면 사라져요';

/** WCAG 2.2 §1.4.11 비텍스트 대비 최소치. */
const MIN_NON_TEXT_CONTRAST = 3;

type InsetRing = { color: string; width: string };
type Outline = { style: string; width: string };

async function waitForShell(page: Page): Promise<void> {
  await page.waitForSelector('main#shell-main');
  await expect(page.getByRole('heading', { name: 'Tasky', level: 1 })).toBeVisible();
  await expect(page.getByText(MEMORY_MODE_TEXT)).toHaveCount(0);
}

/** `rgb(r, g, b)` / `rgba(r, g, b, a)` → 채널 셋. */
function parseRgb(value: string): number[] {
  const inside = /^rgba?\(([^)]+)\)$/.exec(value);
  if (inside === null) throw new Error(`색 형식을 모른다: ${value}`);
  return inside[1]
    .split(/[,\s/]+/)
    .slice(0, 3)
    .map(Number);
}

/** WCAG 2.x 상대 휘도. */
function relativeLuminance(color: string): number {
  const [r, g, b] = parseRgb(color).map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * 대비비. **계산한다** — 실측 숫자를 상수로 박아 두면 프리셋·테마가 바뀔 때 그 상수가
 * 조용히 거짓이 되고, 테스트는 "예전에 그랬다" 를 지킨다.
 */
function contrastRatio(a: string, b: string): number {
  const [high, low] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/**
 * 토큰을 **런타임에 해석된 색**으로 읽는다. 사용자 지정 속성의 계산값은 `#1a1a1f` 처럼
 * 적힌 그대로라 `rgb()` 문자열과 바로 비교할 수 없다 — 탐침에 실어 브라우저가 정규화하게 한다.
 */
function resolveColor(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement('span');
    probe.style.cssText = `position:absolute;visibility:hidden;color:var(${name})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, token);
}

/** 길이 토큰도 같은 방식으로. 테두리 폭에 실어 `2px` 같은 절대값을 받는다. */
function resolveLength(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement('span');
    probe.style.cssText = `position:absolute;visibility:hidden;border-style:solid;border-top-width:var(${name})`;
    document.body.append(probe);
    const width = getComputedStyle(probe).borderTopWidth;
    probe.remove();
    return width;
  }, token);
}

/**
 * 계산된 `box-shadow` 에서 **안쪽(inset) 링 레이어**를 뽑는다. Tailwind 는 ring/shadow 자리를
 * 늘 투명 레이어로 깔아 두므로 투명한 것은 건너뛴다 — 안 그러면 "링이 있다" 가 항상 참이 된다.
 */
async function insetRingOf(target: Locator, label: string): Promise<InsetRing> {
  const ring = await target.evaluate((element): InsetRing | null => {
    const shadow = getComputedStyle(element).boxShadow;
    if (shadow === 'none' || shadow === '') return null;
    // 색 안의 쉼표와 레이어를 가르는 쉼표를 구분해야 한다.
    const layers: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < shadow.length; i += 1) {
      if (shadow[i] === '(') depth += 1;
      else if (shadow[i] === ')') depth -= 1;
      else if (shadow[i] === ',' && depth === 0) {
        layers.push(shadow.slice(start, i));
        start = i + 1;
      }
    }
    layers.push(shadow.slice(start));

    for (const raw of layers) {
      const layer = raw.trim();
      if (!layer.endsWith('inset')) continue;
      const head = /^(rgba?\([^)]*\)|[a-z]+)/.exec(layer);
      if (head === null) continue;
      const color = head[0];
      if (/,\s*0\)$/.test(color)) continue; // 알파 0 = Tailwind 의 빈 자리표시자
      const lengths = layer.slice(color.length).trim().split(/\s+/);
      // <색> <x> <y> <blur> <spread> inset — 링의 굵기는 spread 다.
      return { color, width: lengths[3] ?? '0px' };
    }
    return null;
  });
  if (ring === null) {
    throw new Error(`${label}: 불투명한 inset 링 레이어가 없다 — 선택 표시가 사라졌다.`);
  }
  return ring;
}

/** 요소의 채움색. 링이 "무엇 위에서" 3:1 을 져야 하는지의 상대다. */
function fillOf(target: Locator): Promise<string> {
  return target.evaluate((element) => getComputedStyle(element).backgroundColor);
}

function outlineOf(target: Locator): Promise<Outline> {
  return target.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
}

function borderOf(target: Locator): Promise<Outline> {
  return target.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.borderTopStyle, width: style.borderTopWidth };
  });
}

function dateStrip(page: Page): Locator {
  return page.getByRole('radiogroup', { name: '날짜 선택' });
}

/** 팔레트를 연다. 화면에 입구가 없어(T-36) 단축키가 유일한 경로다. */
async function openPalette(page: Page): Promise<Locator> {
  await page.keyboard.press('Control+k');
  const list = page.getByRole('listbox', { name: '명령과 할 일' });
  await expect(list.getByRole('option').first()).toBeVisible();
  return list;
}

/**
 * 스와치·타이머 프리셋의 **보이는 표시**는 `aria-hidden` 인 형제/자식이다(같은 정보가 라디오의
 * 상태로 이미 있어 이중 낭독을 피한 결과 — 각 컴포넌트 주석 참조). 역할이 없으니 접근 이름으로
 * 주소를 매길 수 없어, 여기서만 라디오에서 한 칸 내려간다.
 */
function markerBorderOf(radio: Locator, hop: 'child' | 'sibling'): Promise<InsetRing> {
  return radio.evaluate((element, which) => {
    const marker = which === 'child' ? element.firstElementChild : element.nextElementSibling;
    if (marker === null) throw new Error('선택 표시를 그리는 요소가 없다.');
    const style = getComputedStyle(marker);
    return { color: style.borderTopColor, width: style.borderTopWidth };
  }, hop);
}

/**
 * 카테고리 만들기 다이얼로그를 열고 색 스와치 그룹을 돌려준다. "+ 카테고리 추가" 는 사이드바
 * 드로어 안에 있다(calendar-layout.md §1-A) — 먼저 연다. 이 다이얼로그는 제출하지 않고 안의
 * 스와치만 재는 호출부뿐이라 드로어는 닫지 않는다(테스트가 끝나면 컨텍스트째 버려진다).
 */
async function openColorSwatches(page: Page): Promise<Locator> {
  await openSidebarDrawer(page);
  await page.getByRole('button', { name: '+ 카테고리 추가' }).click();
  const dialog = page.getByRole('dialog', { name: '카테고리 만들기' });
  await expect(dialog).toBeVisible();
  return dialog.getByRole('radiogroup', { name: '카테고리 색' });
}

// 대비는 **라이트에서** 가장 아슬아슬하다(파스텔 채움이 배경과 1.14~2.16:1). 시스템 설정에
// 흔들리지 않게 못 박는다.
test.describe('선택됨 잉크 링 (theme.md §3-G R17~R20)', () => {
  test.use({ colorScheme: 'light' });

  test('선택된 날짜 칸: 잉크 링이 있고 채움과 3:1 이상이다', async ({ page }) => {
    await page.goto('/');
    await waitForShell(page);

    const selected = dateStrip(page).getByRole('radio', { checked: true });
    await expect(selected).toHaveCount(1);

    const ring = await insetRingOf(selected, '선택된 날짜 칸');
    expect(ring.color).toBe(await resolveColor(page, '--color-selected-ring'));
    expect(ring.width).toBe(await resolveLength(page, '--control-selected-ring'));
    expect(contrastRatio(ring.color, await fillOf(selected))).toBeGreaterThanOrEqual(
      MIN_NON_TEXT_CONTRAST,
    );
  });

  test('팔레트 선택 행: 잉크 링이 있고 채움과 3:1 이상이다', async ({ page }) => {
    await page.goto('/');
    await waitForShell(page);

    const row = (await openPalette(page)).getByRole('option', { selected: true });
    await expect(row).toHaveCount(1);

    const ring = await insetRingOf(row, '팔레트 선택 행');
    expect(ring.color).toBe(await resolveColor(page, '--color-selected-ring'));
    expect(ring.width).toBe(await resolveLength(page, '--control-selected-ring'));
    expect(contrastRatio(ring.color, await fillOf(row))).toBeGreaterThanOrEqual(
      MIN_NON_TEXT_CONTRAST,
    );
  });

  test('색 스와치: 선택 테두리가 같은 잉크·같은 굵기다', async ({ page }) => {
    await page.goto('/');
    await waitForShell(page);

    const swatches = await openColorSwatches(page);
    const selected = swatches.getByRole('radio', { checked: true });
    await expect(selected).toHaveCount(1);

    const border = await markerBorderOf(selected, 'child');
    expect(border.color).toBe(await resolveColor(page, '--color-selected-ring'));
    expect(border.width).toBe(await resolveLength(page, '--control-selected-ring'));
  });

  test('타이머 프리셋: 체크된 원의 테두리가 같은 잉크다 (R19)', async ({ page }) => {
    // 대기 화면(`TimerSetup`)은 이제 메인 화면에 상시 있지 않다(사용자 결정, timer.md §2) —
    // 완료 카드가 뜬 순간(R10 "다음 할 일 고르기")에만 그 아래 다시 나타난다. 실제로 완료를
    // 만들어 닿는다: 기본 길이(25분)로 시작한 뒤 가짜 시계로 그 시간을 건너뛴다.
    await page.clock.install();
    await page.goto('/');
    await waitForShell(page);

    await page.keyboard.press('Control+k');
    const palette = page.getByRole('listbox', { name: '명령과 할 일' });
    await page.getByRole('combobox', { name: '할 일 검색 또는 명령' }).fill('타이머 시작');
    await palette.getByRole('option', { name: '타이머 시작', exact: true }).click();
    await expect(page.getByRole('timer')).toBeVisible();

    await page.clock.fastForward('26:00');
    await expect(page.getByRole('alertdialog', { name: '집중 25분 끝!' })).toBeVisible();

    const checked = page.getByRole('radio', { name: '25분' });
    await expect(checked).toBeChecked();

    const border = await markerBorderOf(checked, 'sibling');
    expect(border.color).toBe(await resolveColor(page, '--color-selected-ring'));
    expect(border.width).toBe(await resolveLength(page, '--control-selected-ring'));
  });

  test('선택 링과 오늘 링은 다른 색이다', async ({ page }) => {
    await page.goto('/');
    await waitForShell(page);

    const strip = dateStrip(page);
    // 오늘이 아닌 날로 옮겨야 "오늘"(강조색 링)과 "선택"(잉크 링)이 다른 칸에 동시에 뜬다.
    await strip.getByRole('radio', { checked: false }).first().click();
    const today = strip.getByRole('radio', { name: /오늘/ });
    await expect(today).not.toBeChecked();

    const todayRing = await insetRingOf(today, '오늘 칸');
    const selectedRing = await insetRingOf(
      strip.getByRole('radio', { checked: true }),
      '선택된 날짜 칸',
    );
    expect(todayRing.color).toBe(await resolveColor(page, '--color-accent'));
    expect(selectedRing.color).toBe(await resolveColor(page, '--color-selected-ring'));
    expect(selectedRing.color).not.toBe(todayRing.color);
  });
});

// 강제 색 모드에서는 UA 가 `box-shadow` 를 통째로 `none` 으로 만든다 — 링만 쓰는 면은 선택
// 표시가 **완전히 사라진다**(T-46 이전부터 있던 구멍). 그래서 그 모드에서는 outline 으로 바꿔 단다.
test.describe('강제 색 모드에서도 선택이 보인다 (WCAG 1.4.11 · forced-colors)', () => {
  test.use({ colorScheme: 'light', forcedColors: 'active' });

  test('선택된 날짜 칸에 강제 색 모드용 테두리가 있다', async ({ page }) => {
    await page.goto('/');
    await waitForShell(page);

    const strip = dateStrip(page);
    const selected = strip.getByRole('radio', { checked: true });
    const border = await borderOf(selected);
    expect(border.style).not.toBe('none');
    expect(Number.parseFloat(border.width)).toBeGreaterThan(0);

    // 모든 칸에 두르는 테두리면 "선택" 을 말하지 못한다.
    const other = await borderOf(strip.getByRole('radio', { checked: false }).first());
    expect(Number.parseFloat(other.width)).toBe(0);
  });

  test('선택 표시가 포커스 링을 덮지 않는다', async ({ page }) => {
    await page.goto('/');
    await waitForShell(page);

    // 선택 표시를 `outline` 으로 달면 빌드 순서상 `focus-visible` 윤곽선을 덮어써, 선택된
    // 칸에서는 포커스가 들어와도 화면이 그대로다. 그래서 선택은 테두리로 간다 — 그 판단이
    // 지켜지는지를 여기서 잰다(선택된 칸에 포커스를 주면 **윤곽선이 새로 생겨야** 한다).
    const selected = dateStrip(page).getByRole('radio', { checked: true });
    expect((await outlineOf(selected)).style).toBe('none');
    await selected.focus();
    const focused = await outlineOf(selected);
    expect(focused.style).not.toBe('none');
    expect(Number.parseFloat(focused.width)).toBeGreaterThan(0);
  });

  test('팔레트 선택 행에 강제 색 모드용 윤곽선이 있다', async ({ page }) => {
    await page.goto('/');
    await waitForShell(page);

    // 포커스는 입력칸에만 있다(combobox 패턴) — 행의 윤곽선은 선택 분기의 것이다.
    const list = await openPalette(page);
    const outline = await outlineOf(list.getByRole('option', { selected: true }));
    expect(outline.style).not.toBe('none');
    expect(Number.parseFloat(outline.width)).toBeGreaterThan(0);

    const other = await outlineOf(list.getByRole('option', { selected: false }).first());
    expect(other.style).toBe('none');
  });

  test('색 스와치는 테두리를 쓰므로 그대로 남는다', async ({ page }) => {
    await page.goto('/');
    await waitForShell(page);

    const swatches = await openColorSwatches(page);
    const border = await markerBorderOf(swatches.getByRole('radio', { checked: true }), 'child');
    expect(Number.parseFloat(border.width)).toBeGreaterThanOrEqual(2);
  });
});
