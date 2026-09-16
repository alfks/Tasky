// indexeddb 구현에 계약 스위트 다섯을 돌린다. **스위트 본문은 여기 없다** — `src/repositories/*.contract.ts`
// 가 갖고 있고 memory 구현(`memory.contract.test.ts`)이 같은 함수를 부른다. 두 파일의 차이는
// `ContractTarget` 하나뿐이며, 그것이 "같은 계약을 두 구현에 돌린다" 의 전부다(ADR-0007 규칙 3).

import { runCategoryRepositoryContract } from '@/repositories/category-repository.contract';
import type { ContractTarget } from '@/repositories/contract';
import { runDatasetRepositoryContract } from '@/repositories/dataset-repository.contract';
import { runFocusSessionRepositoryContract } from '@/repositories/focus-session-repository.contract';
import { runSettingsRepositoryContract } from '@/repositories/settings-repository.contract';
import { runTodoRepositoryContract } from '@/repositories/todo-repository.contract';

import { clear, tables, transaction } from '@/infra/indexeddb/query';
import { createIndexedDbRepositories } from '@/infra/indexeddb/repositories';

/**
 * 호출할 때마다 **빈 상태**의 묶음. memory 는 새 Map 을 만들면 되지만 IndexedDB 는 DB 가 하나뿐이라
 * 네 테이블을 비워서 같은 의미를 만든다 — 그래서 `clear` 가 query.ts 에 필요했다.
 * 비우기는 한 트랜잭션 안에서 한다: 중간에 실패해도 "반만 비워진" 상태가 남지 않는다.
 */
const INDEXEDDB: ContractTarget = {
  name: 'indexeddb',
  create: async () => {
    await transaction(async () => {
      await clear(tables.todos);
      await clear(tables.categories);
      await clear(tables.settings);
      await clear(tables.focusSessions);
    });
    return createIndexedDbRepositories();
  },
};

runTodoRepositoryContract(INDEXEDDB);
runCategoryRepositoryContract(INDEXEDDB);
runSettingsRepositoryContract(INDEXEDDB);
runFocusSessionRepositoryContract(INDEXEDDB);
runDatasetRepositoryContract(INDEXEDDB);
