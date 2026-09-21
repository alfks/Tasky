// 원격(풀)로 받은 로우 검증 — `validate-rows.ts` 의 7개 reader 를 **그대로** 재사용한다
// (SYNC_DESIGN.md §①-1 "로우 검증(validate-rows.ts readers)·isTombstone 은 둘 다 같은 함수를 쓴다").
// 서버도 어차피 같은 화이트리스트로 걸러 저장했으므로(§②-3 "요청 로우는 validate-rows.ts 로 검증")
// 풀로 돌아오는 로우도 같은 규칙으로 다시 본다 — 왕복 양쪽에서 같은 문 하나를 쓰는 것이 핵심이다.
//
// **`adopt()` 를 여기서 부른다(ADR-0018, ADR-0009 규칙 1 개정 — "호출처는 plan-import.ts 하나"에서
// "plan-import.ts + sync/remote-rows.ts 둘"로).** `validate-rows.ts` 의 각 reader 가 내부에서 이미
// `assertMeta`(→ `adopt` 호출·브랜드 버림)로 형식을 전수 검증하므로 이 파일이 다시 형식을 확인하지는
// 않는다 — 여기서 `adopt` 를 부르는 이유는 그 검증을 **다시 하기 위해서가 아니라**, 저장 직전에
// `Persistable` 브랜드로 봉인해서 넘기기 위해서다(호출부 `SyncRepository.applyRemote`, T-92 후속이
// `upsert` 계열 API 에 그대로 넘길 수 있게). 린트 예외는 필요 없었다 — `adopt` 호출처 제한은 도구가
// 아니라 리뷰가 지킨다(`meta.ts` jsdoc, ADR-0009 규칙 1 주석).
import { isBackupShapeError } from '@/domain/backup/shape';
import {
  readCategory,
  readDday,
  readDiaryEntry,
  readFocusSession,
  readRoutine,
  readSettings,
  readTodo,
} from '@/domain/backup/validate-rows';
import { adopt, type Meta, type Persistable } from '@/domain/meta';
import type { SyncTable } from '@/domain/sync/wire';

/**
 * 테이블 → reader 전수 매핑. `satisfies Record<SyncTable, (value, path) => Meta>` 라 테이블이
 * 늘면(`SyncTable` 이 바뀌면) 이 객체가 그 키를 안 채운 순간 컴파일 에러가 난다(T-91 완료 조건과
 * 같은 패턴). 각 reader 의 **정확한** 반환 타입을 그대로 살려 둔다(별칭으로 뭉개지 않는다) —
 * `EntityForTable<K>` 가 이 타입으로 `readRemoteRow` 의 반환을 테이블별로 좁힌다.
 */
const READERS = {
  todos: readTodo,
  categories: readCategory,
  focusSessions: readFocusSession,
  settings: readSettings,
  ddays: readDday,
  diaryEntries: readDiaryEntry,
  routines: readRoutine,
} satisfies Record<SyncTable, (value: unknown, path: string) => Meta>;

/** 테이블 이름 → 그 reader 의 반환 타입. `EntityOf<K>`(`src/repositories/sync-repository.ts`)와
 * 같은 목적을 이 파일 안에서 자급한다 — domain 은 repositories 를 import 할 수 없다. */
export type EntityForTable<K extends SyncTable> = ReturnType<(typeof READERS)[K]>;

export type RemoteRowResult<K extends SyncTable> =
  { ok: true; entity: Persistable<EntityForTable<K>> } | { ok: false; reason: 'invalid' };

/**
 * 원격 로우 한 건을 검증한다. 형식 오류는 그 로우만 `invalid` 로 돌아오고(§②-3 "그 로우만
 * invalid"), 호출부는 나머지 로우 처리를 계속한다 — `BackupShapeError` 가 아닌 예외(프로그래밍
 * 오류)는 그대로 던진다.
 *
 * `id` 는 `PulledRow.id`(wire.ts, 응답 봉투의 id) — 로우 본문(`value`) 의 `entity.id` 와 **대조**한다.
 * 대조 없이 본문만 검증하면 서버가 응답 봉투의 id 와 다른 본문을 실어 보내도(또는 전송 버그로 둘이
 * 어긋나도) `ok:true` 가 나 저장 계층이 엉뚱한 id 로 upsert 할 수 있었다 — 실측: 본문의 `id` 를 다른
 * UUID 로 바꿔도 이전 시그니처(`readRemoteRow(tbl, value)`)는 `ok:true` 를 돌려줬다.
 */
export function readRemoteRow<K extends SyncTable>(
  tbl: K,
  id: string,
  value: unknown,
): RemoteRowResult<K> {
  try {
    // `READERS[tbl]` 는 `tbl: K` 가 제네릭이라 TS 가 반환 타입을 `EntityForTable<K>` 로 좁히지
    // 못하고 전체 유니온으로 넓힌다 — 함수 타입(브랜드 아님)으로만 좁혀 호출한다. `adopt()` 가 이
    // 좁혀진 타입을 그대로 받아 `Persistable<EntityForTable<K>>` 를 만드므로 그 뒤로는 캐스팅이
    // 없다(ADR-0007 `as Persistable<…>` 금지는 이 함수 시그니처 좁히기에는 적용되지 않는다).
    const reader = READERS[tbl] as (value: unknown, path: string) => EntityForTable<K>;
    const entity = reader(value, tbl);
    if (entity.id !== id) {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: true, entity: adopt(entity) };
  } catch (error) {
    if (isBackupShapeError(error)) {
      return { ok: false, reason: 'invalid' };
    }
    throw error;
  }
}
