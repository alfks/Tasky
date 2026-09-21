// `applyServerRules` 고정 입출력 벡터. **Worker(T-93)·메모리 가짜 서버(T-92)·이 티켓의 도메인 테스트
// 셋이 같은 파일을 돈다**(SYNC_DESIGN.md §0 결론 9 "거짓 초록불 구조 차단"). 벡터를 더하거나 기대값을
// 바꿀 때는 세 계층 전부의 테스트가 이 파일을 다시 읽는지 확인한다 — 한쪽만 고치면 그 계층은 더는
// 같은 규칙을 검증하지 않는 것이다.
import { createMeta, type Meta } from '@/domain/meta';
import type { ExistingServerRow, ServerChange, ServerRuleResult } from '@/domain/sync/server-rules';

export type ServerRuleVector = {
  name: string;
  existing: ExistingServerRow | undefined;
  change: ServerChange;
  /** `applyServerRules` 세 번째 인자. 클램프가 결과를 바꾸지 않아야 하는 벡터는 `change` 의
   * `updatedAt` 과 같은 값을 준다(클램프 무동작) — 클램프 자체를 시험하는 벡터만 다른 값을 준다. */
  receivedAt: string;
  expected: ServerRuleResult;
};

const TBL = 'todos' as const;

/**
 * 리터럴 `updatedAt`·`id` 키를 여기서 직접 쓰지 않는다(NO_META_WRITE, ADR-0007) — `createMeta` 로
 * 원하는 시각의 `Meta` 를 만들고 호출부에서 **스프레드**로 결합한다(`client-merge.vectors.ts#metaOf`
 * 와 같은 패턴, ADR-0007 "감수하는 점 4"가 인정한 결합 방식).
 *
 * **반환 타입은 실제 런타임 모양(`Meta` 전체: `id`·`createdAt`·`updatedAt`·`rev`)을 정직하게 적는다.**
 * 예전엔 `Pick<Meta, 'updatedAt'>` 라고 적었는데, `createMeta` 는 그 타입과 무관하게 항상 전체
 * `Meta` 를 돌려준다 — 반환 타입 annotation 이 실제 모양을 가려서, 호출부가 `{ id: 'a', ...
 * updatedAtAt(...) }` 처럼 스프레드를 **뒤에** 두면 스프레드가 `id` 를 `'v'` 로 덮어써도 tsc 가
 * 못 잡았다(스프레드는 excess property check 를 받지 않는다). **그래서 호출부는 항상 스프레드를
 * 맨 앞에 두고, 뒤따르는 리터럴 필드(`id`·`tbl`·`baseSeq`·`deleted`)가 이긴다.**
 */
function updatedAtAt(at: string): Meta {
  return createMeta<Meta>({ now: () => at, id: () => 'v' }, {});
}

