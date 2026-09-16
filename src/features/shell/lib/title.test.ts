// 문서 제목 (app-shell.md R9).
import { describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';

import { shellDocumentTitle, titleDateLabel } from '@/features/shell/lib/title';

const THURSDAY = '2026-09-17' as DateKey;

describe('shellDocumentTitle', () => {
  it('투두가 있으면 "9월 17일 (목) · 3/5 · Tasky"', () => {
    expect(shellDocumentTitle(THURSDAY, { done: 3, total: 5 })).toBe('9월 17일 (목) · 3/5 · Tasky');
  });

  it('투두가 0개면 비율 칸을 통째로 뺀다', () => {
    expect(shellDocumentTitle(THURSDAY, { done: 0, total: 0 })).toBe('9월 17일 (목) · Tasky');
  });

  it('0/5 는 비율을 남긴다 — "0개 완료" 와 "할 일 없음" 은 다른 상태다', () => {
    expect(shellDocumentTitle(THURSDAY, { done: 0, total: 5 })).toBe('9월 17일 (목) · 0/5 · Tasky');
  });

  it('요일은 실제 요일을 따른다', () => {
    expect(titleDateLabel('2026-09-14' as DateKey)).toBe('9월 14일 (월)');
    expect(titleDateLabel('2026-09-20' as DateKey)).toBe('9월 20일 (일)');
  });

  it('월·일에 0 을 채우지 않는다', () => {
    expect(titleDateLabel('2026-01-05' as DateKey)).toBe('1월 5일 (월)');
  });
});
