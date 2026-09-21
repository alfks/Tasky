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
    change: { tbl: TBL, id: 'a', baseSeq: 0 },
    expected: 'insert',
  },
  {
    name: '생성-있음(살아있음): 이미 있는 id 를 baseSeq 0 으로 보내면 reject-exists',
    existing: { tbl: TBL, id: 'a', deleted: false },
    change: { tbl: TBL, id: 'a', baseSeq: 0 },
    expected: 'reject-exists',
  },
  {
    name: '생성-있음(툼스톤): 슬롯 id 충돌 — 죽은 로우여도 baseSeq 0 이면 reject-exists(F1 방지)',
    existing: { tbl: TBL, id: 'a', deleted: true },
    change: { tbl: TBL, id: 'a', baseSeq: 0 },
    expected: 'reject-exists',
  },
  {
    name: '갱신-없음: 서버가 모르는 id 를 baseSeq>0 으로 보내도 insert 로 취급(해로울 것 없음)',
    existing: undefined,
    change: { tbl: TBL, id: 'b', baseSeq: 7 },
    expected: 'insert',
  },
  {
    name: '갱신-있음(살아있음): 있는 id 를 baseSeq>0 으로 보내면 항상 update',
    existing: { tbl: TBL, id: 'b', deleted: false },
    change: { tbl: TBL, id: 'b', baseSeq: 7 },
    expected: 'update',
  },
  {
    name: '툼스톤 갱신: 이미 죽은 로우를 다시 baseSeq>0 으로 보내도 update(삭제 전파와 동형)',
    existing: { tbl: TBL, id: 'c', deleted: true },
    change: { tbl: TBL, id: 'c', baseSeq: 3 },
    expected: 'update',
  },
  {
    name: '되돌리기: 툼스톤 위에 살아있는 로우를 baseSeq>0 으로 다시 put 하면 update — "툼스톤은 최종" 규칙이 없어 되돌리기가 전파된다',
    existing: { tbl: TBL, id: 'd', deleted: true },
    change: { tbl: TBL, id: 'd', baseSeq: 12 },
    expected: 'update',
  },
  {
    name: '다른 테이블도 같은 규칙 — routines 슬롯 id 충돌도 reject-exists',
    existing: { tbl: 'routines', id: 'slot-1', deleted: false },
    change: { tbl: 'routines', id: 'slot-1', baseSeq: 0 },
    expected: 'reject-exists',
  },
];
