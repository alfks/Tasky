import { beforeEach, describe, expect, it } from 'vitest';

import { useReportsStore } from '@/features/reports/store/reports-store';

const INITIAL = useReportsStore.getState();

beforeEach(() => {
  useReportsStore.setState(INITIAL, true);
});

describe('useReportsStore', () => {
  it('기본은 닫혀 있고 기간은 지난 7일이다', () => {
    const state = useReportsStore.getState();
    expect(state.open).toBe(false);
    expect(state.preset).toBe('last7');
    expect(state.customRange).toBeNull();
  });

  it('openReports·closeReports 가 open 을 켜고 끈다', () => {
    useReportsStore.getState().openReports();
    expect(useReportsStore.getState().open).toBe(true);

    useReportsStore.getState().closeReports();
    expect(useReportsStore.getState().open).toBe(false);
  });

  it('openReports 는 호출 시점의 포커스 요소를 opener 로 잡아 둔다(Dialog.openerRef 와 같은 규약)', () => {
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();

    useReportsStore.getState().openReports();

    expect(useReportsStore.getState().opener).toBe(button);
    button.remove();
  });

  it('포커스가 body 뿐이면 opener 는 null 이다', () => {
    (document.activeElement as HTMLElement | null)?.blur();

    useReportsStore.getState().openReports();

    expect(useReportsStore.getState().opener).toBeNull();
  });

  it('setPreset 은 preset 만 바꾼다', () => {
    useReportsStore.getState().setPreset('thisYear');
    expect(useReportsStore.getState().preset).toBe('thisYear');
    expect(useReportsStore.getState().customRange).toBeNull();
  });

  it('setCustomRange 는 preset 을 custom 으로 바꾸고 범위를 저장한다', () => {
    useReportsStore.getState().setCustomRange('2026-01-01', '2026-01-31');
    const state = useReportsStore.getState();
    expect(state.preset).toBe('custom');
    expect(state.customRange).toEqual({ from: '2026-01-01', to: '2026-01-31' });
  });
});
