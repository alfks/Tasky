// 계정 블록 상태 줄 — 리뷰 Major 4: "보류"(uploadPending)가 참인 동안은 아웃박스가 비어 있어도
// "● 동기화됨" 을 참칭하지 않는다.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AccountBlock } from '@/features/sync/components/AccountBlock';
import { resetSyncStoreForTest, useSyncStore } from '@/features/sync/store/sync-store';

import { clearToasts, getToasts } from '@/components/ui/Toast';

const exportBackup = () => Promise.resolve(true);

describe('AccountBlock 상태 줄 (리뷰 Major 4)', () => {
  it('uploadPending 이 참이면 pendingCount=0·online=true 여도 "동기화됨" 이 아니다', () => {
    resetSyncStoreForTest();
    useSyncStore.setState({
      email: 'a@example.com',
      online: true,
      pendingCount: 0,
      uploadPending: true,
    });
    render(<AccountBlock exportBackup={exportBackup} />);

    expect(screen.getByRole('status')).not.toHaveTextContent('● 동기화됨');
  });

  it('uploadPending 이 꺼지면(결정 완료) 평소대로 "동기화됨" 이 뜬다', () => {
    resetSyncStoreForTest();
    useSyncStore.setState({
      email: 'a@example.com',
      online: true,
      pendingCount: 0,
      uploadPending: false,
    });
    render(<AccountBlock exportBackup={exportBackup} />);

    expect(screen.getByRole('status')).toHaveTextContent('● 동기화됨');
  });
});

// "다른 기기 모두 로그아웃"(ADR-0020 §결정 5) — 확인 없이 바로 실행하지 않는다(로그아웃 버튼과
// 같은 확인 단계). exportBackup 은 요구하지 않는다(이 기기 데이터는 그대로).
describe('AccountBlock — 다른 기기 모두 로그아웃', () => {
  it('버튼을 누르면 확인 대화상자가 뜨고, 확인하면 성공 토스트가 뜬다', async () => {
    resetSyncStoreForTest();
    clearToasts();
    useSyncStore.setState({ email: 'a@example.com', online: true, pendingCount: 0 });
    const logoutOthers = vi.fn().mockResolvedValue('ok');
    useSyncStore.setState({ logoutOthers });
    const user = userEvent.setup();
    render(<AccountBlock exportBackup={exportBackup} />);

    await user.click(screen.getByRole('button', { name: '다른 기기 모두 로그아웃' }));
    const dialog = screen.getByRole('alertdialog', { name: '다른 기기를 모두 로그아웃할까요?' });
    expect(dialog).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: '로그아웃' }));

    await waitFor(() => expect(logoutOthers).toHaveBeenCalledTimes(1));
    // 토스트 뷰포트(`ShellToasts`)는 셸 하나에만 마운트되므로(app-shell R8), 여기서는 허브 상태로
    // 확인한다 — DOM 에는 이 컴포넌트 트리 밖이라 나타나지 않는다.
    await waitFor(() =>
      expect(getToasts().some((t) => t.message === '다른 기기를 로그아웃했어요.')).toBe(true),
    );
  });

  it('취소하면 아무것도 부르지 않는다', async () => {
    resetSyncStoreForTest();
    clearToasts();
    useSyncStore.setState({ email: 'a@example.com', online: true, pendingCount: 0 });
    const logoutOthers = vi.fn().mockResolvedValue('ok');
    useSyncStore.setState({ logoutOthers });
    const user = userEvent.setup();
    render(<AccountBlock exportBackup={exportBackup} />);

    await user.click(screen.getByRole('button', { name: '다른 기기 모두 로그아웃' }));
    const dialog = screen.getByRole('alertdialog', { name: '다른 기기를 모두 로그아웃할까요?' });
    await user.click(within(dialog).getByRole('button', { name: '취소' }));

    expect(logoutOthers).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('alertdialog', { name: '다른 기기를 모두 로그아웃할까요?' }),
    ).not.toBeInTheDocument();
  });

  it('진짜 서버 오류면 범용 재시도 토스트를 띄운다(리뷰 Major 1 — 갈래 중 하나)', async () => {
    resetSyncStoreForTest();
    clearToasts();
    useSyncStore.setState({ email: 'a@example.com', online: true, pendingCount: 0 });
    const logoutOthers = vi.fn().mockResolvedValue('error');
    useSyncStore.setState({ logoutOthers });
    const user = userEvent.setup();
    render(<AccountBlock exportBackup={exportBackup} />);

    await user.click(screen.getByRole('button', { name: '다른 기기 모두 로그아웃' }));
    const dialog = screen.getByRole('alertdialog', { name: '다른 기기를 모두 로그아웃할까요?' });
    await user.click(within(dialog).getByRole('button', { name: '로그아웃' }));

    await waitFor(() =>
      expect(
        getToasts().some(
          (t) => t.message === '다른 기기를 로그아웃하지 못했어요. 다시 시도해 주세요.',
        ),
      ).toBe(true),
    );
  });

  it('오프라인이면 재시도 문구가 아니라 온라인이 되면 다시 하라는 문구를 띄운다(리뷰 Major 1)', async () => {
    resetSyncStoreForTest();
    clearToasts();
    useSyncStore.setState({ email: 'a@example.com', online: true, pendingCount: 0 });
    const logoutOthers = vi.fn().mockResolvedValue('offline');
    useSyncStore.setState({ logoutOthers });
    const user = userEvent.setup();
    render(<AccountBlock exportBackup={exportBackup} />);

    await user.click(screen.getByRole('button', { name: '다른 기기 모두 로그아웃' }));
    const dialog = screen.getByRole('alertdialog', { name: '다른 기기를 모두 로그아웃할까요?' });
    await user.click(within(dialog).getByRole('button', { name: '로그아웃' }));

    await waitFor(() =>
      expect(getToasts().some((t) => t.message === '인터넷에 연결되면 다시 시도해 주세요.')).toBe(
        true,
      ),
    );
  });

  it('이 기기가 이미 로그아웃됐으면(signed-out) 토스트 없이 넘어간다 — 화면 전환 자체가 설명이다(리뷰 Major 1)', async () => {
    resetSyncStoreForTest();
    clearToasts();
    useSyncStore.setState({ email: 'a@example.com', online: true, pendingCount: 0 });
    const logoutOthers = vi.fn().mockResolvedValue('signed-out');
    useSyncStore.setState({ logoutOthers });
    const user = userEvent.setup();
    render(<AccountBlock exportBackup={exportBackup} />);

    await user.click(screen.getByRole('button', { name: '다른 기기 모두 로그아웃' }));
    const dialog = screen.getByRole('alertdialog', { name: '다른 기기를 모두 로그아웃할까요?' });
    await user.click(within(dialog).getByRole('button', { name: '로그아웃' }));

    await waitFor(() => expect(logoutOthers).toHaveBeenCalledTimes(1));
    expect(getToasts()).toHaveLength(0);
  });
});
