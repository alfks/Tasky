import { describe, expect, it } from 'vitest';

import { DomainError } from '@/domain/errors';

import {
  canExport,
  canImport,
  importBlockedReason,
  importErrorMessage,
  importResultMessage,
  initialBackupState,
  isEmptyDataset,
  issueMessage,
  NEEDS_ACKNOWLEDGE,
  type BackupSelection,
  type BackupState,
} from '@/features/backup/store/backup-state';

const selection: BackupSelection = {
  name: 'tasky-backup-2026-09-15.json',
  document: {
    app: 'tasky',
    schemaVersion: 2,
    exportedAt: '2026-09-15T00:00:00.000Z',
    settings: {
      id: 'default',
      createdAt: '',
      updatedAt: '',
      rev: 1,
      theme: 'system',
      accentColor: '#7CC6FF',
    },
    categories: [],
    todos: [],
    focusSessions: [],
    ddays: [],
    diaryEntries: [],
    routines: [],
  },
  counts: { categories: 4, todos: 312, hasOtherData: false },
};

const state = (over: Partial<BackupState> = {}): BackupState => ({
  ...initialBackupState,
  current: { categories: 2, todos: 5, hasOtherData: false },
  ...over,
});

describe('내보내기 가능 여부 (§2 빈 상태)', () => {
  it('데이터가 있으면 내보낼 수 있다', () => {
    expect(canExport(state())).toBe(true);
  });

  it('데이터가 0개면 내보낼 수 없다', () => {
    const empty = state({ current: { categories: 0, todos: 0, hasOtherData: false } });
    expect(isEmptyDataset(empty)).toBe(true);
    expect(canExport(empty)).toBe(false);
  });

  // 리뷰 #108 Major 3.
  it('카테고리·할 일이 0개라도 그 밖의 데이터(D-day·다이어리·루틴)가 있으면 빈 상태가 아니다', () => {
    const other = state({ current: { categories: 0, todos: 0, hasOtherData: true } });
    expect(isEmptyDataset(other)).toBe(false);
    expect(canExport(other)).toBe(true);
  });

  it('아직 읽지 못했으면 "없다" 로 보지 않는다', () => {
    expect(isEmptyDataset(state({ current: null }))).toBe(false);
    expect(canExport(state({ current: null }))).toBe(false);
  });

  it('진행 중에는 다시 누를 수 없다', () => {
    expect(canExport(state({ phase: 'exporting' }))).toBe(false);
  });

  // 리뷰 Major 1: 인증 경로(로그아웃·계정 삭제·계정 전환)는 빈 데이터셋에서도 내보내기가
  // 통과해야 한다 — 아니면 사용자가 로그아웃할 방법이 없다.
  it('allowEmpty 면 데이터가 0개여도 내보낼 수 있다', () => {
    const empty = state({ current: { categories: 0, todos: 0, hasOtherData: false } });
    expect(canExport(empty, { allowEmpty: true })).toBe(true);
  });

  it('allowEmpty 여도 진행 중이거나 아직 못 읽었으면 여전히 불가하다', () => {
    expect(canExport(state({ phase: 'exporting' }), { allowEmpty: true })).toBe(false);
    expect(canExport(state({ current: null }), { allowEmpty: true })).toBe(false);
  });
});

describe('가져오기 가능 여부 (R7)', () => {
  it('파일이 없으면 누를 수 없다', () => {
    expect(canImport(state())).toBe(false);
    expect(importBlockedReason(state())).toBeNull();
  });

  it('병합은 파일만 있으면 된다', () => {
    expect(canImport(state({ selection }))).toBe(true);
  });

  it('교체는 확인 체크가 있어야 한다', () => {
    const replacing = state({ selection, mode: 'replace' });
    expect(canImport(replacing)).toBe(false);
    expect(importBlockedReason(replacing)).toBe(NEEDS_ACKNOWLEDGE);
    expect(canImport({ ...replacing, acknowledged: true })).toBe(true);
    expect(importBlockedReason({ ...replacing, acknowledged: true })).toBeNull();
  });

  it('진행 중에는 누를 수 없다', () => {
    expect(canImport(state({ selection, phase: 'importing' }))).toBe(false);
  });
});

describe('문구', () => {
  it('결과 토스트는 파일 개수와 적용 결과를 함께 말한다 (R12)', () => {
    expect(
      importResultMessage({
        counts: { added: 20, updated: 3, kept: 289 },
        source: { categories: 4, todos: 312, hasOtherData: false },
      }),
    ).toBe('카테고리 4개, 할 일 312개를 가져왔어요 (추가 20 · 갱신 3 · 유지 289)');
  });

  it('형식 오류 문구는 경로를 포함한다 (R8)', () => {
    expect(issueMessage({ code: 'SHAPE_INVALID', path: 'todos[12].title' })).toBe(
      '파일 내용이 올바르지 않아요 (todos[12].title)',
    );
    expect(issueMessage(null)).toBeNull();
  });

  it('도메인 규칙 위반은 그 문구를, 그 밖의 실패는 "파일은 바뀌지 않았어요" 를 쓴다', () => {
    expect(importErrorMessage(new DomainError('META_FORMAT_INVALID'))).toBe(
      '파일 형식이 올바르지 않아요',
    );
    expect(importErrorMessage(new Error('boom'))).toBe('가져오지 못했어요. 파일은 바뀌지 않았어요');
  });
});
