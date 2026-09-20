import { describe, expect, it } from 'vitest';

import { BACKUP_SCHEMA_VERSION } from '@/domain/backup/backup-document';
import { migrateBackup } from '@/domain/backup/migrate-backup';
import { isBackupShapeError } from '@/domain/backup/shape';
import { validateBackup } from '@/domain/backup/validate-backup';

import { makeCategory } from '@/test/fixtures/category';
import { FIXTURE_INSTANT } from '@/test/fixtures/deps';
import { makeFocusSession } from '@/test/fixtures/focus-session';
import { makeSettings } from '@/test/fixtures/settings';
import { makeTodo } from '@/test/fixtures/todo';

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

  it('v2 → v3 는 항등이다 (ADR-0016 — 새 세 테이블은 아직 백업 payload 밖)', () => {
    const body = { todos: [], categories: [], settings: [], focusSessions: [{ id: 'x' }] };
    expect(migrateBackup(body, 2)).toBe(body);
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

  /**
   * **회귀 고정 (리뷰 라운드 1 Major-4).** `ddays`·`diaryEntries`·`routines` 는 v3(ADR-0016) 에서
   * 테이블만 신설됐을 뿐 백업 payload 에는 아직 들어가지 않는다(T-86 범위, `backup-document.ts`
   * 머리주석) — 그래서 **지금 내보내는 v3 파일에는 이 세 배열이 아예 없다.** `readDocument`
   * (`validate-backup.ts`) 가 이 계약을 어기고 `readRows(body['ddays'], …)` 처럼 **있다고 가정**하는
   * 순간 `asArray(undefined, …)` 가 `SHAPE_INVALID` 로 던지고, 지금 사용자가 이미 내보낸 v3 파일이
   * 전부 가져오기를 거부당한다. 이 테스트는 그 계약을 고정한다 — T-86 이 세 배열을 실제로 읽게
   * 되면, 그 구현은 **`body['ddays'] ?? []`** 처럼 없는 값을 빈 배열로 받아야지, 있다고 가정하는
   * `readRows` 로 바로 넘기면 안 된다(마이그레이션 단계로는 고칠 수 없다 — `migrateV2ToV3` 는 항등
   * 함수이고, v2→v3 는 "새 테이블 셋 신설"일 뿐 "배열을 채워 넣는" 변환이 아니다).
   */
  it('v3 파일은 ddays·diaryEntries·routines 세 배열이 없을 수 있고, 그 파일도 읽혀야 한다 (ADR-0016)', () => {
    const v3WithoutNewTables = {
      app: 'tasky',
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: FIXTURE_INSTANT,
      settings: makeSettings(),
      categories: [makeCategory()],
      todos: [makeTodo()],
      focusSessions: [makeFocusSession({ status: 'completed' })],
      // ddays·diaryEntries·routines 를 **의도적으로** 넣지 않는다 — 지금 내보내기가 만드는 실제 모양.
    };

    const result = validateBackup(v3WithoutNewTables);

    expect(result.ok).toBe(true);
  });
});
