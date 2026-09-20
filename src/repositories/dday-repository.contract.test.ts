// `DdayRepository` 계약을 memory·indexeddb 양쪽에 돌린다. 다른 네 저장소처럼
// `memory.contract.test.ts`/`indexeddb.contract.test.ts` 에 한 줄로 끼지 않고 별도 파일로 두는 이유:
// 그 두 파일은 이 티켓(T-79) owns 밖이라 고칠 수 없다(다섯 저장소 계약을 이미 들고 있는 파일이라
// 손대면 다른 티켓과 락이 겹친다) — 패턴은 그대로 두 파일에서 옮겨 왔다.
import type { ContractTarget } from '@/repositories/contract';
import { runDdayRepositoryContract } from '@/repositories/dday-repository.contract';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

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
    Promise.resolve(createIndexedDbRepositories(createStore(`tasky-dday-contract-${++bundle}`))),
};

runDdayRepositoryContract(MEMORY);
runDdayRepositoryContract(INDEXEDDB);