export const SERVER_RULE_VECTORS: readonly ServerRuleVector[] = [
  {
    name: '생성-없음: 처음 보는 id 를 baseSeq 0 으로 보내면 insert',
    existing: undefined,
    change: { ...updatedAtAt('2026-01-01T00:00:00.000Z'), tbl: TBL, id: 'a', baseSeq: 0 },
    receivedAt: '2026-01-01T00:00:00.000Z',
    expected: 'insert',
  },
  {
    name: '생성-있음(살아있음): 이미 있는 id 를 baseSeq 0 으로 보내면 reject-exists(updatedAt 과 무관)',
    existing: { ...updatedAtAt('2026-01-01T00:00:00.000Z'), tbl: TBL, id: 'a', deleted: false },
    change: { ...updatedAtAt('2026-06-01T00:00:00.000Z'), tbl: TBL, id: 'a', baseSeq: 0 },
    receivedAt: '2026-06-01T00:00:00.000Z',
    expected: 'reject-exists',
  },
  {
    name: '생성-있음(툼스톤): 슬롯 id 충돌 — 죽은 로우여도 baseSeq 0 이면 reject-exists(F1 방지)',
    existing: { ...updatedAtAt('2026-01-01T00:00:00.000Z'), tbl: TBL, id: 'a', deleted: true },
    change: { ...updatedAtAt('2026-06-01T00:00:00.000Z'), tbl: TBL, id: 'a', baseSeq: 0 },
    receivedAt: '2026-06-01T00:00:00.000Z',
    expected: 'reject-exists',
  },
  {
    name: '갱신-없음: 서버가 모르는 id 를 baseSeq>0 으로 보내도 insert 로 취급(해로울 것 없음)',
    existing: undefined,
    change: { ...updatedAtAt('2026-01-01T00:00:00.000Z'), tbl: TBL, id: 'b', baseSeq: 7 },
    receivedAt: '2026-01-01T00:00:00.000Z',
    expected: 'insert',
  },
  {
    name: '갱신-있음(살아있음): change.updatedAt 이 existing 보다 늦으면 update(LWW 승)',
    existing: { ...updatedAtAt('2026-01-01T00:00:00.000Z'), tbl: TBL, id: 'b', deleted: false },
    change: { ...updatedAtAt('2026-01-02T00:00:00.000Z'), tbl: TBL, id: 'b', baseSeq: 7 },
    receivedAt: '2026-01-02T00:00:00.000Z',
    expected: 'update',
  },
  {
    name: '툼스톤 갱신: 죽은 로우 위에서도 change.updatedAt 이 더 늦으면 update(삭제 전파와 동형)',
    existing: { ...updatedAtAt('2026-01-01T00:00:00.000Z'), tbl: TBL, id: 'c', deleted: true },
    change: { ...updatedAtAt('2026-01-05T00:00:00.000Z'), tbl: TBL, id: 'c', baseSeq: 3 },
    receivedAt: '2026-01-05T00:00:00.000Z',
    expected: 'update',
  },
  {
    name: '되돌리기: 툼스톤 위에 더 늦은 updatedAt 으로 살아있는 로우를 다시 put 하면 update — "툼스톤은 최종" 규칙이 없어 되돌리기가 LWW 로 전파된다',
    existing: { ...updatedAtAt('2026-01-01T00:00:00.000Z'), tbl: TBL, id: 'd', deleted: true },
    change: { ...updatedAtAt('2026-01-10T00:00:00.000Z'), tbl: TBL, id: 'd', baseSeq: 12 },
    receivedAt: '2026-01-10T00:00:00.000Z',
    expected: 'update',
  },
  {
    name: '다른 테이블도 같은 규칙 — routines 슬롯 id 충돌도 reject-exists',
    existing: {
      ...updatedAtAt('2026-01-01T00:00:00.000Z'),
      tbl: 'routines',
      id: 'slot-1',
      deleted: false,
    },
    change: {
      ...updatedAtAt('2026-01-02T00:00:00.000Z'),
      tbl: 'routines',
      id: 'slot-1',
      baseSeq: 0,
    },
    receivedAt: '2026-01-02T00:00:00.000Z',
    expected: 'reject-exists',
  },
  {
    name: '갱신 LWW: change.updatedAt 이 existing 보다 이르면 reject-stale — 반사실(A 10:00 편집→10:01 푸시, B 09:00 오프라인 편집→10:05 푸시)에서 늦게 도착한 B 가 A 를 덮지 않는다',
    existing: { ...updatedAtAt('2026-01-01T10:00:00.000Z'), tbl: TBL, id: 'e', deleted: false },
    change: { ...updatedAtAt('2026-01-01T09:00:00.000Z'), tbl: TBL, id: 'e', baseSeq: 9 },
    receivedAt: '2026-01-01T09:00:00.000Z',
    expected: 'reject-stale',
  },
  {
    name: '갱신 LWW 동률: updatedAt 이 같으면 지금 도착한 change 가 이긴다(서버 도착 순)',
    existing: { ...updatedAtAt('2026-01-01T09:00:00.000Z'), tbl: TBL, id: 'f', deleted: false },
    change: { ...updatedAtAt('2026-01-01T09:00:00.000Z'), tbl: TBL, id: 'f', baseSeq: 2 },
    receivedAt: '2026-01-01T09:00:00.000Z',
    expected: 'update',
  },
  {
    name: '툼스톤도 LWW 를 거친다: change.updatedAt 이 더 이르면 죽은 로우 위에서도 reject-stale',
    existing: { ...updatedAtAt('2026-01-01T12:00:00.000Z'), tbl: TBL, id: 'g', deleted: true },
    change: { ...updatedAtAt('2026-01-01T08:00:00.000Z'), tbl: TBL, id: 'g', baseSeq: 4 },
    receivedAt: '2026-01-01T08:00:00.000Z',
    expected: 'reject-stale',
  },
  {
    name: 'baseSeq 검증: 문자열 "0" 은 숫자 0 이 아니므로 reject-invalid(생성 가드 우회 방지)',
    existing: undefined,
    change: {
      ...updatedAtAt('2026-01-01T00:00:00.000Z'),
      tbl: TBL,
      id: 'h',
      baseSeq: '0' as unknown as number,
    },
    receivedAt: '2026-01-01T00:00:00.000Z',
    expected: 'reject-invalid',
  },
  {
    name: 'baseSeq 검증: NaN 은 reject-invalid',
    existing: undefined,
    change: { ...updatedAtAt('2026-01-01T00:00:00.000Z'), tbl: TBL, id: 'i', baseSeq: Number.NaN },
    receivedAt: '2026-01-01T00:00:00.000Z',
    expected: 'reject-invalid',
  },
  {
    name: 'baseSeq 검증: 음수(-1) 는 reject-invalid',
    existing: { ...updatedAtAt('2026-01-01T00:00:00.000Z'), tbl: TBL, id: 'j', deleted: false },
    change: { ...updatedAtAt('2026-01-02T00:00:00.000Z'), tbl: TBL, id: 'j', baseSeq: -1 },
    receivedAt: '2026-01-02T00:00:00.000Z',
    expected: 'reject-invalid',
  },
  {
    name: 'baseSeq 검증: 소수(0.5) 는 reject-invalid',
    existing: undefined,
    change: { ...updatedAtAt('2026-01-01T00:00:00.000Z'), tbl: TBL, id: 'k', baseSeq: 0.5 },
    receivedAt: '2026-01-01T00:00:00.000Z',
    expected: 'reject-invalid',
  },
  {
    name: 'baseSeq 검증: null 은 reject-invalid',
    existing: undefined,
    change: {
      ...updatedAtAt('2026-01-01T00:00:00.000Z'),
      tbl: TBL,
      id: 'l',
      baseSeq: null as unknown as number,
    },
    receivedAt: '2026-01-01T00:00:00.000Z',
    expected: 'reject-invalid',
  },
  {
    name: '미래 클램프: change.updatedAt 이 receivedAt 보다 미래면 receivedAt 으로 눌러 앉힌 뒤 LWW 판정한다 — 클램프 없이 원본 값을 그대로 쓰면 update, 클램프하면 reject-stale',
    existing: { ...updatedAtAt('2026-06-01T00:00:00.000Z'), tbl: TBL, id: 'm', deleted: false },
    change: { ...updatedAtAt('2099-01-01T00:00:00.000Z'), tbl: TBL, id: 'm', baseSeq: 5 },
    receivedAt: '2026-01-01T00:00:00.000Z',
    expected: 'reject-stale',
  },
  {
    name: '미래 클램프(툼스톤): 죽은 로우 위에서도 change.updatedAt 클램프가 먼저 적용된다',
    existing: { ...updatedAtAt('2026-06-01T00:00:00.000Z'), tbl: TBL, id: 'n', deleted: true },
    change: { ...updatedAtAt('2099-01-01T00:00:00.000Z'), tbl: TBL, id: 'n', baseSeq: 5 },
    receivedAt: '2026-01-01T00:00:00.000Z',
    expected: 'reject-stale',
  },
];
