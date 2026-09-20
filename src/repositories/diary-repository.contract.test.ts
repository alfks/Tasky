// `DiaryRepository` 계약을 memory·indexeddb 양쪽에 돌린다. `dday-repository.contract.test.ts` 와
// 같은 이유로 `memory.contract.test.ts`/`indexeddb.contract.test.ts` 에 끼지 않고 별도 파일로 둔다
// — 그 두 파일은 이 티켓(T-80) owns 밖이다.
import type { ContractTarget } from '@/repositories/contract';
import { runDiaryRepositoryContract } from '@/repositories/diary-repository.contract';
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
    Promise.resolve(createIndexedDbRepositories(createStore(`tasky-diary-contract-${++bundle}`))),
};

runDiaryRepositoryContract(MEMORY);
runDiaryRepositoryContract(INDEXEDDB);
