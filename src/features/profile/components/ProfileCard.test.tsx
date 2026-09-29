// 카드의 폴백·미러 첫 페인트·진입점 (profile.md §2·R9·R10·R11·R14·§5).
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { setProfile } from '@/domain/profile/profile.rules';
import { createSettings } from '@/domain/theme/settings.rules';

import { getRepositories, setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { ProfileCard } from '@/features/profile/components/ProfileCard';
import { PROFILE_MIRROR_KEY } from '@/features/profile/store/profile-mirror';
import { useProfileStore } from '@/features/profile/store/profile-store';
import { fixedDeps } from '@/test/fixtures/deps';

import { ToastViewport, clearToasts, dismissToast, useToasts } from '@/components/ui/Toast';

function ToastHost() {
  return <ToastViewport toasts={useToasts()} onClose={dismissToast} />;
}

const AVATAR = 'data:image/webp;base64,AAAA';
const deps = fixedDeps();

beforeEach(() => {
  setRepositories(createMemoryRepositories());
  window.localStorage.clear();
  clearToasts();
  useProfileStore.setState({
    name: undefined,
    bio: undefined,
    avatar: undefined,
    status: 'idle',
    hydrated: false,
  });
});

describe('ProfileCard — 빈 상태 폴백 (R9·R10)', () => {
  it('region "프로필" 이고, 이름 자리엔 이메일 @ 앞부분, 원엔 그 첫 글자, 소개 자리엔 자리표시 문구', async () => {
    render(<ProfileCard email="millie@example.com" />);
    const card = screen.getByRole('region', { name: '프로필' });
    expect(await screen.findByText('millie')).toBeInTheDocument();
    expect(screen.getByText('한 줄 소개를 적어 보세요')).toBeInTheDocument();
    // 첫 글자 원은 장식(aria-hidden) — 텍스트로만 확인한다.
    expect(card.querySelector('[aria-hidden="true"]')?.textContent).toBe('m');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '프로필 편집' })).toBeInTheDocument();
  });

  it('이메일도 없으면 "나"', async () => {
    render(<ProfileCard email={null} />);
    // 원(aria-hidden)에도 '나' 가 들어가므로 이름 문단만 본다.
    expect(await screen.findByText('나', { selector: 'p' })).toBeInTheDocument();
  });
});

describe('ProfileCard — 채운 상태', () => {
  it('저장된 이름·소개·사진(img alt="")을 보인다 — 앞뒤 공백 있는 저장값은 다듬어 보인다(R8)', async () => {
    await getRepositories().settings.upsert(
      setProfile(
        createSettings(deps),
        { name: '밀리', bio: '오늘도 한 칸씩', avatar: AVATAR },
        deps,
      ),
    );
    useProfileStore.setState({ name: '  밀리 ' });
    render(<ProfileCard email="millie@example.com" />);
    expect(await screen.findByText('밀리')).toBeInTheDocument();
    expect(screen.getByText('오늘도 한 칸씩')).toBeInTheDocument();
    const img = screen.getByRole('presentation');
    expect(img).toHaveAttribute('src', AVATAR);
    expect(img).toHaveAttribute('alt', '');
  });
});

describe('ProfileCard — 첫 페인트 (R14)', () => {
  it('미러도 저장소 값도 없으면 읽기가 끝나기 전에는 텍스트·원을 그리지 않는다', () => {
    render(<ProfileCard email="millie@example.com" />);
    expect(screen.getByRole('region', { name: '프로필' })).toBeInTheDocument();
    expect(screen.queryByText('millie')).not.toBeInTheDocument();
    expect(screen.queryByText('한 줄 소개를 적어 보세요')).not.toBeInTheDocument();
  });

  it('미러가 있으면 첫 렌더부터 그 이름이 보인다(비동기 읽기를 기다리지 않는다)', () => {
    window.localStorage.setItem(PROFILE_MIRROR_KEY, JSON.stringify({ name: '밀리' }));
    render(<ProfileCard email="millie@example.com" />);
    // `init` 은 effect 에서 돌지만 미러 적용은 동기라 첫 커밋 직후에 이미 상태에 있다.
    expect(screen.getByText('밀리')).toBeInTheDocument();
  });
});

describe('ProfileCard — 진입점 ✎ (R11·§5)', () => {
  it('누르면 "프로필 편집" 대화상자가 열리고 초기 포커스는 이름 칸이며, 취소하면 포커스가 ✎ 로 돌아온다', async () => {
    const user = userEvent.setup();
    render(<ProfileCard email="millie@example.com" />);
    const edit = screen.getByRole('button', { name: '프로필 편집' });
    await user.click(edit);
    const dialog = await screen.findByRole('dialog', { name: '프로필 편집' });
    await waitFor(() => expect(screen.getByLabelText('이름')).toHaveFocus());
    await user.click(screen.getByRole('button', { name: '취소' }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await waitFor(() => expect(edit).toHaveFocus());
  });
});

describe('ProfileCard — 저장 실패 (app-shell §2-C)', () => {
  it('저장소가 실패하면 대화상자는 남고 토스트 "저장하지 못했어요. 다시 시도해 주세요" 가 뜬다', async () => {
    const user = userEvent.setup();
    const repositories = createMemoryRepositories();
    repositories.settings.upsert = () => Promise.reject(new Error('quota'));
    setRepositories(repositories);
    render(
      <>
        <ToastHost />
        <ProfileCard email="millie@example.com" />
      </>,
    );
    await user.click(screen.getByRole('button', { name: '프로필 편집' }));
    await user.type(await screen.findByLabelText('이름'), '밀리{Enter}');
    expect(await screen.findByRole('status')).toHaveTextContent(
      '저장하지 못했어요. 다시 시도해 주세요',
    );
    expect(screen.getByRole('dialog', { name: '프로필 편집' })).toBeInTheDocument();
  });
});
