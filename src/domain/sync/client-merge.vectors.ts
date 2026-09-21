// `planClientMerge` 고정 벡터 — ①-5 표의 네 행. 도메인 테스트와, 이 표를 실제로 적용하는
// `SyncRepository.applyRemote`/메모리 트랜스포트 계약 테스트(T-92)가 같은 파일을 읽는다
// (SYNC_DESIGN.md §①-5 "client-merge.vectors.ts(고정 벡터)로 도메인 테스트·메모리 트랜스포트
// 테스트·e2e 가 같은 파일을 읽는다").
import { createMeta, touch, type Meta } from '@/domain/meta';
import type { ClientMergeAction, ClientMergeInput } from '@/domain/sync/client-merge';

/** 리터럴 Meta 키를 쓰지 않고(NO_META_WRITE, ADR-0007) 원하는 rev 를 만든다 — createMeta 뒤 touch 를 반복. */
function metaOf(rev: number): Meta {
  let entity: Meta = createMeta<Meta>({ now: () => '2026-01-15T00:00:00.000Z', id: () => 'a' }, {});
  for (let i = 1; i < rev; i += 1) {
    entity = touch(entity, '2026-01-16T00:00:00.000Z');
  }
  return entity;
}

export type ClientMergeVector = {
  name: string;
  input: ClientMergeInput;
  expected: ClientMergeAction;
};

export const CLIENT_MERGE_VECTORS: readonly ClientMergeVector[] = [
  {
    name: '로컬에 없음 → R 저장',
    input: { local: undefined, inOutbox: false },
    expected: { action: 'adopt-remote' },
  },
  {
    name: '있고 아웃박스에 없음 → R 저장(덮어씀), 서버가 진실',
    input: { local: metaOf(3), inOutbox: false },
    expected: { action: 'adopt-remote' },
  },
  {
    name: '있고 아웃박스에 있음, rev===1(한 번도 안 고침) → R 저장 + 아웃박스 제거',
    input: { local: metaOf(1), inOutbox: true },
    expected: { action: 'adopt-remote-and-drop-outbox' },
  },
  {
    name: '있고 아웃박스에 있음, rev>1(이미 고침) → 로컬 유지, 이어지는 푸시가 나중 도착으로 이긴다',
    input: { local: metaOf(2), inOutbox: true },
    expected: { action: 'keep-local' },
  },
];
