// 통계 화면의 열림·기간 선택 상태 (stats.md R1). feature 당 스토어 1개 규칙 — 데이터 적재는
// `hooks/useReportsData.ts` 가 이 스토어를 읽어서 한다(스토어 자신은 저장소를 부르지 않는다).
import { create } from 'zustand';

import type { DateKey } from '@/domain/date/date-key';

import type { PeriodPreset } from '@/features/reports/lib/period';

export type ReportsState = {
  /** 화면이 열려 있는가(커맨드 팔레트 "통계 보기"가 켠다). */
  open: boolean;
  /**
   * 열기 직전 포커스였던 요소(`Dialog` 의 `openerRef`와 같은 규약). 닫힐 때 셸(`AppShell.tsx`)이
   * 여기로 포커스를 돌려보내고, 그 요소가 이미 DOM 에서 사라졌으면 본문 랜드마크로 대체한다.
   * 셸이 아니라 스토어에서 잡는 이유: 여는 시점(`openReports` 호출)에는 아직 `ShellMain` 이 그
   * 자리에 있어 `document.activeElement` 가 정확하지만, 그 뒤 리렌더로 `ShellMain` 이 통째로
   * 사라지면(`ReportsScreen` 으로 교체) 이미 늦다 — effect 안에서 잡으려 하면 대상이 이미 없다.
   */
  opener: HTMLElement | null;
  /** 지금 고른 기간 프리셋(R1). `custom` 이면 `customRange` 가 실제 범위다. */
  preset: PeriodPreset;
  /** `preset === 'custom'` 일 때의 실제 범위. 아직 고르지 않았으면 `null`. */
  customRange: { from: DateKey; to: DateKey } | null;
  openReports: () => void;
  closeReports: () => void;
  setPreset: (preset: Exclude<PeriodPreset, 'custom'>) => void;
  setCustomRange: (from: DateKey, to: DateKey) => void;
};

export const useReportsStore = create<ReportsState>((set) => ({
  open: false,
  opener: null,
  preset: 'last7',
  customRange: null,
  openReports: () => {
    const active = document.activeElement;
    // `document.body` 는 "아무것도 포커스되지 않음"과 같다 — opener 로 잡아 두면 닫을 때 body 로
    // 되돌리는 것과 같아 의미가 없다(Dialog 의 openerRef 도 같은 취급을 전제로 한다).
    const opener = active instanceof HTMLElement && active !== document.body ? active : null;
    set({ open: true, opener });
  },
  // `opener` 도 함께 비운다(review m8) — 안 비우면 화면을 닫은 뒤에도 스토어가 이미 DOM 에서 사라진
  // 요소를 계속 붙들고 있다(CLAUDE.md 의 스토어 누수 감사 항목과 같은 문제).
  closeReports: () => set({ open: false, opener: null }),
  setPreset: (preset) => set({ preset }),
  setCustomRange: (from, to) => set({ preset: 'custom', customRange: { from, to } }),
}));
