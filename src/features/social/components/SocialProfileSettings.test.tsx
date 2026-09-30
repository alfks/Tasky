import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import { SocialProfileSettings } from '@/features/social/components/SocialProfileSettings';

const f = vi.hoisted(() => ({
  listeners: new Set<(reason: string) => void>(),
  scope: 0,
  repository: { me: vi.fn(), renameProfile: vi.fn() },
}));
vi.mock('@/repositories/container', () => ({ getSocialRepository: () => f.repository }));
vi.mock('@/features/social/session-lifecycle', () => ({
  captureSocialDispatch: () => {
    const scope = f.scope;
    return () => scope === f.scope;
  },
  invalidateSocialSession: (reason: string) => {
    f.scope += 1;
    f.listeners.forEach((listener) => listener(reason));
  },
  onSocialReady: () => () => undefined,
  onSocialInvalidation: (listener: (reason: string) => void) => {
    f.listeners.add(listener);
    return () => f.listeners.delete(listener);
  },
}));
const initial = { id: 'A', nickname: '이전 이름', version: 1 };
const fresh = { id: 'A', nickname: '다른 곳의 이름', version: 2 };
const answer = <T,>(data: T) => ({ data, serverTime: 1 });
beforeEach(() => {
  f.scope += 1;
  f.listeners.forEach((listener) => listener('account'));
  f.repository.me.mockReset().mockResolvedValue(answer({ profile: fresh }));
  f.repository.renameProfile
    .mockReset()
    .mockRejectedValueOnce({ code: 'conflict' })
    .mockResolvedValue(answer({ ...fresh, nickname: '작성한 새 이름', version: 3 }));
});
async function edit() {
  const user = userEvent.setup();
  const changed = vi.fn();
  const view = render(<SocialProfileSettings profile={initial} enabled onChanged={changed} />);
  await user.click(screen.getByRole('button', { name: '별명 변경' }));
  const input = screen.getByRole('textbox', { name: '친구에게 보일 별명' });
  await user.clear(input);
  await user.type(input, '작성한 새 이름');
  await user.click(screen.getByRole('button', { name: '별명 저장' }));
  return { user, input, changed, view };
}
it('v1 conflict→fresh v2는 작성 초안을 보존하며 다음 명시 click만 v2/newkey로 저장한다', async () => {
  const { user, input, changed } = await edit();
  await screen.findByText(/현재 별명: 다른 곳의 이름/);
  expect(input).toHaveValue('작성한 새 이름');
  expect(f.repository.renameProfile).toHaveBeenCalledOnce();
  expect(changed).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '별명 저장' }));
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  expect(f.repository.renameProfile.mock.calls[0][0].expectedVersion).toBe(1);
  expect(f.repository.renameProfile.mock.calls[1][0].expectedVersion).toBe(2);
  expect(f.repository.renameProfile.mock.calls[1][1].key).not.toBe(
    f.repository.renameProfile.mock.calls[0][1].key,
  );
});
it('conflict fresh read가 실패하면 stale save를 막고 read retry가 성공할 때까지 새 mutation을 보내지 않는다', async () => {
  f.repository.me
    .mockResolvedValueOnce(answer({ profile: fresh }))
    .mockRejectedValueOnce({ code: 'temporary' });
  const { user, input } = await edit();
  await screen.findByRole('button', { name: '다시 확인' });
  expect(input).toHaveValue('작성한 새 이름');
  expect(screen.getByRole('button', { name: '별명 저장' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '별명 저장' }));
  expect(f.repository.renameProfile).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: '다시 확인' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '별명 저장' })).toBeEnabled());
  expect(f.repository.renameProfile).toHaveBeenCalledOnce();
});
it('account 종료 뒤 late canonical response는 새 account UI나 draft를 복구하지 않는다', async () => {
  let finish!: (value: unknown) => void;
  f.repository.me.mockResolvedValueOnce(answer({ profile: fresh })).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { view, changed } = await edit();
  await screen.findByText('현재 별명을 확인하고 있어요.');
  act(() => {
    f.scope += 1;
    f.listeners.forEach((listener) => listener('account'));
  });
  view.unmount();
  await act(async () => {
    finish(answer({ profile: fresh }));
  });
  render(
    <SocialProfileSettings
      profile={{ id: 'B', nickname: '새 계정', version: 1 }}
      enabled
      onChanged={changed}
    />,
  );
  expect(screen.queryByText(/다른 곳의 이름/)).toBeNull();
  expect(changed).not.toHaveBeenCalled();
});

it('unknown nickname modal 경고 뒤 remount/reopen도 FIRST name/version/key로 확인하며 안전한 계속 확인에 focus한다', async () => {
  f.repository.renameProfile
    .mockReset()
    .mockRejectedValueOnce({ code: 'temporary' })
    .mockResolvedValueOnce(answer({ ...fresh, nickname: '작성한 새 이름', version: 3 }));
  const { user, view, changed } = await edit();
  await screen.findByRole('button', { name: '완료 여부 확인' });
  const first = f.repository.renameProfile.mock.calls[0];
  await user.keyboard('{Escape}');
  const warning = await screen.findByRole('alertdialog', {
    name: '완료 여부를 나중에 확인할까요?',
  });
  expect(warning).toBeVisible();
  expect(screen.getByRole('button', { name: '같은 요청으로 확인' })).toHaveFocus();
  await user.click(screen.getByRole('button', { name: '나중에 확인' }));
  view.unmount();
  render(<SocialProfileSettings profile={fresh} enabled onChanged={changed} />);
  await user.click(screen.getByRole('button', { name: '별명 변경' }));
  expect(screen.getByRole('textbox', { name: '친구에게 보일 별명' })).toHaveValue('작성한 새 이름');
  expect(screen.getByRole('textbox', { name: '친구에게 보일 별명' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '완료 여부 확인' }));
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  expect(f.repository.renameProfile.mock.calls[1]).toEqual(first);
});
