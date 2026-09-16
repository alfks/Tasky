import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  readBackupConfirmation,
  rememberConfirmedExport,
} from '@/features/backup/store/backup-confirmation';

const AT = '2026-09-15T09:00:00.000Z';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('backup-confirmation (R10·R14)', () => {
  it('기본값은 "확인 못 함" 이다 — 표식이 없으면 절반 기간이 적용된다', () => {
    expect(readBackupConfirmation(AT)).toBe('unconfirmed');
  });

  it('백업한 적이 없으면 확인할 것도 없다', () => {
    expect(readBackupConfirmation(undefined)).toBe('unconfirmed');
  });

  it('그 내보내기를 관측했으면 "확인함" 이다', () => {
    rememberConfirmedExport(AT);
    expect(readBackupConfirmation(AT)).toBe('confirmed');
  });

  // 가져오기로 남의 `lastBackupAt` 이 들어오면 표식이 어긋난다 — 이 기기는 그 저장을 본 적이 없다.
  it('시각이 다르면 표식이 있어도 "확인 못 함" 이다', () => {
    rememberConfirmedExport(AT);
    expect(readBackupConfirmation('2026-01-01T00:00:00.000Z')).toBe('unconfirmed');
  });

  it('저장소가 막혀 있어도 던지지 않고 "확인 못 함" 으로 기운다 (사생활 보호 모드)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => rememberConfirmedExport(AT)).not.toThrow();
    expect(readBackupConfirmation(AT)).toBe('unconfirmed');
  });
});
