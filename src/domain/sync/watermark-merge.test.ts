import { describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';
import { mergeRoutineWatermark } from '@/domain/sync/watermark-merge';

describe('mergeRoutineWatermark — 단조 증가(max)', () => {
  it('더 늦은 값이 이긴다(로컬이 더 늦음)', () => {
    expect(mergeRoutineWatermark('2026-02-10', '2026-01-22')).toBe('2026-02-10');
  });

  it('더 늦은 값이 이긴다(원격이 더 늦음)', () => {
    expect(mergeRoutineWatermark('2026-01-22', '2026-02-10')).toBe('2026-02-10');
  });

  it('같으면 그대로', () => {
    expect(mergeRoutineWatermark('2026-02-10', '2026-02-10')).toBe('2026-02-10');
  });

  it('멱등 — 같은 값을 두 번 합쳐도 그대로(재방문·재시도에 안전)', () => {
    const once = mergeRoutineWatermark('2026-02-10', '2026-01-22');
    const twice = mergeRoutineWatermark(once, '2026-01-22');
    expect(twice).toBe(once);
  });

  it('절대 후퇴하지 않는다 — 어떤 순서로 여러 번 합쳐도 최댓값보다 앞으로 가지 않는다(위험 3 방지)', () => {
    const values: readonly DateKey[] = ['2026-01-22', '2026-03-05', '2026-02-01', '2026-02-28'];
    let acc = values[0] as DateKey;
    for (const v of values.slice(1)) {
      const before = acc;
      acc = mergeRoutineWatermark(acc, v);
      expect(acc >= before).toBe(true);
    }
    expect(acc).toBe('2026-03-05');
  });
});
