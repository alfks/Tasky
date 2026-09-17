'use client';

// 백업 명령 등록 (shortcuts R7 "백업/복원 열기"). 의존을 뒤집어 `backup → command` 한 방향으로만
// 두는 이유는 `todo/hooks/useTodoCommands.ts` 머리 주석과 같다.
//
// **마운트 스택을 쓰는 이유는 `category/hooks/useCategoryCommands.ts` 와 같다** — `BackupLauncher`
// 도 `ShellSidebar` 안에 있어 폭이 넓어지는 한 프레임 동안 컬럼과 드로어에 둘 마운트된다.
//
// **등록의 수명 = `BackupLauncher` 의 수명이어야 한다.** `openDialog` 는 전역 스토어 액션이지만
// 대화상자를 실제로 그리는 것은 이 컴포넌트다(지연 로드 `<BackupDialog/>`). 런처가 없는 화면에서
// 명령만 남으면 상태만 `open: true` 가 되고 **아무것도 뜨지 않는다**.
//
// R7 의 "백업 내보내기" 를 **별도 명령으로 두지 않았다**: `exportBackup()` 은 다이얼로그가 여는
// 경로에서 `refresh()` 로 채우는 `current` 를 전제하고(`canExport`), 결과도 다이얼로그가 그리는
// `exportNote`(저장 확인 불가)·`error` 로만 말한다. 팔레트에서 곧장 부르면 "실행됐나?" 만 남는다.
// 대신 '내보내기' 를 이 명령의 키워드에 넣어, 그 말로 찾으면 내보내기가 있는 화면이 열리게 했다.
import { useEffect, useRef } from 'react';

import { useCommandStore, type Command } from '@/features/command';

export const BACKUP_OPEN_COMMAND_ID = 'backup.open';

type Mount = { run: () => void };

/** 마운트된 `BackupLauncher` 들. 맨 뒤가 가장 나중에 뜬 것이다. */
const mounts: Mount[] = [];
let release: (() => void) | null = null;

export const backupOpenCommand: Command = {
  id: BACKUP_OPEN_COMMAND_ID,
  label: '백업/복원 열기',
  // 라벨에 없는 말만 싣는다 — `백업`·`복원` 은 라벨에 있어 부분 일치로 이미 걸린다(R8).
  keywords: ['내보내기', '가져오기', 'backup', 'restore', 'export', 'import'],
  run: () => mounts[mounts.length - 1]?.run(),
};

/** `BackupLauncher` 가 자기 다이얼로그를 여는 함수를 넘겨 부른다. */
export function useBackupCommands(openDialog: () => void): void {
  const latest = useRef(openDialog);
  latest.current = openDialog;

  useEffect(() => {
    const mount: Mount = { run: () => latest.current() };
    mounts.push(mount);
    if (mounts.length === 1) {
      release = useCommandStore.getState().registerCommands([backupOpenCommand]);
    }
    return () => {
      const at = mounts.indexOf(mount);
      if (at !== -1) mounts.splice(at, 1);
      if (mounts.length === 0) {
        release?.();
        release = null;
      }
    };
  }, []);
}
