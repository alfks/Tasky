// 원격(풀)로 받은 로우 검증 — `validate-rows.ts` 의 7개 reader 를 **그대로** 재사용한다
// (SYNC_DESIGN.md §①-1 "로우 검증(validate-rows.ts readers)·isTombstone 은 둘 다 같은 함수를 쓴다").
// 서버도 어차피 같은 화이트리스트로 걸러 저장했으므로(§②-3 "요청 로우는 validate-rows.ts 로 검증")
// 풀로 돌아오는 로우도 같은 규칙으로 다시 본다 — 왕복 양쪽에서 같은 문 하나를 쓰는 것이 핵심이다.
//
// **`adopt()` 는 여기서 부르지 않는다.** `src/domain/backup/AGENTS.md` 규칙 1 이 "adopt 호출처는
// plan-import.ts 하나로 모으고 늘리지 않는다"를 아직 규정하고 있고, 이를 `src/domain/sync/**` 로
// 넓히는 것은 SYNC_DESIGN.md §③-1 이 예정한 대로 ADR-0009 개정(ADR-0018, T-90)과 `eslint.config.mjs`
// 예외(T-91 원안)가 먼저 있어야 한다 — 둘 다 이 티켓 owns 밖이다. 대신 `validate-rows.ts` 의 각
// reader 가 내부에서 이미 `assertMeta`(→ `adopt` 를 호출해 검증하고 브랜드는 버림)로 형식을 전수
// 검증하므로, 여기서 다시 브랜딩하지 않아도 **형식 검증 자체는 이미 끝나 있다**. `Persistable<T>` 로
// 봉인하는 것(저장 직전의 브랜딩)은 실제로 IndexedDB 에 쓰는 계층(`SyncRepository.applyRemote`,
// T-92)의 몫으로 남긴다 — 그 계층은 자기 소유 파일에서 필요한 예외를 넣을 수 있다.
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
import type { Meta } from '@/domain/meta';
import type { SyncTable } from '@/domain/sync/wire';

type Reader = (value: unknown, path: string) => Meta;

/**
 * 테이블 → reader 전수 매핑. `satisfies Record<SyncTable, Reader>` 라 테이블이 늘면(`SyncTable` 이
 * 바뀌면) 이 객체가 그 키를 안 채운 순간 컴파일 에러가 난다(T-91 완료 조건과 동일한 패턴).
 */
const READERS = {
  todos: readTodo,
  categories: readCategory,
  focusSessions: readFocusSession,
  settings: readSettings,
  ddays: readDday,
  diaryEntries: readDiaryEntry,
  routines: readRoutine,
} satisfies Record<SyncTable, Reader>;

export type RemoteRowResult = { ok: true; entity: Meta } | { ok: false; reason: 'invalid' };

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
export function readRemoteRow(tbl: SyncTable, id: string, value: unknown): RemoteRowResult {
  try {
    const reader = READERS[tbl];
    const entity = reader(value, tbl);
    if (entity.id !== id) {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: true, entity };
  } catch (error) {
    if (isBackupShapeError(error)) {
      return { ok: false, reason: 'invalid' };
    }
    throw error;
  }
}
