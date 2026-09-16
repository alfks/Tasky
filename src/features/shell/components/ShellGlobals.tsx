'use client';

// 앱 전체에서 **한 번씩만** 서는 레이어 (app-shell.md R8 · shortcuts R1 · pwa.md R4·R6~R8).
//
// 한곳에 모아 둔 이유: 셋 다 "두 번 마운트되면 조용히 망가지는" 것들이다. 단축키는 중복 등록으로,
// 토스트 뷰포트는 라이브 영역이 둘이 되어, PWA 알림은 서비스워커 배선이 두 벌 걸려서. 셸의 어느
// 가지에 흩어 두면 화면 상태에 따라 하나가 사라지거나 둘이 될 수 있어 한 줄로 묶었다.
import { CommandLayer } from '@/features/command';
import { PwaNotices } from '@/features/pwa';
import { ShellToasts } from '@/features/shell/components/ShellToasts';
import { useTimerRuntime } from '@/features/timer';

type ShellGlobalsProps = {
  /** 저장 공간 배너의 [백업하기]. */
  onBackup: () => void;
};

export function ShellGlobals({ onBackup }: ShellGlobalsProps) {
  // 타이머 런타임(1초 틱 + 적재)을 셸 수명에 건다. 헤더 칩만 걸고 있으면 저장소 실패 카드처럼
  // 헤더가 통째로 사라지는 화면에서 **실행 중 세션의 시계가 그 순간 멈춘다**. 참조 수 방식이라
  // 칩·패널과 함께 걸어도 인터벌은 하나다(timer 핸드오프 decision 3).
  useTimerRuntime();

  return (
    <>
      {/*
        **여기서 스태킹 컨텍스트를 만든다.** `PwaNotices` 의 저장 공간 배너는 포털이 아니라 셸 트리
        안의 `position: fixed; z-index: var(--z-toast)`(40) 요소라, 그대로 두면 드로어·요약
        오버레이(`--z-modal` 30)보다 **위**에 그려진다. 400px 드로어에서 제목과 ✕ 버튼이 배너에
        완전히 가렸다(리뷰 실측: 배너 16~384×16~84, ✕ 가 267,37).

        `position: relative` + `z-index` 를 주면 그 안의 z-index 가 이 컨텍스트 안으로 갇히므로
        배너는 본문 위·모달 아래에 앉는다. 배너 자체는 크기가 0 인 래퍼의 자손이지만 `fixed` 라
        뷰포트 기준으로 그대로 그려지고(조상에 transform·overflow 가 없다) 위치는 변하지 않는다.

        **토스트와 도움말은 이 컨텍스트 밖이다** — 둘 다 `document.body` 로 포털되므로 갇히지 않고
        원래 z-index(토스트 40)를 유지한다. 모달 위에 떠야 하는 것은 그대로 뜬다.
      */}
      <div className="relative z-[var(--z-popover)]">
        <PwaNotices onBackup={onBackup} />
      </div>
      {/* 팔레트(T-19)는 아직 없다 — `palette` 를 주지 않으면 `Mod+K` 는 상태만 바꾼다. */}
      <CommandLayer />
      <ShellToasts />
    </>
  );
}
