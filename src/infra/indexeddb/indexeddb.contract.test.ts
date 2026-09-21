// indexeddb 구현에 계약 스위트 다섯을 돌린다. **스위트 본문은 여기 없다** — `src/repositories/*.contract.ts`
// 가 갖고 있고 memory 구현(`memory.contract.test.ts`)이 같은 함수를 부른다. 두 파일의 차이는
// `ContractTarget` 하나뿐이며, 그것이 "같은 계약을 두 구현에 돌린다" 의 전부다(ADR-0007 규칙 3).
import { describe, expect, it } from 'vitest';

import { runCategoryRepositoryContract } from '@/repositories/category-repository.contract';
import { contractDeps, contractTodo, type ContractTarget } from '@/repositories/contract';
import { runDatasetRepositoryContract } from '@/repositories/dataset-repository.contract';
import { runFocusSessionRepositoryContract } from '@/repositories/focus-session-repository.contract';
import { runSettingsRepositoryContract } from '@/repositories/settings-repository.contract';
import { runSyncRepositoryContract } from '@/repositories/sync-repository.contract';
import { runTodoRepositoryContract } from '@/repositories/todo-repository.contract';

import { createStore } from '@/infra/indexeddb/query';
import { createIndexedDbRepositories } from '@/infra/indexeddb/repositories';

let bundle = 0;

/**
 * 호출할 때마다 **서로 격리된** 빈 묶음. memory 는 새 Map 을 만들면 되고, IndexedDB 는 이름이 다른 DB 를
 * 여는 것이 같은 의미를 내는 유일한 방법이다(같은 이름이면 브라우저당 DB 가 하나다).
 *
 * 처음에는 "네 테이블을 비우고 같은 인스턴스를 다시 내주는" 방식이었는데, 그건 격리가 아니라 **전역
 * 리셋**이었다: 두 번째 묶음을 만들면 첫 묶음의 데이터도 사라진다(리뷰에서 프로브로 측정). 계약이 두
 * 묶음을 동시에 쓰는 자리가 둘 있고(`focus-session-repository.contract.ts` 의 `reversed`,
 * `dataset-repository.contract.ts` 의 `empty`), 그 방식에서는 두 자리가 memory 와 **다른 이유로** 통과했다
 * — 앞으로 "묶음 A 를 건드려도 B 는 안 변한다" 축이 계약에 들어오면 indexeddb 만 조용히 통과하는
 * false green 이 된다. 지금은 DB 이름을 갈라 진짜 격리를 만들고, 아래 describe 가 그것을 단언한다.
 */
const INDEXEDDB: ContractTarget = {
  name: 'indexeddb',
  create: () =>
    Promise.resolve(createIndexedDbRepositories(createStore(`tasky-contract-${++bundle}`))),
};

runTodoRepositoryContract(INDEXEDDB);
runCategoryRepositoryContract(INDEXEDDB);
runSettingsRepositoryContract(INDEXEDDB);
runFocusSessionRepositoryContract(INDEXEDDB);
runDatasetRepositoryContract(INDEXEDDB);
runSyncRepositoryContract(INDEXEDDB);

describe('indexeddb ContractTarget 의 격리 (계약 스위트가 전제하는 성질)', () => {
  // 이 단언이 없으면 `create()` 를 전역 비우기로 되돌려도 계약 55건이 전부 초록이다(실측).
  it('새 묶음을 만들어도 먼저 만든 묶음의 데이터는 그대로다', async () => {
    const deps = contractDeps();
    const first = await INDEXEDDB.create();
    await first.todos.upsert(contractTodo(deps));
    expect(await first.todos.listAll()).toHaveLength(1);

    const second = await INDEXEDDB.create();

    expect(await second.todos.listAll(), '새 묶음은 비어 있어야 한다').toHaveLength(0);
    expect(
      await first.todos.listAll(),
      '먼저 만든 묶음이 비었다 — create() 가 격리가 아니라 전역 비우기다',
    ).toHaveLength(1);
  });
});
