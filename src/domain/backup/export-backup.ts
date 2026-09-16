// 내보내기 (backup.md R1·R2). `DatasetRepository.readAll()` 스냅샷 하나에서 파일 내용을 만드는 순수 함수다.
import {
  BACKUP_APP,
  BACKUP_JSON_INDENT,
  BACKUP_SCHEMA_VERSION,
  type BackupDocument,
} from '@/domain/backup/backup-document';
import type { DatasetSnapshot } from '@/domain/dataset';
import { isTombstone } from '@/domain/meta';

/** 화면이 보여주는 "카테고리 4개 · 할 일 312개" (§2). 툼스톤은 세지 않는다. */
export type BackupCounts = { categories: number; todos: number };

/**
 * 파일에 담을 문서를 만든다 (R2).
 *
 * - `todos`: 툼스톤 제외.
 * - `focusSessions`: 그대로. 세션은 삭제하지 않으므로(timer R13) 거를 것이 없고, 거르면 왕복 동일성만 잃는다.
 * - `categories`: 삭제되지 않은 것 **+ 남은 투두·세션이 가리키는 툼스톤**. 삭제된 카테고리의 이름·색이
 *   있어야 그 카테고리를 가리키던 완료 투두가 "삭제됨" 그룹에 그대로 뜬다(category R14·R17).
 *   툼스톤을 읽을 수 있는 경로가 `readAll()` 뿐인 이유이기도 하다(ADR-0009 규칙 4).
 */
export function buildBackupDocument(snapshot: DatasetSnapshot, exportedAt: string): BackupDocument {
  const todos = snapshot.todos.filter((todo) => !isTombstone(todo));
  const focusSessions = [...snapshot.focusSessions];
  const referenced = new Set<string>(todos.map((todo) => todo.categoryId));
  for (const session of focusSessions) {
    if (session.categoryId !== undefined) {
      referenced.add(session.categoryId);
    }
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
  };
}
