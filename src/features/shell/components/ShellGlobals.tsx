'use client';

// 앱 전체에서 **한 번씩만** 서는 레이어 (app-shell.md R8 · shortcuts R1 · pwa.md R4·R6~R8).
//
// 한곳에 모아 둔 이유: 셋 다 "두 번 마운트되면 조용히 망가지는" 것들이다. 단축키는 중복 등록으로,
// 토스트 뷰포트는 라이브 영역이 둘이 되어, PWA 알림은 서비스워커 배선이 두 벌 걸려서. 셸의 어느
// 가지에 흩어 두면 화면 상태에 따라 하나가 사라지거나 둘이 될 수 있어 한 줄로 묶었다.
import { CommandLayer } from '@/features/command';
import { PwaNotices } from '@/features/pwa';
import { ShellToasts } from '@/features/shell/components/ShellToasts';

type ShellGlobalsProps = {
  /** 저장 공간 배너의 [백업하기]. */
  onBackup: () => void;
};

export function ShellGlobals({ onBackup }: ShellGlobalsProps) {
  return (
    <>
      {/* 팔레트(T-19)는 아직 없다 — `palette` 를 주지 않으면 `Mod+K` 는 상태만 바꾼다. */}
      <CommandLayer />
      <PwaNotices onBackup={onBackup} />
      <ShellToasts />
    </>
  );
}
