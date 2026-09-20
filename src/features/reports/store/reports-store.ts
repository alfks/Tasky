// 통계 화면의 열림·기간 선택 상태 (stats.md R1). feature 당 스토어 1개 규칙 — 데이터 적재는
// `hooks/useReportsData.ts` 가 이 스토어를 읽어서 한다(스토어 자신은 저장소를 부르지 않는다).
import { create } from 'zustand';

import type { DateKey } from '@/domain/date/date-key';

import type { PeriodPreset } from '@/features/reports/lib/period';

export type ReportsState = {
  /** 화면이 열려 있는가(커맨드 팔레트 "통계 보기"가 켠다). */
  open: boolean;
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
  preset: 'last7',
  customRange: null,
  openReports: () => set({ open: true }),
  closeReports: () => set({ open: false }),
  setPreset: (preset) => set({ preset }),
  setCustomRange: (from, to) => set({ preset: 'custom', customRange: { from, to } }),
}));
