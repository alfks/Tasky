// 백업 명령 등록 (shortcuts R7 "백업/복원 열기").
//
// 등록 목록만 재면 `run` 이 빈 함수여도 통과한다 — 그래서 `runCommand` 를 거쳐 **지연 로드되는
// 백업/복원 대화상자가 실제로 화면에 뜨는 것**까지 본다.
//
// 마지막 묶음은 `ShellSidebar` 가 컬럼과 드로어에 한 순간 둘 마운트되는 창을 재현한다
// (`useCategoryCommands.test.tsx` 와 같은 이유).
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { BackupLauncher } from '@/features/backup/components/BackupLauncher';
import {
  BACKUP_OPEN_COMMAND_ID,
  useBackupCommands,
} from '@/features/backup/hooks/useBackupCommands';
import { initialBackupState } from '@/features/backup/store/backup-state';
import { useBackupStore } from '@/features/backup/store/backup-store';
import { matchCommands, useCommandStore } from '@/features/command';

function commandIds(): string[] {
  return useCommandStore.getState().commands.map((command) => command.id);
}

beforeEach(() => {
  setRepositories(createMemoryRepositories());
  useCommandStore.setState({ commands: [], recentCommandIds: [] });
  useBackupStore.setState(initialBackupState);
});

describe('BackupLauncher 가 등록한다 (R7)', () => {
  it('팔레트에 `백업/복원 열기` 가 올라간다', async () => {
    render(<BackupLauncher />);

    await waitFor(() => expect(commandIds()).toContain(BACKUP_OPEN_COMMAND_ID));
    expect(useCommandStore.getState().commands.map((command) => command.label)).toEqual([
      '백업/복원 열기',
    ]);
  });

  it('한글 `내보내기` 로도 찾힌다 — R7 의 내보내기는 이 화면 안에 있다', async () => {
    render(<BackupLauncher />);
    await waitFor(() => expect(commandIds()).toContain(BACKUP_OPEN_COMMAND_ID));

    const hits = matchCommands(useCommandStore.getState().commands, '내보내기');

    expect(hits.map((command) => command.id)).toEqual([BACKUP_OPEN_COMMAND_ID]);
  });

  it('Enter 로 실행하면 백업/복원 대화상자가 **실제로** 뜬다', async () => {
    render(<BackupLauncher />);
    await waitFor(() => expect(commandIds()).toContain(BACKUP_OPEN_COMMAND_ID));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await useCommandStore.getState().runCommand(BACKUP_OPEN_COMMAND_ID);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '백업/복원' })).toBeInTheDocument(),
    );
  });

  it('런처가 사라지면 명령도 사라진다 — 상태만 열리고 아무것도 안 뜨는 일이 없게', async () => {
    const view = render(<BackupLauncher />);
    await waitFor(() => expect(commandIds()).toContain(BACKUP_OPEN_COMMAND_ID));

    view.unmount();

    expect(commandIds()).toEqual([]);
  });

  it('컬럼 + 드로어로 둘 마운트돼도 명령은 하나고 죽지 않는다', async () => {
    render(
      <>
        <BackupLauncher />
        <BackupLauncher />
      </>,
    );

    await waitFor(() => expect(commandIds()).toEqual([BACKUP_OPEN_COMMAND_ID]));

    await useCommandStore.getState().runCommand(BACKUP_OPEN_COMMAND_ID);

    // 열림은 전역 스토어 값이라 **두 런처가 각각 그린다** — 앱에서는 두 자리가 겹치는 순간에
    // 다이얼로그가 열려 있지 않아 눈에 띄지 않는다(이 PR 의 변경이 아니라 런처의 성질이다).
    // 여기서 지키는 것은 "명령이 하나이고 던지지 않는다" 와 "실행이 실제로 열림으로 이어진다" 다.
    expect(useBackupStore.getState().open).toBe(true);
    await waitFor(() => expect(screen.getAllByRole('dialog').length).toBeGreaterThan(0));
  });

  /** 어느 인스턴스가 여는지는 화면으로 가릴 수 없다(전역 스토어 + 포털) — 훅만 단독으로 건다. */
  function Probe({ tag, opened }: { tag: string; opened: string[] }) {
    useBackupCommands(() => opened.push(tag));
    return null;
  }

  it('나중에 뜬 쪽이 실행을 받고, 그쪽이 사라지면 남은 쪽이 이어받는다', async () => {
    const opened: string[] = [];
    function Pair({ both }: { both: boolean }) {
      return (
        <>
          <Probe tag="column" opened={opened} />
          {both ? <Probe tag="drawer" opened={opened} /> : null}
        </>
      );
    }
    const view = render(<Pair both />);
    await waitFor(() => expect(commandIds()).toEqual([BACKUP_OPEN_COMMAND_ID]));

    await useCommandStore.getState().runCommand(BACKUP_OPEN_COMMAND_ID);
    view.rerender(<Pair both={false} />);
    await useCommandStore.getState().runCommand(BACKUP_OPEN_COMMAND_ID);

    expect(opened).toEqual(['drawer', 'column']);
  });
});
