// 루틴 인스턴스의 결정적 슬롯 id (SYNC_DESIGN.md §①-2, ADR-0017 §재검토 트리거 위험 1).
//
// **채택한 후보 1/3: "인스턴스 id 를 `(routineId, date)` 결정적 id 로 바꿔 위험 1(두 기기 독립
// 채우기 → id 가 달라 중복)을 구조로 제거한다."** 두 기기가 같은 슬롯을 독립적으로 채워도 같은
// `id` 를 만들면, 서버의 "생성은 없을 때만"(`server-rules.ts`)이 먼저 도착한 것만 남기고 나머지는
// `reject-exists` 로 거절한다 — 이 파일 + `server-rules.ts` 의 조합이 F1 을 닫는다
// (`risk-scenarios.test.ts` 가 그 조합을 직접 실행해 고정한다).
//
// **이 티켓 owns 밖의 일**: 이 함수를 실제로 `planRoutineFill`(src/domain/routine/routine-fill.ts)
// 이 부르게 만드는 배선, 그리고 `Routine.materializedThrough` 를 "사용자 조작으로만 바뀌는 하한"으로
// 재정의하는 것(후보 2·3, watermark-merge.ts 참고)은 `src/domain/routine/**` 을 건드려야 해서 이
// 티켓(`src/domain/sync/**`) 밖이다 — 후속 티켓(T-92 상당)이 배선한다.
//
// **왜 `src/lib/hash.ts` 가 아니라 여기 있는가**: 설계 문서 §③-1 은 이 함수를 `src/domain/routine/`
// 에, 해시 자체는 `src/lib/hash.ts` 에 두라고 적었다. 이 티켓의 owns 는 `src/domain/sync/**` 뿐이라
// 두 위치 다 만들 수 없었고, 이 함수가 sync 의 병합 위험(F1)을 닫기 위해 존재하는 이상 당장은 이
// 디렉토리가 가장 정직한 자리다(라우틴 도메인으로 옮기는 리팩터는 후속 티켓의 몫으로 남긴다).
//
// **해시**: `crypto`·`Math.random` 은 도메인 어디서도 부를 수 없다(ADR-0005 규칙 2) — 순수 산술
// FNV-1a 32비트를 네 개의 다른 시드로 돌려 128비트를 만든다. 암호학적 해시가 아니지만
// 목적(우연한 충돌 방지)에는 32비트 4개의 눈사태 효과로 충분하다(`routine-slot.test.ts` 10만 쌍
// 무충돌로 실측).
function fnv1a32(input: string, seed: number): number {
  let hash = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function toHex8(value: number): string {
  return (value >>> 0).toString(16).padStart(8, '0');
}

/**
 * `(routineId, date)` → UUID v4 **모양**의 128비트 결정적 id. 같은 입력은 어느 기기·어느 런타임에서
 * 돌려도 같은 값을 낸다(순수 산술, 시각·난수·환경 의존 0). `meta.ts` 의 `UUID_V4_PATTERN`
 * (`/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`)을 그대로 통과하므로
 * `adopt()`/`createMeta` 의 id 검증을 새로 열 필요가 없다.
 */
export function routineInstanceSlotId(routineId: string, date: string): string {
  const input = `${routineId}|${date}`;
  const hex =
    toHex8(fnv1a32(input, 0)) +
    toHex8(fnv1a32(input, 1)) +
    toHex8(fnv1a32(input, 2)) +
    toHex8(fnv1a32(input, 3));

  const variantNibble = ((parseInt(hex[16] as string, 16) & 0x3) | 0x8).toString(16);

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${variantNibble}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}
