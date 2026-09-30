import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { SocialCategoryView, SocialResponse } from '@/domain/social/social';

import type { SocialRepository } from '@/repositories/social-repository';

import { CategoryPublicationManager } from '@/features/category/components/CategoryPublicationManager';
import { createPublicationRecovery } from '@/features/category/store/category-publication-recovery';
import { makeCategory } from '@/test/fixtures/category';

const answer = <T,>(data: T): SocialResponse<T> => ({ data, serverTime: 1 });
function fixture() {
  let local = makeCategory({ name: '개인 L' });
  let remote: SocialCategoryView = {
    id: 'remote',
    name: '서버 R',
    color: '#EF9A9A',
    visibility: 'public',
    version: 3,
    postCount: 2,
    updatedAt: 1,
  };
  const recovery = createPublicationRecovery();
  const saveCategory = vi.fn();
  const revokeCategory = vi
    .fn<SocialRepository['revokeCategory']>()
    .mockImplementation(async () => {
      remote = { ...remote, visibility: 'private', revoked: true, version: 4 };
      return answer(remote);
    });
  const categories = vi
    .fn<SocialRepository['categories']>()
    .mockImplementation(async () => answer({ items: [remote], nextCursor: null }));
  const persist = vi.fn(
    async (canonical: SocialCategoryView | null, origin = local, allowed?: () => boolean) => {
      if (!allowed?.() || origin.id !== local.id) return false;
      local = {
        ...local,
        visibility: canonical?.visibility ?? 'private',
        socialCategoryId: canonical?.id,
        socialCategoryVersion: canonical?.version,
      };
      return true;
    },
  );
  const dependencies = {
    recovery,
    persist,
    getLocal: () => local,
    listLocal: () => [local],
    capture: () => () => true,
    online: () => true,
    key: () => 'v1.receipt',
    repository: () =>
      ({
        categories,
        saveCategory,
        revokeCategory,
        me: async () =>
          answer({
            mode: 'enabled' as const,
            profile: { id: 'actor', nickname: '나', version: 1 },
          }),
      }) as unknown as SocialRepository,
  };
  return {
    dependencies,
    persist,
    saveCategory,
    revokeCategory,
    local: () => local,
    markRevoked: () => {
      remote = { ...remote, visibility: 'private', revoked: true, version: 4 };
    },
  };
}
describe('공유 카테고리 관리의 명시 선택과 확인', () => {
  it('L/R 양쪽 이름과 실제 공개 범위를 확인하기 전에는 연결하지 않으며 개인 이름을 유지한다', async () => {
    const f = fixture();
    const user = userEvent.setup();
    render(<CategoryPublicationManager dependencies={f.dependencies} onClose={vi.fn()} />);
    await screen.findByRole('heading', { name: '서버 R' });
    await user.click(screen.getByRole('button', { name: '연결하기' }));
    expect(screen.getByRole('button', { name: '연결 내용 확인' })).toBeDisabled();
    await user.selectOptions(
      screen.getByRole('combobox', { name: '연결할 이 기기 카테고리' }),
      f.local().id,
    );
    await user.click(screen.getByRole('button', { name: '연결 내용 확인' }));
    await screen.findByRole('dialog', { name: '공유 카테고리 연결 확인' });
    expect(screen.getByText('이 기기 카테고리: 개인 L')).toBeVisible();
    expect(screen.getByText('서버 카테고리: 서버 R')).toBeVisible();
    expect(screen.getByText(/로그인하지 않은 사람도 볼 수 있어요/)).toBeVisible();
    expect(f.persist).not.toHaveBeenCalled();
    expect(f.saveCategory).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '연결하기' }));
    await screen.findByText('이 기기의 연결 표식을 저장했어요. 개인 이름과 할 일은 그대로예요.');
    expect(f.local().name).toBe('개인 L');
    expect(f.local().socialCategoryId).toBe('remote');
    expect(f.saveCategory).not.toHaveBeenCalled();
  });
  it('미확정 철회에서 Esc는 경고를 열고 나중에 확인으로 닫았다 다시 열어도 같은 키로 확인한다', async () => {
    const f = fixture();
    const user = userEvent.setup();
    const close = vi.fn();
    f.revokeCategory.mockImplementationOnce(async () => {
      f.markRevoked();
      throw Object.assign(new Error('lost'), { code: 'temporary' });
    });
    const view = render(
      <CategoryPublicationManager dependencies={f.dependencies} onClose={close} />,
    );
    await screen.findByRole('heading', { name: '서버 R' });
    await user.click(screen.getByRole('button', { name: '공유 철회' }));
    await screen.findByRole('dialog', { name: '이 공유 카테고리를 철회할까요?' });
    await user.click(screen.getByRole('button', { name: '공유 철회' }));
    await screen.findByRole('button', { name: '같은 요청 다시 확인' });
    await user.keyboard('{Escape}');
    await screen.findByRole('alertdialog', { name: '완료 여부를 나중에 확인할까요?' });
    expect(screen.getByRole('button', { name: '같은 요청으로 확인' })).toHaveFocus();
    await user.click(screen.getAllByRole('button', { name: '나중에 확인' }).at(-1)!);
    expect(close).toHaveBeenCalledOnce();
    view.unmount();
    render(<CategoryPublicationManager dependencies={f.dependencies} onClose={close} />);
    await screen.findByRole('heading', { name: '서버 R' });
    expect(screen.getByText(/철회됨/)).toBeVisible();
    expect(screen.getByRole('button', { name: '연결하기' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '완료 여부 확인' }));
    await user.click(await screen.findByRole('button', { name: '같은 요청 다시 확인' }));
    await waitFor(() => expect(f.revokeCategory).toHaveBeenCalledTimes(2));
    expect(f.revokeCategory.mock.calls[1]).toEqual(f.revokeCategory.mock.calls[0]);
  });
});
