import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PwaNotices } from '@/features/pwa/components/PwaNotices';
import { usePwaStore } from '@/features/pwa/store/pwa-store';

import { pushOverlayLayer } from '@/components/ui/overlay-stack';
import {
  ToastViewport,
  clearToasts,
  dismissToast,
  getToasts,
  pushToast,
  useToasts,
} from '@/components/ui/Toast';

/**
 * 전역 토스트 뷰포트. 앱에서는 셸이 한 번만 마운트한다(`ShellToasts`, app-shell R8) — 업데이트 알림은
 * T-30 부터 자기 뷰포트가 아니라 그 허브로 간다. 단독 테스트에서는 여기서 대신 세운다.
 */
function Notices(props: { onBackup?: () => void }) {
  return (
    <>
      <PwaNotices {...props} />
      <ToastViewport toasts={useToasts()} onClose={dismissToast} />
    </>
  );
}

const applyUpdate = vi.fn();
const dismissStorageNotice = vi.fn();

// 수명주기 배선(서비스워커 등록·persist)은 이 테스트의 대상이 아니다 — 여기서는 "무엇이 보이고
// 무엇이 눌리는가" 만 본다. 배선 자체는 usePwaLifecycle.test.tsx 가 검증한다.
vi.mock('@/features/pwa/hooks/usePwaLifecycle', () => ({
  usePwaLifecycle: () => ({ applyUpdate, dismissStorageNotice }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  clearToasts();
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

const DAY_MS = 24 * 60 * 60 * 1000;

describe('업데이트 토스트 (R4)', () => {
  it('새 버전이 없으면 뜨지 않는다', () => {
    render(<Notices />);
    expect(screen.queryByText('새 버전이 준비됐어요')).not.toBeInTheDocument();
  });

  it('대기 중인 워커가 있으면 상주 status 영역 안에 뜬다', () => {
    render(<Notices />);
    setStage('waiting');
    const toast = screen.getByText('새 버전이 준비됐어요');
    expect(screen.getByRole('status')).toContainElement(toast);
  });

  it('[새로고침] 은 button 이고 누르면 적용을 부른다', () => {
    render(<Notices />);
    setStage('waiting');
    const button = screen.getByRole('button', { name: '새로고침' });
    expect(button.tagName).toBe('BUTTON');
    fireEvent.click(button);
    expect(applyUpdate).toHaveBeenCalledTimes(1);
  });

  /*
   * "안 닫힌다" 를 **글자가 아직 보이는가** 로만 재면 아무것도 잡히지 않는다: 자동으로 닫혀도 바로
   * 아래의 "화면이 비면 다시 올린다"(R4 + R8)가 곧바로 되밀어 글자는 그대로 남는다(실측: 6초 유지로
   * 되돌려도 60초 뒤 글자가 있다). 그래서 **처음 올라온 그 토스트가 아직 그 자리인지** 를 잰다 —
   * 한 번이라도 닫혔다면 토스트가 갈린다(id 가 바뀌고 DOM 노드도 새로 난다 = 사용자에게는 깜빡임).
   */
  it('자동으로 닫히지 않는다 — 30일이 흘러도 처음 그 토스트 그대로다', () => {
    render(<Notices />);
    setStage('waiting');
    const toast = screen.getByText('새 버전이 준비됐어요');
    const [{ id }] = getToasts();

    advance(10_000); // 액션 있는 토스트의 기본 유지 시간(6초)을 넘긴다
    expect(toast).toBeInTheDocument();
    // 32비트 안쪽의 큰 수로 흉내낸 "유지"(예: 2_000_000_000 ≈ 23.1일)가 갈리는 지점.
    advance(30 * DAY_MS);
    expect(toast).toBeInTheDocument();
    expect(getToasts()[0]?.id).toBe(id);
  });

  it('편집 패널이 열려 있는 동안에는 미루고, 닫히면 띄운다', () => {
    const pop = pushOverlayLayer({ contains: () => false });
    render(<Notices />);
    setStage('waiting');
    expect(screen.queryByText('새 버전이 준비됐어요')).not.toBeInTheDocument();
    advance(500);
    expect(screen.queryByText('새 버전이 준비됐어요')).not.toBeInTheDocument();
    pop();
    advance(500);
    expect(screen.getByText('새 버전이 준비됐어요')).toBeInTheDocument();
  });

  // R4("자동으로 닫히지 않는다")와 app-shell R8("동시에 1개")이 부딪히는 자리다. 허브는 새 토스트가
  // 오면 오래된 것을 밀어내므로, 밀려난 뒤 화면이 비면 다시 올려야 알림이 세션 안에서 살아남는다.
  it('다른 토스트에 밀려나도 화면이 비면 다시 올라온다 (R4 + R8)', () => {
    render(<Notices />);
    setStage('waiting');
    expect(screen.getByText('새 버전이 준비됐어요')).toBeInTheDocument();

    act(() => {
      pushToast({ message: '삭제했어요' });
    });
    expect(screen.getByText('삭제했어요')).toBeInTheDocument();
    expect(screen.queryByText('새 버전이 준비됐어요')).not.toBeInTheDocument();

    // 3초(액션 없는 토스트)가 지나 화면이 비면 업데이트 알림이 되돌아온다.
    advance(3000);
    expect(screen.getByText('새 버전이 준비됐어요')).toBeInTheDocument();
  });

  it('다른 탭이 적용한 경우에도 같은 알림을 띄운다', () => {
    render(<Notices />);
    setStage('activated');
    expect(screen.getByText('새 버전이 준비됐어요')).toBeInTheDocument();
  });
});

/*
 * pwa.md §2 의 ✕. `Toast` 는 T-29 부터 ✕ 를 그리지만, 그것이 **`isUpdateDismissed` 로 이어지는지**
 * 는 여기 배선에 달려 있다. 배선이 없으면 ✕ 는 허브에서만 지우고 `show` 는 그대로라 바로 위의
 * "화면이 비면 다시 올린다"(R4 + R8)가 **다음 커밋에 곧바로 되민다** — 누른 티도 안 난다.
 * 그래서 아래는 "`dismissUpdate` 가 불렸다" 가 아니라 **"누른 뒤 무엇이 보이는가"** 를 잰다.
 */
describe('✕ 로 닫기 (R4 §2 · pwa-store isUpdateDismissed)', () => {
  function dismissByX() {
    fireEvent.click(screen.getByRole('button', { name: '알림 닫기' }));
  }

  it('누르면 사라지고, 화면이 비어도 되밀리지 않는다', () => {
    render(<Notices />);
    setStage('waiting');
    expect(screen.getByText('새 버전이 준비됐어요')).toBeInTheDocument();

    dismissByX();
    expect(screen.queryByText('새 버전이 준비됐어요')).not.toBeInTheDocument();
    // 배선이 없으면 여기서 되돌아온다 — 허브가 비었고 show 가 여전히 참이기 때문이다.
    advance(60_000);
    expect(screen.queryByText('새 버전이 준비됐어요')).not.toBeInTheDocument();
    expect(usePwaStore.getState().isUpdateDismissed).toBe(true);
  });

  it('닫은 뒤 다른 토스트가 왔다 가도 돌아오지 않는다', () => {
    render(<Notices />);
    setStage('waiting');
    dismissByX();

    act(() => {
      pushToast({ message: '삭제했어요' });
    });
    advance(3000); // 그 토스트가 자동으로 닫혀 화면이 다시 빈다
    expect(screen.queryByText('삭제했어요')).not.toBeInTheDocument();
    expect(screen.queryByText('새 버전이 준비됐어요')).not.toBeInTheDocument();
  });

  // 영영 죽이는 것이 아니다 — 닫은 것은 "이번 알림" 이고, 새 상황은 새 알림이다(pwa-store).
  it('닫은 뒤 다른 탭이 적용하면 다시 뜬다', () => {
    render(<Notices />);
    setStage('waiting');
    dismissByX();
    expect(screen.queryByText('새 버전이 준비됐어요')).not.toBeInTheDocument();

    setStage('activated');
    expect(screen.getByText('새 버전이 준비됐어요')).toBeInTheDocument();
  });

  // 자동 닫힘·밀려남은 "사용자가 껐다" 가 아니다. 여기서 세워지면 R4 가 깨진다.
  it('밀려나 사라진 것만으로는 isUpdateDismissed 가 서지 않는다', () => {
    render(<Notices />);
    setStage('waiting');
    act(() => {
      pushToast({ message: '삭제했어요' });
    });
    expect(screen.queryByText('새 버전이 준비됐어요')).not.toBeInTheDocument();
    expect(usePwaStore.getState().isUpdateDismissed).toBe(false);
  });
});

describe('저장 공간 배너 (R6)', () => {
  function denyPersist() {
    act(() => {
      usePwaStore.getState().setPersistState('denied');
    });
  }

  it('alert 영역은 배너가 없을 때도 DOM 에 있다(나중에 삽입하면 낭독되지 않는다)', () => {
    render(<Notices />);
    expect(screen.getByRole('alert', { name: '저장 공간 알림' })).toBeEmptyDOMElement();
  });

  it('지속성이 거부되면 배너가 alert 영역에 들어간다', () => {
    render(<Notices />);
    denyPersist();
    const banner = screen.getByText(/저장 공간을 보장하지 않아요/);
    expect(screen.getByRole('alert', { name: '저장 공간 알림' })).toContainElement(banner);
  });

  it('✕ 는 이름 있는 버튼이고 누르면 닫기를 부른다', () => {
    render(<Notices />);
    denyPersist();
    fireEvent.click(screen.getByRole('button', { name: '저장 공간 알림 닫기' }));
    expect(dismissStorageNotice).toHaveBeenCalledTimes(1);
  });

  it('닫은 뒤에는 뜨지 않는다', () => {
    render(<Notices />);
    denyPersist();
    act(() => {
      usePwaStore.getState().dismissStorageNotice();
    });
    expect(screen.queryByText(/저장 공간을 보장하지 않아요/)).not.toBeInTheDocument();
  });

  it('[백업하기] 는 백업 화면이 붙기 전에는 그리지 않는다', () => {
    const onBackup = vi.fn();
    const { rerender } = render(<Notices />);
    denyPersist();
    expect(screen.queryByRole('button', { name: '백업하기' })).not.toBeInTheDocument();
    rerender(<Notices onBackup={onBackup} />);
    fireEvent.click(screen.getByRole('button', { name: '백업하기' }));
    expect(onBackup).toHaveBeenCalledTimes(1);
  });
});
