import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PwaNotices } from '@/features/pwa/components/PwaNotices';
import { usePwaStore } from '@/features/pwa/store/pwa-store';

import { pushOverlayLayer } from '@/components/ui/overlay-stack';

const applyUpdate = vi.fn();
const dismissStorageNotice = vi.fn();

// 수명주기 배선(서비스워커 등록·persist)은 이 테스트의 대상이 아니다 — 여기서는 "무엇이 보이고
// 무엇이 눌리는가" 만 본다. 배선 자체는 usePwaLifecycle.test.tsx 가 검증한다.
vi.mock('@/features/pwa/hooks/usePwaLifecycle', () => ({
  usePwaLifecycle: () => ({ applyUpdate, dismissStorageNotice }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  applyUpdate.mockClear();
  dismissStorageNotice.mockClear();
  usePwaStore.setState({
    update: 'idle',
    isUpdateDismissed: false,
    persist: 'unknown',
    estimate: null,
    isStorageNoticeDismissed: false,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

function setStage(stage: 'waiting' | 'activated') {
  act(() => {
    usePwaStore.getState().setUpdateStage(stage);
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('업데이트 토스트 (R4)', () => {
  it('새 버전이 없으면 뜨지 않는다', () => {
    render(<PwaNotices />);
    expect(screen.queryByText('새 버전이 준비됐어요')).not.toBeInTheDocument();
  });

  it('대기 중인 워커가 있으면 상주 status 영역 안에 뜬다', () => {
    render(<PwaNotices />);
    setStage('waiting');
    const toast = screen.getByText('새 버전이 준비됐어요');
    expect(screen.getByRole('status')).toContainElement(toast);
  });

  it('[새로고침] 은 button 이고 누르면 적용을 부른다', () => {
    render(<PwaNotices />);
    setStage('waiting');
    const button = screen.getByRole('button', { name: '새로고침' });
    expect(button.tagName).toBe('BUTTON');
    fireEvent.click(button);
    expect(applyUpdate).toHaveBeenCalledTimes(1);
  });

  it('자동으로 닫히지 않는다', () => {
    render(<PwaNotices />);
    setStage('waiting');
    advance(60_000);
    expect(screen.getByText('새 버전이 준비됐어요')).toBeInTheDocument();
  });

  it('편집 패널이 열려 있는 동안에는 미루고, 닫히면 띄운다', () => {
    const pop = pushOverlayLayer({ contains: () => false });
    render(<PwaNotices />);
    setStage('waiting');
    expect(screen.queryByText('새 버전이 준비됐어요')).not.toBeInTheDocument();
    advance(500);
    expect(screen.queryByText('새 버전이 준비됐어요')).not.toBeInTheDocument();
    pop();
    advance(500);
    expect(screen.getByText('새 버전이 준비됐어요')).toBeInTheDocument();
  });

  it('다른 탭이 적용한 경우에도 같은 알림을 띄운다', () => {
    render(<PwaNotices />);
    setStage('activated');
    expect(screen.getByText('새 버전이 준비됐어요')).toBeInTheDocument();
  });
});

describe('저장 공간 배너 (R6)', () => {
  function denyPersist() {
    act(() => {
      usePwaStore.getState().setPersistState('denied');
    });
  }

  it('alert 영역은 배너가 없을 때도 DOM 에 있다(나중에 삽입하면 낭독되지 않는다)', () => {
    render(<PwaNotices />);
    expect(screen.getByRole('alert', { name: '저장 공간 알림' })).toBeEmptyDOMElement();
  });

  it('지속성이 거부되면 배너가 alert 영역에 들어간다', () => {
    render(<PwaNotices />);
    denyPersist();
    const banner = screen.getByText(/저장 공간을 보장하지 않아요/);
    expect(screen.getByRole('alert', { name: '저장 공간 알림' })).toContainElement(banner);
  });

  it('✕ 는 이름 있는 버튼이고 누르면 닫기를 부른다', () => {
    render(<PwaNotices />);
    denyPersist();
    fireEvent.click(screen.getByRole('button', { name: '저장 공간 알림 닫기' }));
    expect(dismissStorageNotice).toHaveBeenCalledTimes(1);
  });

  it('닫은 뒤에는 뜨지 않는다', () => {
    render(<PwaNotices />);
    denyPersist();
    act(() => {
      usePwaStore.getState().dismissStorageNotice();
    });
    expect(screen.queryByText(/저장 공간을 보장하지 않아요/)).not.toBeInTheDocument();
  });

  it('[백업하기] 는 백업 화면이 붙기 전에는 그리지 않는다', () => {
    const onBackup = vi.fn();
    const { rerender } = render(<PwaNotices />);
    denyPersist();
    expect(screen.queryByRole('button', { name: '백업하기' })).not.toBeInTheDocument();
    rerender(<PwaNotices onBackup={onBackup} />);
    fireEvent.click(screen.getByRole('button', { name: '백업하기' }));
    expect(onBackup).toHaveBeenCalledTimes(1);
  });
});
