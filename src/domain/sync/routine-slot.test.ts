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

// "10만 쌍 무충돌" 카운트는 삭제했다 — 시드 넷을 전부 0 으로 뭉개(실효 32비트로 퇴화) 돌연변이를
// 넣어도 100,000 개의 서로 다른 (routineId, date) 입력에서는 우연히 충돌이 안 나 통과했다(routine-
// slot.ts 헤더 코멘트에 실측 경위를 적었다). 그 테스트는 "id 가 입력마다 달라진다"만 증명했지,
// "네 시드가 서로 다른 32비트를 낸다"는 전혀 증명하지 못했다. 아래는 그 자리를 대신하는 시드
// 독립성 검사다 — 시드를 뭉개는 돌연변이를 직접 잡는다.
describe('routineInstanceSlotId — 시드 독립성(mutation guard)', () => {
  /** 소스와 동일한 FNV-1a 32비트 — `fnv1a32` 는 export 되지 않아 로컬로 재구현한다. */
  function localFnv1a32(input: string, seed: number): number {
    let hash = (2166136261 ^ seed) >>> 0;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash >>> 0;
  }

  it('같은 입력에 대해 시드 0~3 의 32비트 조각이 전부 같지는 않다(시드가 실제로 쓰인다는 최소 증거)', () => {
    const input = 'r-shared|2026-02-05';
    const hashes = [0, 1, 2, 3].map((seed) => localFnv1a32(input, seed));
    expect(new Set(hashes).size).toBeGreaterThan(1);
  });

  it('시드 넷을 전부 0으로 뭉갠 퇴역 구현은 실제 구현과 다른 id 를 낸다(회귀 고정)', () => {
    function degenerateSlotId(routineId: string, date: string): string {
      const input = `${routineId}|${date}`;
      const single = localFnv1a32(input, 0);
      const hex = (single >>> 0).toString(16).padStart(8, '0').repeat(4);
      const variantNibble = ((parseInt(hex[16] as string, 16) & 0x3) | 0x8).toString(16);
      return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        `4${hex.slice(13, 16)}`,
        `${variantNibble}${hex.slice(17, 20)}`,
        hex.slice(20, 32),
      ].join('-');
    }

    const real = routineInstanceSlotId('r-shared', '2026-02-05');
    const degenerate = degenerateSlotId('r-shared', '2026-02-05');
    expect(real).not.toBe(degenerate);
  });
});
