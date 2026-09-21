// memory 구현에 계약 스위트 다섯을 돌린다. **스위트 본문은 여기 없다** — `*.contract.ts` 가 갖고 있고
// T-10 은 같은 함수를 indexeddb 대상(`src/infra/indexeddb/*.contract.test.ts`)에서 그대로 부르면 된다.
// 스위트를 `*.contract.ts`(테스트 파일이 아님)로 둔 덕에, 그렇게 import 해도 memory 실행분이 딸려오지 않는다.
import { runCategoryRepositoryContract } from '@/repositories/category-repository.contract';
import type { ContractTarget } from '@/repositories/contract';
import { runDatasetRepositoryContract } from '@/repositories/dataset-repository.contract';
import { runFocusSessionRepositoryContract } from '@/repositories/focus-session-repository.contract';
import { createMemoryRepositories } from '@/repositories/memory/repositories';
import { runSettingsRepositoryContract } from '@/repositories/settings-repository.contract';
import { runSyncRepositoryContract } from '@/repositories/sync-repository.contract';
import { runTodoRepositoryContract } from '@/repositories/todo-repository.contract';

/** 호출할 때마다 빈 상태의 새 묶음 — 테스트끼리 상태가 새지 않는다. */
const MEMORY: ContractTarget = {
  name: 'memory',
  create: async () => createMemoryRepositories(),
};

runTodoRepositoryContract(MEMORY);
runCategoryRepositoryContract(MEMORY);
runSettingsRepositoryContract(MEMORY);
runFocusSessionRepositoryContract(MEMORY);
runDatasetRepositoryContract(MEMORY);
runSyncRepositoryContract(MEMORY);
