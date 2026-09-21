import { describe, expect, it } from 'vitest';

import { routineInstanceSlotId } from '@/domain/sync/routine-slot';

/** `meta.ts` 의 `UUID_V4_PATTERN` 과 같은 정규식(그 상수는 export 되지 않아 여기서 다시 적는다). */
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('routineInstanceSlotId — UUID v4 모양', () => {
  it('adopt()/createMeta 의 id 검증(UUID_V4_PATTERN)을 통과한다', () => {
    expect(routineInstanceSlotId('70000000-0000-4000-8000-000000000001', '2026-01-29')).toMatch(
      UUID_V4_PATTERN,
    );
  });
});

describe('routineInstanceSlotId — 고정 벡터(다른 기기·다른 런타임에서 같은 값이어야 한다)', () => {
  it.each([
    ['70000000-0000-4000-8000-000000000001', '2026-01-29', 'ed8e964b-4814-4e28-a52e-70d57eb280a2'],
    ['70000000-0000-4000-8000-000000000001', '2026-02-05', 'efbca07a-1afc-4c69-8207-0074f46538f3'],
    ['80000000-0000-4000-8000-000000000002', '2026-01-29', '33dfc361-0133-49ce-a7e0-a4bb390941b0'],
  ] as const)('routineId=%s date=%s → %s', (routineId, date, expected) => {
    expect(routineInstanceSlotId(routineId, date)).toBe(expected);
  });

  it('순수 산술만 쓰므로 같은 입력을 두 번 불러도 항상 같은 값(결정성)', () => {
    const a = routineInstanceSlotId('r-1', '2026-03-01');
    const b = routineInstanceSlotId('r-1', '2026-03-01');
    expect(a).toBe(b);
  });
});

describe('routineInstanceSlotId — 입력 민감도 (돌연변이 표적: date 를 무시하면 이 테스트가 빨개진다)', () => {
  it('다른 날짜는 다른 id', () => {
    const a = routineInstanceSlotId('r-1', '2026-01-29');
    const b = routineInstanceSlotId('r-1', '2026-02-05');
    expect(a).not.toBe(b);
  });

  it('다른 routineId 는 다른 id', () => {
    const a = routineInstanceSlotId('r-1', '2026-01-29');
    const b = routineInstanceSlotId('r-2', '2026-01-29');
    expect(a).not.toBe(b);
  });

  it('같은 (routineId, date) 는 항상 같은 id — 이것이 F1(독립 채우기 중복) 방지의 전제다', () => {
    const deviceA = routineInstanceSlotId('r-shared', '2026-02-05');
    const deviceB = routineInstanceSlotId('r-shared', '2026-02-05');
    expect(deviceA).toBe(deviceB);
  });
});

describe('routineInstanceSlotId — 10만 쌍 무충돌', () => {
  it('서로 다른 (routineId, date) 10만 쌍이 서로 다른 id 를 낸다', () => {
    const seen = new Set<string>();
    let collisions = 0;
    for (let r = 0; r < 100; r += 1) {
      for (let d = 0; d < 1000; d += 1) {
        const id = routineInstanceSlotId(`routine-${r}`, `2026-01-01+${d}`);
        if (seen.has(id)) {
          collisions += 1;
        }
        seen.add(id);
      }
    }
    expect(seen.size).toBe(100 * 1000);
    expect(collisions).toBe(0);
  });
});
