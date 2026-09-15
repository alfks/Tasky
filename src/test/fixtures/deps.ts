// 결정적 시각·ID 주입기와 픽스처 공통 상수. 도메인·레포지토리 테스트는 전부 여기서 deps 를 받는다.
import type { DateKey } from '@/domain/date/date-key';
import type { MetaDeps } from '@/domain/meta';

/** 모든 픽스처의 기준 날짜(목요일). */
export const FIXTURE_DATE = '2026-01-15' as DateKey;
/** 모든 픽스처의 기준 시각 — `createdAt = updatedAt` 기본값. */
export const FIXTURE_INSTANT = '2026-01-15T00:00:00.000Z';

/** 엔티티 종류별 id 접두 — 실패 메시지에서 어떤 엔티티인지 바로 보이게 한다. */
const ID_PREFIX = {
  todo: '10000000',
  category: '20000000',
  focus: '30000000',
  generated: 'f0000000',
} as const;

/**
 * 결정적인 UUID v4 형식 id. `adopt()` 의 id 검증(ADR-0009 결정 3)을 통과해야 하므로
 * 읽기 좋은 문자열 대신 실제 v4 모양을 쓴다.
 */
export function fixtureId(kind: keyof typeof ID_PREFIX, seq = 1): string {
  return `${ID_PREFIX[kind]}-0000-4000-8000-${String(seq).padStart(12, '0')}`;
}

/**
 * 고정 시각 + 증가하는 id 를 주는 `MetaDeps`. 같은 테스트 안에서 여러 번 호출해도 시각은 그대로라
 * "한 번만 now() 를 부른다"(category R14) 같은 규칙은 별도 스파이로 센다.
 */
export function fixedDeps(options: { now?: string; idSeed?: number } = {}): MetaDeps {
  let seq = options.idSeed ?? 1;
  return {
    now: () => options.now ?? FIXTURE_INSTANT,
    id: () => fixtureId('generated', seq++),
  };
}

/** `now()` 호출 횟수를 세는 deps. 시각을 한 번만 읽는지 단언할 때 쓴다. */
export function countingDeps(now: string = FIXTURE_INSTANT): MetaDeps & { nowCalls: () => number } {
  let calls = 0;
  let seq = 1;
  return {
    now: () => {
      calls += 1;
      return now;
    },
    id: () => fixtureId('generated', seq++),
    nowCalls: () => calls,
  };
}
