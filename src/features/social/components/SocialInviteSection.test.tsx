import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SocialInviteSection } from '@/features/social/components/SocialInviteSection';
import { EMPTY_RELATIONS } from '@/features/social/hooks/relation-pages';
import type { useSocialRelations } from '@/features/social/hooks/useSocialRelations';
import type { InviteBootstrap } from '@/features/social/lib/invite-bootstrap';

const TOKEN_A = 'a'.repeat(64);
const TOKEN_B = 'b'.repeat(64);

describe('받은 초대의 표시와 요청 대상', () => {
  it('A 요청의 재조회로 섹션이 교체된 뒤에도 A 완료가 새 B를 닫지 않는다', async () => {
    let finishA: (done: boolean) => void = () => {
      throw new Error('미설정');
    };
    const request = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            finishA = resolve;
          }),
      )
      .mockResolvedValueOnce(true);
    let currentInvite: InviteBootstrap | null = null;
    const onClearInvite = vi.fn((expected: InviteBootstrap) => {
      if (currentInvite !== expected) return false;
      currentInvite = null;
      return true;
    });
    const base = {
      data: {
        ...EMPTY_RELATIONS,
        me: { mode: 'enabled', profile: { id: 'c'.repeat(32), nickname: '나', version: 1 } },
      },
      busy: false,
      createdInvite: null,
      previewPhase: 'ready',
      captureView: () => () => true,
      previewInvite: vi.fn(),
      request,
    };
    const inviteA = { kind: 'invite' as const, token: TOKEN_A };
    const inviteB = { kind: 'invite' as const, token: TOKEN_B };
    currentInvite = inviteA;
    const relationsA = {
      ...base,
      previewToken: TOKEN_A,
      preview: { nickname: 'A', expiresAt: Date.now() + 60_000 },
    } as unknown as ReturnType<typeof useSocialRelations>;
    const relationsB = {
      ...base,
      previewToken: TOKEN_B,
      preview: { nickname: 'B', expiresAt: Date.now() + 60_000 },
    } as unknown as ReturnType<typeof useSocialRelations>;
    const oldView = render(
      <SocialInviteSection relations={relationsA} invite={inviteA} onClearInvite={onClearInvite} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '친구 요청 보내기' }));
    expect(request).toHaveBeenCalledWith(TOKEN_A);

    oldView.unmount(); // relations.load() 중 FriendsPanel은 섹션을 언마운트한다.
    currentInvite = inviteB;
    render(
      <SocialInviteSection relations={relationsB} invite={inviteB} onClearInvite={onClearInvite} />,
    );
    expect(screen.getByText('B')).toBeInTheDocument();
    await act(async () => finishA(true));
    expect(onClearInvite).toHaveBeenCalledWith(inviteA);
    expect(currentInvite).toBe(inviteB);
    fireEvent.click(screen.getByRole('button', { name: '친구 요청 보내기' }));
    await waitFor(() => expect(onClearInvite).toHaveBeenCalledTimes(2));
    expect(request).toHaveBeenLastCalledWith(TOKEN_B);
    expect(onClearInvite).toHaveBeenLastCalledWith(inviteB);
  });

  it('새 토큰을 받으면 이전 토큰의 미리보기와 요청 버튼을 보이지 않는다', () => {
    const relations = {
      data: {
        ...EMPTY_RELATIONS,
        me: { mode: 'enabled', profile: { id: 'c'.repeat(32), nickname: '나', version: 1 } },
      },
      busy: false,
      createdInvite: null,
      previewToken: TOKEN_A,
      previewPhase: 'ready',
      preview: { nickname: 'A', expiresAt: Date.now() + 60_000 },
      previewInvite: vi.fn(),
    } as unknown as ReturnType<typeof useSocialRelations>;
    const view = render(
      <SocialInviteSection
        relations={relations}
        invite={{ kind: 'invite', token: TOKEN_B }}
        onClearInvite={vi.fn()}
      />,
    );
    expect(screen.getByText('초대를 확인하는 중이에요.')).toBeInTheDocument();
    expect(screen.queryByText('A')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '친구 요청 보내기' })).not.toBeInTheDocument();
    view.rerender(
      <SocialInviteSection
        relations={relations}
        invite={{ kind: 'invalid' }}
        onClearInvite={vi.fn()}
      />,
    );
    expect(relations.previewInvite).toHaveBeenLastCalledWith(null);
    view.rerender(
      <SocialInviteSection relations={relations} invite={null} onClearInvite={vi.fn()} />,
    );
    expect(screen.queryByRole('region', { name: '받은 초대' })).not.toBeInTheDocument();
  });
});
