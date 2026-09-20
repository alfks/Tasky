// `RoutineRepository` 계약과 워터마크 멱등성을 memory·indexeddb 양쪽에 돌린다. 다른 네 저장소처럼
// `memory.contract.test.ts`/`indexeddb.contract.test.ts` 에 한 줄로 끼지 않는 이유:
// 그 두 파일은 이 티켓(T-81) owns 밖이다(다섯 저장소 계약을 이미 들고 있는 파일이라 손대면 다른
// 티켓과 락이 겹친다) — 패턴은 `dday-repository.contract.test.ts` 에서 그대로 옮겨 왔다.
import type { ContractTarget } from '@/repositories/contract';
import { createMemoryRepositories } from '@/repositories/memory/repositories';
import { runRoutineFillContract } from '@/repositories/routine-fill.contract';
import { runRoutineRepositoryContract } from '@/repositories/routine-repository.contract';

import { createStore } from '@/infra/indexeddb/query';
import { createIndexedDbRepositories } from '@/infra/indexeddb/repositories';

const MEMORY: ContractTarget = {
  name: 'memory',
  create: async () => createMemoryRepositories(),
};

let bundle = 0;
const INDEXEDDB: ContractTarget = {
  name: 'indexeddb',
  create: () =>
    Promise.resolve(createIndexedDbRepositories(createStore(`tasky-routine-contract-${++bundle}`))),
};

runRoutineRepositoryContract(MEMORY);
runRoutineRepositoryContract(INDEXEDDB);

runRoutineFillContract(MEMORY);
runRoutineFillContract(INDEXEDDB);
