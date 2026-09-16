import { describe, expect, it } from 'vitest';

import {
  BACKUP_MAX_BYTES,
  BACKUP_SCHEMA_VERSION,
  backupIssueMessage,
} from '@/domain/backup/backup-document';

import { DB_VERSION } from '@/infra/indexeddb/db';

describe('백업 문서 형식', () => {
  // 레이어 경계상 domain 은 infra 를 import 할 수 없어 상수를 공유할 수 없다(ARCHITECTURE §1).
  // 이 대조가 두 값이 갈라진 채 머지되는 것을 막는 유일한 장치다 (TECH_PLAN §5 규칙 6).
  it('schemaVersion 은 저장소 스키마 버전과 같다 (R3)', () => {
    expect(BACKUP_SCHEMA_VERSION).toBe(DB_VERSION);
  });

  it('최대 파일 크기는 20MB 다 (R9)', () => {
    expect(BACKUP_MAX_BYTES).toBe(20 * 1024 * 1024);
  });

  describe('오류 문구 (R8)', () => {
    it.each([
      ['NOT_JSON' as const, 'JSON 파일이 아니에요'],
      ['NOT_TASKY_FILE' as const, 'Tasky 백업 파일이 아니에요'],
      ['FUTURE_VERSION' as const, '더 새로운 버전의 Tasky에서 만든 파일이에요'],
      ['TOO_LARGE' as const, '20MB 이하 파일만 가져올 수 있어요'],
    ])('%s → %s', (code, message) => {
      expect(backupIssueMessage({ code })).toBe(message);
    });

    it('검증 실패는 첫 오류 경로를 괄호로 붙인다', () => {
      expect(backupIssueMessage({ code: 'SHAPE_INVALID', path: 'todos[12].title' })).toBe(
        '파일 내용이 올바르지 않아요 (todos[12].title)',
      );
    });

    it('경로가 없으면 괄호도 없다', () => {
      expect(backupIssueMessage({ code: 'SHAPE_INVALID' })).toBe('파일 내용이 올바르지 않아요');
    });
  });
});
