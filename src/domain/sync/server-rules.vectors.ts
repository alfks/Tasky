// `applyServerRules` 고정 입출력 벡터. **Worker(T-93)·메모리 가짜 서버(T-92)·이 티켓의 도메인 테스트
// 셋이 같은 파일을 돈다**(SYNC_DESIGN.md §0 결론 9 "거짓 초록불 구조 차단"). 벡터를 더하거나 기대값을
// 바꿀 때는 세 계층 전부의 테스트가 이 파일을 다시 읽는지 확인한다 — 한쪽만 고치면 그 계층은 더는
// 같은 규칙을 검증하지 않는 것이다.
import type { ExistingServerRow, ServerChange, ServerRuleResult } from '@/domain/sync/server-rules';

export type ServerRuleVector = {
  name: string;
  existing: ExistingServerRow | undefined;
  change: ServerChange;
  expected: ServerRuleResult;
};

const TBL = 'todos' as const;

export const SERVER_RULE_VECTORS: readonly ServerRuleVector[] = [
  {
    name: '생성-없음: 처음 보는 id 를 baseSeq 0 으로 보내면 insert',
    existing: undefined,
    change: { tbl: TBL, id: 'a', baseSeq: 0, updatedAt: '2026-01-01T00:00:00.000Z' },
    expected: 'insert',
  },
  {
    name: '생성-있음(살아있음): 이미 있는 id 를 baseSeq 0 으로 보내면 reject-exists(updatedAt 과 무관)',
    existing: { tbl: TBL, id: 'a', deleted: false, updatedAt: '2026-01-01T00:00:00.000Z' },
    change: { tbl: TBL, id: 'a', baseSeq: 0, updatedAt: '2026-06-01T00:00:00.000Z' },
    expected: 'reject-exists',
  },
  {
    name: '생성-있음(툼스톤): 슬롯 id 충돌 — 죽은 로우여도 baseSeq 0 이면 reject-exists(F1 방지)',
    existing: { tbl: TBL, id: 'a', deleted: true, updatedAt: '2026-01-01T00:00:00.000Z' },
    change: { tbl: TBL, id: 'a', baseSeq: 0, updatedAt: '2026-06-01T00:00:00.000Z' },
    expected: 'reject-exists',
  },
  {
    name: '갱신-없음: 서버가 모르는 id 를 baseSeq>0 으로 보내도 insert 로 취급(해로울 것 없음)',
    existing: undefined,
    change: { tbl: TBL, id: 'b', baseSeq: 7, updatedAt: '2026-01-01T00:00:00.000Z' },
    expected: 'insert',
  },
  {
    name: '갱신-있음(살아있음): change.updatedAt 이 existing 보다 늦으면 update(LWW 승)',
    existing: { tbl: TBL, id: 'b', deleted: false, updatedAt: '2026-01-01T00:00:00.000Z' },
    change: { tbl: TBL, id: 'b', baseSeq: 7, updatedAt: '2026-01-02T00:00:00.000Z' },
    expected: 'update',
  },
  {
    name: '툼스톤 갱신: 죽은 로우 위에서도 change.updatedAt 이 더 늦으면 update(삭제 전파와 동형)',
    existing: { tbl: TBL, id: 'c', deleted: true, updatedAt: '2026-01-01T00:00:00.000Z' },
    change: { tbl: TBL, id: 'c', baseSeq: 3, updatedAt: '2026-01-05T00:00:00.000Z' },
    expected: 'update',
  },
  {
    name: '되돌리기: 툼스톤 위에 더 늦은 updatedAt 으로 살아있는 로우를 다시 put 하면 update — "툼스톤은 최종" 규칙이 없어 되돌리기가 LWW 로 전파된다',
    existing: { tbl: TBL, id: 'd', deleted: true, updatedAt: '2026-01-01T00:00:00.000Z' },
    change: { tbl: TBL, id: 'd', baseSeq: 12, updatedAt: '2026-01-10T00:00:00.000Z' },
    expected: 'update',
  },
  {
    name: '다른 테이블도 같은 규칙 — routines 슬롯 id 충돌도 reject-exists',
    existing: { tbl: 'routines', id: 'slot-1', deleted: false, updatedAt: '2026-01-01T00:00:00.000Z' },
    change: { tbl: 'routines', id: 'slot-1', baseSeq: 0, updatedAt: '2026-01-02T00:00:00.000Z' },
    expected: 'reject-exists',
  },
  {
    name: '갱신 LWW: change.updatedAt 이 existing 보다 이르면 reject-stale — 반사실(A 10:00 편집→10:01 푸시, B 09:00 오프라인 편집→10:05 푸시)에서 늦게 도착한 B 가 A 를 덮지 않는다',
    existing: { tbl: TBL, id: 'e', deleted: false, updatedAt: '2026-01-01T10:00:00.000Z' },
    change: { tbl: TBL, id: 'e', baseSeq: 9, updatedAt: '2026-01-01T09:00:00.000Z' },
    expected: 'reject-stale',
  },
  {
    name: '갱신 LWW 동률: updatedAt 이 같으면 지금 도착한 change 가 이긴다(서버 도착 순)',
    existing: { tbl: TBL, id: 'f', deleted: false, updatedAt: '2026-01-01T09:00:00.000Z' },
    change: { tbl: TBL, id: 'f', baseSeq: 2, updatedAt: '2026-01-01T09:00:00.000Z' },
    expected: 'update',
  },
  {
    name: '툼스톤도 LWW 를 거친다: change.updatedAt 이 더 이르면 죽은 로우 위에서도 reject-stale',
    existing: { tbl: TBL, id: 'g', deleted: true, updatedAt: '2026-01-01T12:00:00.000Z' },
    change: { tbl: TBL, id: 'g', baseSeq: 4, updatedAt: '2026-01-01T08:00:00.000Z' },
    expected: 'reject-stale',
  },
  {
    name: 'baseSeq 검증: 문자열 "0" 은 숫자 0 이 아니므로 reject-invalid(생성 가드 우회 방지)',
    existing: undefined,
    change: {
      tbl: TBL,
      id: 'h',
      baseSeq: '0' as unknown as number,
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    expected: 'reject-invalid',
  },
  {
    name: 'baseSeq 검증: NaN 은 reject-invalid',
    existing: undefined,
    change: { tbl: TBL, id: 'i', baseSeq: Number.NaN, updatedAt: '2026-01-01T00:00:00.000Z' },
    expected: 'reject-invalid',
  },
  {
    name: 'baseSeq 검증: 음수(-1) 는 reject-invalid',
    existing: { tbl: TBL, id: 'j', deleted: false, updatedAt: '2026-01-01T00:00:00.000Z' },
    change: { tbl: TBL, id: 'j', baseSeq: -1, updatedAt: '2026-01-02T00:00:00.000Z' },
    expected: 'reject-invalid',
  },
  {
    name: 'baseSeq 검증: 소수(0.5) 는 reject-invalid',
    existing: undefined,
    change: { tbl: TBL, id: 'k', baseSeq: 0.5, updatedAt: '2026-01-01T00:00:00.000Z' },
    expected: 'reject-invalid',
  },
  {
    name: 'baseSeq 검증: null 은 reject-invalid',
    existing: undefined,
    change: {
      tbl: TBL,
      id: 'l',
      baseSeq: null as unknown as number,
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    expected: 'reject-invalid',
  },
];
