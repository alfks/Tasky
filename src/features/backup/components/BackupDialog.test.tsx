import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { BackupDialog } from '@/features/backup/components/BackupDialog';
import { initialBackupState, type BackupSelection } from '@/features/backup/store/backup-state';
import { useBackupStore } from '@/features/backup/store/backup-store';

const selection: BackupSelection = {
  name: 'tasky-backup-2026-09-01.json',
  document: {
    app: 'tasky',
    schemaVersion: 2,
    exportedAt: '2026-09-01T00:00:00.000Z',
    settings: {
      id: 'default',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
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

function openWith(over: Partial<typeof initialBackupState> = {}) {
  useBackupStore.setState({
    ...initialBackupState,
    open: true,
    current: { categories: 4, todos: 312, hasOtherData: false },
    refreshedAt: '2026-09-15T09:00:00.000Z',
    ...over,
  });
  return render(<BackupDialog />);
}

beforeEach(() => {
  useBackupStore.setState(initialBackupState);
});

describe('BackupDialog — 구조 (§2)', () => {
  it('제목과 두 절을 갖는다', () => {
    openWith();
    expect(screen.getByRole('dialog')).toHaveAccessibleName('백업/복원');
    expect(screen.getByRole('heading', { name: '내보내기' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '가져오기' })).toBeInTheDocument();
  });

  it('현재 개수와 마지막 백업 시각을 보여준다', () => {
    openWith({ lastBackupAt: '2026-09-01T00:00:00.000Z', confirmation: 'confirmed' });
    expect(screen.getByText('카테고리 4개 · 할 일 312개')).toBeInTheDocument();
    expect(screen.getByText(/마지막 백업: 2026-09-01 \(14일 전\)/)).toBeInTheDocument();
  });

  // "백업함" 과 "백업을 시도했어요" 는 다른 사실이다 — 확인 못 한 기록으로 안심시키지 않는다(R14).
  it('저장을 확인하지 못한 기록은 "시도" 로 적는다 (R14)', () => {
    openWith({ lastBackupAt: '2026-09-01T00:00:00.000Z', confirmation: 'unconfirmed' });
    expect(
      screen.getByText(/백업을 시도했어요\(저장 확인 안 됨\): 2026-09-01 \(14일 전\)/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^마지막 백업: 2026-09-01/)).toBeNull();
  });

  it('백업한 적이 없으면 그렇게 적는다', () => {
    openWith();
    expect(screen.getByText('마지막 백업: 없음')).toBeInTheDocument();
  });

  it('데이터가 없으면 내보내기 버튼이 꺼지고 빈 상태 문구가 나온다', () => {
    openWith({ current: { categories: 0, todos: 0, hasOtherData: false } });
    expect(screen.getByText('아직 내보낼 데이터가 없어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'JSON 내보내기' })).toBeDisabled();
  });

  // 리뷰 #108 Major 3: D-day·다이어리만 있어도(카테고리·할 일 0개) 내보내기를 막지 않는다.
  it('카테고리·할 일이 0개라도 그 밖의 데이터가 있으면 내보내기 버튼이 켜진다', () => {
    openWith({ current: { categories: 0, todos: 0, hasOtherData: true } });
    expect(screen.getByText('카테고리·할 일은 없지만 그 밖의 데이터가 있어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'JSON 내보내기' })).toBeEnabled();
  });

  it('파일을 고르면 그 파일이 담고 있는 개수를 보여준다', () => {
    openWith({ selection, fileName: selection.name });
    expect(screen.getByText('파일에 카테고리 4개 · 할 일 312개가 있어요')).toBeInTheDocument();
    expect(screen.getByText(selection.name)).toBeInTheDocument();
  });
});

describe('BackupDialog — 접근성 (§5)', () => {
  it('파일 선택은 진짜 input[type=file] 이고 이름이 붙어 있다', () => {
    openWith();
    const input = screen.getByLabelText('백업 파일 선택');
    expect(input).toHaveAttribute('type', 'file');
  });

  it('모드는 radiogroup 이다', () => {
    openWith();
    const group = screen.getByRole('radiogroup', { name: '가져오기 방식' });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('형식 오류는 role=alert 로 알린다 (R8)', () => {
    openWith({ issue: { code: 'SHAPE_INVALID', path: 'todos[12].title' } });
    expect(screen.getByRole('alert')).toHaveTextContent(
      '파일 내용이 올바르지 않아요 (todos[12].title)',
    );
  });

  it('진행 중에는 aria-busy 가 붙는다', () => {
    openWith({ phase: 'importing', selection });
    expect(screen.getByRole('dialog').querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('진행 중에는 취소 버튼이 꺼진다 (닫기 불가)', () => {
    openWith({ phase: 'importing', selection });
    expect(screen.getByRole('button', { name: '취소' })).toBeDisabled();
  });
});

describe('BackupDialog — 교체 확인 (R7)', () => {
  it('병합 모드에는 확인 체크박스가 없다', () => {
    openWith({ selection });
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('교체 모드에서는 무엇을 잃는지 숫자로 보여준다', async () => {
    const user = userEvent.setup();
    openWith({ selection });
    await user.click(screen.getByRole('radio', { name: /교체/ }));
    expect(screen.getByText('지금 있는 카테고리 4개 · 할 일 312개가 사라져요')).toBeInTheDocument();
  });

  it('확인 체크가 없으면 [가져오기] 에 aria-disabled 와 이유가 붙는다', async () => {
    const user = userEvent.setup();
    openWith({ selection });
    await user.click(screen.getByRole('radio', { name: /교체/ }));

    const submit = screen.getByRole('button', { name: '가져오기' });
    expect(submit).toHaveAttribute('aria-disabled', 'true');
    expect(submit).toHaveAttribute('title', '확인 체크가 필요해요');
  });

  it('키보드로 교체 모드를 고르고 확인 체크까지 할 수 있다', async () => {
    const user = userEvent.setup();
    openWith({ selection });

    await user.click(screen.getByRole('radio', { name: /병합/ }));
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: /교체/ })).toBeChecked();

    const checkbox = screen.getByRole('checkbox');
    checkbox.focus();
    await user.keyboard(' ');
    expect(useBackupStore.getState().acknowledged).toBe(true);
    expect(screen.getByRole('button', { name: '가져오기' })).toHaveAttribute(
      'aria-disabled',
      'false',
    );
  });

  it('모드를 되돌리면 확인 체크가 풀린다', async () => {
    const user = userEvent.setup();
    openWith({ selection, mode: 'replace', acknowledged: true });
    await user.click(screen.getByRole('radio', { name: /병합/ }));
    expect(useBackupStore.getState().acknowledged).toBe(false);
  });
});
