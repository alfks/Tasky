// 붕괴 순서 경계값 (app-shell.md §2-B · R4).
import { describe, expect, it } from 'vitest';

import {
  SHELL_BREAKPOINTS,
  hasBottomAddButton,
  hasInsightColumn,
  hasSidebarColumn,
  layoutFor,
} from '@/features/shell/lib/layout';

describe('layoutFor', () => {
  it.each([
    [1920, 'wide'],
    [1280, 'wide'],
    [1279, 'mid'],
    [1024, 'mid'],
    [1023, 'narrow'],
    [768, 'narrow'],
    [767, 'compact'],
    [400, 'compact'],
  ])('%ipx → %s', (width, expected) => {
    expect(layoutFor(width)).toBe(expected);
  });

  it('경계는 스펙 R4 의 세 수 그대로다', () => {
    expect(SHELL_BREAKPOINTS).toEqual({ wide: 1280, mid: 1024, narrow: 768 });
  });
});

describe('컬럼 판정 (calendar-layout.md R23~R24 — 드로어가 기본, mid 도 3영역)', () => {
  it('사이드바는 wide + 고정일 때만 컬럼이다 — mid 는 고정을 넘겨도 드로어다(R10)', () => {
    expect(hasSidebarColumn('wide', true)).toBe(true);
    expect(hasSidebarColumn('wide', false)).toBe(false);
    expect(hasSidebarColumn('mid', true)).toBe(false);
    expect(hasSidebarColumn('narrow', true)).toBe(false);
    expect(hasSidebarColumn('compact', true)).toBe(false);
  });

  it('인사이트는 1024px 이상(wide·mid) 양쪽에서 컬럼이다 — mid 도 3영역이다(R4)', () => {
    expect(hasInsightColumn('mid')).toBe(true);
    expect(hasInsightColumn(layoutFor(1280))).toBe(true);
    expect(hasInsightColumn(layoutFor(1024))).toBe(true);
    expect(hasInsightColumn(layoutFor(1023))).toBe(false);
  });

  it('하단 고정 [+ 할 일] 은 768px 미만에서만', () => {
    expect(hasBottomAddButton(layoutFor(767))).toBe(true);
    expect(hasBottomAddButton(layoutFor(768))).toBe(false);
  });
});
