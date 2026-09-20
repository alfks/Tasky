// IndexedDB 데이터셋 저장소 (ADR-0009). 엔티티 레포지토리와 **별개 계약**이라 툼스톤을 포함해 읽고
// 물리 삭제(`restore`)를 한다 — 그 예외의 근거와 안전 조건은 ADR-0009 결정 2·4 다.
//
// 원자성은 Dexie 트랜잭션 롤백이 준다. 그 위에 2단계 구조(검증 → 적용)를 얹는데, 그 1단계는 이제
// memory 구현과 **같은 함수**다(`@/repositories/write-plan` 의 `planWrite` — 예전에는 두 파일에 글자
// 단위로 복제돼 있었다). 이 파일이 넣는 것은 `puttersFor` 하나뿐이다.
// **검증이 무엇을 벌어 주는지는 재어 보고 적는다**: 검증 본문을 통째로 지워도 계약 55건이 전부 통과한다
// (Dexie 가 `put(불량값)` 에서 던지고 트랜잭션이 롤백하므로 "변화 0" 은 그대로다 — 구현자·리뷰어가 각각 실측).
// **계약은 이 검증을 강제하지 않는다.** 검증이 실제로 버는 것은 둘뿐이고, 둘 다 계약 밖이라
// `dataset-atomicity.test.ts` 가 단언한다(그 6건이 없으면 이 함수는 지워도 아무도 모른다):
//   (1) 실패가 Dexie 내부 에러가 아니라 `RepositoryError('DATASET_WRITE_INVALID')` 로 나간다(UI 가 code 로 분기).
//   (2) 에러 detail 에 제목·메모 같은 사용자 데이터가 실리지 않고 `table=…` 만 실린다.
// 검증이 트랜잭션 **밖**(1단계)이라는 것 자체는 위 둘과 별개 축이다 — 안으로 옮겨도 (1)·(2)는 성립하므로,
// 그 축은 `dataset-atomicity.test.ts` 의 "트랜잭션을 한 번도 열지 않는다"(스파이) 1건이 따로 고정한다.
import type { Meta, Persistable } from '@/domain/meta';
import { SETTINGS_ID } from '@/domain/theme/settings';

import type { DatasetRepository } from '@/repositories/dataset-repository';
import { RepositoryError } from '@/repositories/repository-error';
import { planWrite, type DatasetWriteAppliers } from '@/repositories/write-plan';

import { allRows, bulkPut, clear, put, type LiveTable, type Store } from '@/infra/indexeddb/query';

/**
 * 백업 가져오기의 청크 크기. **미측정 값**이다 — 한 번의 `bulkPut` 이 지나치게 커지지 않게 하는 선일 뿐,
 * 프레임 단위 블로킹 시간을 재서 고른 값이 아니다(게다가 `replaceRows` 는 한 트랜잭션 **안**에서 돌므로
 * 청크가 메인 스레드를 양보한다는 보장도 없다). 5만 행 가져오기가 실제 화면에서 문제가 되면
 * TECH_PLAN §8 예산으로 재서 고친다.
 */
const CHUNK = 500;

/** 한 테이블을 비우고 스냅샷으로 채운다. 청크로 쪼개 한 번의 `bulkPut` 이 지나치게 커지지 않게 한다. */
async function replaceRows<T extends Meta>(
  table: LiveTable<T, string>,
  rows: readonly Persistable<T>[],
): Promise<void> {
  await clear(table);
  for (let from = 0; from < rows.length; from += CHUNK) {
    await bulkPut(table, rows.slice(from, from + CHUNK));
  }
}

/** 테이블별 실제 쓰기 — `planWrite` 에 넘기는 유일한 구현별 조각이다(memory 구현은 Map 에 넣는다). */
function puttersFor(store: Store): DatasetWriteAppliers {
  return {
    todos: (entity) => put(store.todos, entity),
    categories: (entity) => put(store.categories, entity),
    focusSessions: (entity) => put(store.focusSessions, entity),
    settings: (entity) => put(store.settings, entity),
    routines: (entity) => put(store.routines, entity),
  };
}

/** 주어진 묶음(= 하나의 Dexie 인스턴스) 위에서 동작하는 데이터셋 저장소. */
export function createIndexedDbDatasetRepository(store: Store): DatasetRepository {
  const putters = puttersFor(store);
  return {
    readAll: async () => {
      // 단일 행의 정의는 **`SETTINGS_ID` 하나**다 — `SettingsRepository.get()` 과 같은 기준으로 읽는다.
      // `id` 오름차순 첫 행을 쓰면 다른 id 의 설정 행이 들어왔을 때 두 API 의 답이 갈린다(계약이 단언한다).
      const settings = (await allRows(store.settings)).find((row) => row.id === SETTINGS_ID);
      if (settings === undefined) {
        throw new RepositoryError('SETTINGS_MISSING');
      }
      return {
        todos: await allRows(store.todos),
        categories: await allRows(store.categories),
        focusSessions: await allRows(store.focusSessions),
        settings,
      };
    },
    write: async (writes) => {
      // 1단계: 전량 해석·검증(쓰기 없음, 트랜잭션 밖). 2단계: 트랜잭션 안에서 적용 — 여기서 나는
      // 실패는 Dexie 가 롤백한다. 콜백 안에는 Dexie 가 아닌 `await` 가 없다(query.ts 의 transaction 주석).
      const appliers = writes.map((write) => planWrite(putters, write));
      // 쓸 것이 없으면 트랜잭션도 열지 않는다(빈 배열도 계약상 성공이다).
      if (appliers.length === 0) {
        return;
      }
      await store.transaction(async () => {
        for (const apply of appliers) {
          await apply();
        }
      });
    },
    restore: async (snapshot) => {
      await store.transaction(async () => {
        await replaceRows(store.todos, snapshot.todos);
        await replaceRows(store.categories, snapshot.categories);
        await replaceRows(store.focusSessions, snapshot.focusSessions);
        await replaceRows(store.settings, [snapshot.settings]);
      });
    },
  };
}
