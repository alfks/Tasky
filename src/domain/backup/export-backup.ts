// 내보내기 (backup.md R1·R2). `DatasetRepository.readAll()` 스냅샷 하나에서 파일 내용을 만드는 순수 함수다.
import {
  BACKUP_APP,
  BACKUP_JSON_INDENT,
  BACKUP_SCHEMA_VERSION,
  type BackupDocument,
} from '@/domain/backup/backup-document';
import type { DatasetSnapshot } from '@/domain/dataset';
import { isTombstone } from '@/domain/meta';

/**
 * 화면이 보여주는 "카테고리 4개 · 할 일 312개" (§2) + 그 밖의 데이터(D-day·다이어리·루틴) 존재 여부.
 * 툼스톤은 세지 않는다.
 *
 * `hasOtherData`(리뷰 #108 Major 3): 세 테이블이 백업 payload 에 들어간 뒤(T-86)로,
 * 카테고리·할 일이 0개라도 파일이 빈 것은 아니다 — 이 필드가 없으면 D-day·다이어리만 있는 사용자의
 * "내보내기" 버튼이 `isEmptyDataset` 판정에서 막혀, 백업을 고치는 이 티켓 자체가 그 데이터를
 * 내보낼 수 없게 남긴다.
 */
export type BackupCounts = { categories: number; todos: number; hasOtherData: boolean };

/**
 * 파일에 담을 문서를 만든다 (R2).
 *
 * - `todos`: 툼스톤 제외.
 * - `focusSessions`: 그대로. 세션은 삭제하지 않으므로(timer R13) 거를 것이 없고, 거르면 왕복 동일성만 잃는다.
 * - `categories`: 삭제되지 않은 것 **+ 남은 투두·세션·루틴이 가리키는 툼스톤**. 삭제된 카테고리의
 *   이름·색이 있어야 그 카테고리를 가리키던 완료 투두가 "삭제됨" 그룹에 그대로 뜬다(category
 *   R14·R17). 툼스톤을 읽을 수 있는 경로가 `readAll()` 뿐인 이유이기도 하다(ADR-0009 규칙 4).
 * - `ddays`·`diaryEntries`(T-86): `todos` 와 같은 이유로 툼스톤 제외 — 다른 배열이 그 id 를
 *   가리키는 일이 없으니 남겨 둘 이유가 없다(category 와 다른 점).
 * - `routines`(T-86): **삭제되지 않은 것 + 남은 투두가 `routineId` 로 가리키는 툼스톤.** `categories`
 *   와 같은 이유다 — routine.md R10 "삭제된 루틴이 만든 과거 인스턴스의 `Todo.routineId` 연결은
 *   손대지 않는다(기록 보존)" 가 백업에도 이어지려면, 그 루틴이 삭제된 뒤라도 레코드 자체(제목 등)가
 *   파일에 남아야 한다. 남겨도 안전하다 — 지연 생성(`RoutineRepository.list()`)은 이미 툼스톤을
 *   걸러서 읽으므로 복원된 tombstone 이 다시 인스턴스를 만들지 않는다.
 */
export function buildBackupDocument(snapshot: DatasetSnapshot, exportedAt: string): BackupDocument {
  const todos = snapshot.todos.filter((todo) => !isTombstone(todo));
  const focusSessions = [...snapshot.focusSessions];
  const ddays = snapshot.ddays.filter((dday) => !isTombstone(dday));
  const diaryEntries = snapshot.diaryEntries.filter((entry) => !isTombstone(entry));

  const routineIds = new Set<string>(
    todos.flatMap((todo) => (todo.routineId === undefined ? [] : [todo.routineId])),
  );
  const routines = snapshot.routines.filter(
    (routine) => !isTombstone(routine) || routineIds.has(routine.id),
  );

  const referenced = new Set<string>(todos.map((todo) => todo.categoryId));
  for (const session of focusSessions) {
    if (session.categoryId !== undefined) {
      referenced.add(session.categoryId);
    }
  }
  for (const routine of routines) {
    referenced.add(routine.categoryId);
  }
  const categories = snapshot.categories.filter(
    (category) => !isTombstone(category) || referenced.has(category.id),
  );

  return {
    app: BACKUP_APP,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt,
    settings: snapshot.settings,
    categories,
    todos,
    focusSessions,
    ddays,
    diaryEntries,
    routines,
  };
}

/** 파일 본문 (R1: UTF-8, 들여쓰기 2칸). */
export function serializeBackup(document: BackupDocument): string {
  return JSON.stringify(document, null, BACKUP_JSON_INDENT);
}

/** 파일명 (R1). `dateKey` 는 **로컬** 날짜다 — 만드는 쪽(`lib/date.ts#todayKey`)이 로컬로 읽는다. */
export function backupFileName(dateKey: string): string {
  return `tasky-backup-${dateKey}.json`;
}

/** 다이얼로그 상단 요약과 "내보낼 데이터가 없어요" 판정에 쓰는 개수 (§2 빈 상태). */
export function backupCounts(snapshot: DatasetSnapshot): BackupCounts {
  return {
    categories: snapshot.categories.filter((category) => !isTombstone(category)).length,
    todos: snapshot.todos.filter((todo) => !isTombstone(todo)).length,
    hasOtherData:
      snapshot.ddays.some((dday) => !isTombstone(dday)) ||
      snapshot.diaryEntries.some((entry) => !isTombstone(entry)) ||
      snapshot.routines.some((routine) => !isTombstone(routine)),
  };
}
