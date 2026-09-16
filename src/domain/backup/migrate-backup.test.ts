import { describe, expect, it } from 'vitest';

import { BACKUP_SCHEMA_VERSION } from '@/domain/backup/backup-document';
import { migrateBackup } from '@/domain/backup/migrate-backup';
import { isBackupShapeError } from '@/domain/backup/shape';

describe('migrateBackup (R3)', () => {
  it('현재 버전은 그대로 돌려준다', () => {
    const body = { todos: [], focusSessions: [{ id: 'x' }] };
    expect(migrateBackup(body, BACKUP_SCHEMA_VERSION)).toBe(body);
  });

  it('v1 → v2 는 focusSessions 를 빈 배열로 더한다 (ADR-0011)', () => {
    const migrated = migrateBackup({ todos: [], categories: [] }, 1);
    expect(migrated['focusSessions']).toEqual([]);
    expect(migrated['todos']).toEqual([]);
  });

  it('v1 파일에 이미 focusSessions 가 있으면 덮어쓰지 않는다', () => {
    const sessions = [{ id: 'keep' }];
    expect(migrateBackup({ focusSessions: sessions }, 1)['focusSessions']).toBe(sessions);
  });

  it('원본 객체를 변형하지 않는다 (순수 함수)', () => {
    const body: Record<string, unknown> = { todos: [] };
    migrateBackup(body, 1);
    expect(body).not.toHaveProperty('focusSessions');
  });

  it('모양이 이상한 값은 고치지 않고 통과시킨다 — 판정은 검증이 한다', () => {
    const migrated = migrateBackup({ todos: 'not-an-array' }, 1);
    expect(migrated['todos']).toBe('not-an-array');
  });

  it('변환 단계가 없는 버전은 schemaVersion 형식 오류다', () => {
    // 0 부터 시작하는 체인은 없다 — 조용히 통과시키면 검증되지 않은 옛 파일이 들어온다.
    try {
      migrateBackup({}, 0);
      expect.unreachable('던져야 한다');
    } catch (error) {
      expect(isBackupShapeError(error)).toBe(true);
      if (isBackupShapeError(error)) {
        expect(error.path).toBe('schemaVersion');
      }
    }
  });
});
