// 문서 제목 (app-shell.md R9).
import { describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';

import { shellDocumentTitle, titleDateLabel } from '@/features/shell/lib/title';

const THURSDAY = '2026-09-17' as DateKey;

describe('shellDocumentTitle', () => {
  it('날짜와 완료 개수와 무관하게 앱 이름만 반환한다', () => {
    expect(shellDocumentTitle(THURSDAY, { done: 3, total: 5 })).toBe('Tasky');
    expect(shellDocumentTitle('2026-01-05' as DateKey, { done: 0, total: 0 })).toBe('Tasky');
  });
});

describe('titleDateLabel', () => {
  it('요일은 실제 요일을 따른다', () => {
    expect(titleDateLabel('2026-09-14' as DateKey)).toBe('9월 14일 (월)');
    expect(titleDateLabel('2026-09-20' as DateKey)).toBe('9월 20일 (일)');
  });

  it('월·일에 0 을 채우지 않는다', () => {
    expect(titleDateLabel('2026-01-05' as DateKey)).toBe('1월 5일 (월)');
  });
});
