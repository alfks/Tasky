// 편집 대화상자 — 검증 문구·글자 수·취소는 버림·저장·사진 오류 (profile.md §2·§5).
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setProfile } from '@/domain/profile/profile.rules';
import { createSettings } from '@/domain/theme/settings.rules';

import { getRepositories, setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { ProfileDialog } from '@/features/profile/components/ProfileDialog';
import { useProfileStore } from '@/features/profile/store/profile-store';
import { fixedDeps } from '@/test/fixtures/deps';

const AVATAR = 'data:image/webp;base64,AAAA';

type Overrides = { email?: string | null; onClose?: () => void; onSaveFailed?: () => void };

/** 카드가 넘기는 것과 같은 prop 묶음 — 초기값은 스토어 스냅샷, `save` 는 실제 스토어 액션. */
function dialogProps(overrides: Overrides = {}) {
  const { name, bio, avatar } = useProfileStore.getState();
  return {
    email: overrides.email ?? null,
    initial: { name, bio, avatar },
    save: useProfileStore.getState().save,
    deps: fixedDeps(),
    onClose: overrides.onClose ?? vi.fn(),
    onSaveFailed: overrides.onSaveFailed ?? vi.fn(),
  };
}

beforeEach(() => {
  setRepositories(createMemoryRepositories());
  window.localStorage.clear();
  useProfileStore.setState({
    name: undefined,
    bio: undefined,
    avatar: undefined,
    status: 'ready',
    hydrated: true,
  });
});

describe('ProfileDialog — 입력·글자 수', () => {
  it('제목·이름·한 줄 소개 칸이 있고 maxLength 가 없으며, 글자 수는 코드 포인트로 센다', async () => {
    const user = userEvent.setup();
    render(<ProfileDialog {...dialogProps({ email: 'millie@example.com' })} />);
    expect(screen.getByRole('dialog', { name: '프로필 편집' })).toBeInTheDocument();
    const name = screen.getByLabelText('이름');
    expect(name).not.toHaveAttribute('maxlength');
    await user.type(name, '😀😀');
    expect(screen.getByText('2 / 20')).toBeInTheDocument();
    expect(screen.getByText('0 / 60')).toBeInTheDocument();
  });

  it('미리보기 원의 첫 글자는 입력 중인 이름을 따라가고, 비면 이메일 앞부분의 첫 글자다', async () => {
    const user = userEvent.setup();
    render(<ProfileDialog {...dialogProps({ email: 'millie@example.com' })} />);
    const dialog = screen.getByRole('dialog', { name: '프로필 편집' });
    const circle = () => dialog.querySelector('span[aria-hidden="true"].rounded-full');
    expect(circle()?.textContent).toBe('M');
    await user.type(screen.getByLabelText('이름'), '밀리');
    expect(circle()?.textContent).toBe('밀');
  });
});

describe('ProfileDialog — 제출 검증 (R1·R2)', () => {
  it('21자 이름으로 저장하면 문구가 role=alert 로 뜨고 입력의 aria-describedby 가 가리키며 저장하지 않는다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ProfileDialog {...dialogProps({ onClose })} />);
    const name = screen.getByLabelText('이름');
    await user.type(name, '가'.repeat(21));
    await user.click(screen.getByRole('button', { name: '저장' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('이름은 20자까지 쓸 수 있어요');
    expect(name).toHaveAttribute('aria-describedby', alert.id);
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(onClose).not.toHaveBeenCalled();
    expect(await getRepositories().settings.get()).toBeUndefined();
    // 고치기 시작하면 문구가 사라진다.
    await user.type(name, '{Backspace}');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('61자 소개는 "소개는 60자까지 쓸 수 있어요"', async () => {
    const user = userEvent.setup();
    render(<ProfileDialog {...dialogProps()} />);
    await user.type(screen.getByLabelText('한 줄 소개'), '나'.repeat(61));
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('소개는 60자까지 쓸 수 있어요');
  });
});

describe('ProfileDialog — 저장·취소', () => {
  it('편집 중 원격으로 바뀐 소개와 사진은 이름만 고쳐 저장해도 보존한다', async () => {
    const user = userEvent.setup();
    const deps = fixedDeps();
    const repository = getRepositories().settings;
    await repository.upsert(
      setProfile(
        createSettings(deps),
        {
          name: '처음',
          bio: '옛 소개',
          avatar: AVATAR,
        },
        deps,
      ),
    );
    useProfileStore.setState({ name: '처음', bio: '옛 소개', avatar: AVATAR });
    render(<ProfileDialog {...dialogProps()} />);

    const remoteAvatar = 'data:image/webp;base64,BBBB';
    await repository.upsert(
      setProfile(
        (await repository.get())!,
        {
          name: '처음',
          bio: '새 소개',
          avatar: remoteAvatar,
        },
        deps,
      ),
    );
    await useProfileStore.getState().reloadFromStorage();
    await user.clear(screen.getByLabelText('이름'));
    await user.type(screen.getByLabelText('이름'), '내 이름');
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(async () => {
      expect(await repository.get()).toMatchObject({
        profileName: '내 이름',
        profileBio: '새 소개',
        profileAvatar: remoteAvatar,
      });
    });
  });

  it('Enter 로 저장하면 설정 행에 다듬은 값이 쓰이고 스토어가 바뀌고 닫힌다(성공 토스트 없음)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSaveFailed = vi.fn();
    render(<ProfileDialog {...dialogProps({ onClose, onSaveFailed })} />);
    await user.type(screen.getByLabelText('이름'), '  밀리 ');
    await user.type(screen.getByLabelText('한 줄 소개'), '오늘도 한 칸씩{Enter}');
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(await getRepositories().settings.get()).toMatchObject({
      profileName: '밀리',
      profileBio: '오늘도 한 칸씩',
    });
    expect(useProfileStore.getState()).toMatchObject({ name: '밀리', bio: '오늘도 한 칸씩' });
    expect(onSaveFailed).not.toHaveBeenCalled();
  });

  it('취소는 미리보기·입력 전부 버린다 — 스토어가 그대로다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    useProfileStore.setState({ name: '밀리', avatar: AVATAR });
    render(<ProfileDialog {...dialogProps({ onClose })} />);
    await user.click(screen.getByRole('button', { name: '사진 지우기' }));
    expect(screen.queryByRole('presentation')).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('이름'));
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useProfileStore.getState()).toMatchObject({ name: '밀리', avatar: AVATAR });
    expect(await getRepositories().settings.get()).toBeUndefined();
  });

  it('저장소가 실패하면 대화상자를 유지한 채 onSaveFailed 만 부른다(카드가 토스트를 띄운다)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSaveFailed = vi.fn();
    const repositories = createMemoryRepositories();
    repositories.settings.upsert = () => Promise.reject(new Error('quota'));
    setRepositories(repositories);
    render(<ProfileDialog {...dialogProps({ onClose, onSaveFailed })} />);
    await user.type(screen.getByLabelText('이름'), '밀리{Enter}');
    await waitFor(() => expect(onSaveFailed).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '프로필 편집' })).toBeInTheDocument();
  });
});

describe('ProfileDialog — 사진을 읽는 동안 (리뷰 B-m2)', () => {
  it('디코드가 끝나기 전 Enter/저장은 무시되고 저장 버튼이 잠긴다 — 고른 사진을 버리지 않는다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ProfileDialog {...dialogProps({ onClose })} />);
    vi.stubGlobal('createImageBitmap', () => new Promise(() => {})); // 영원히 읽는 중
    await user.upload(
      screen.getByLabelText('사진 고르기'),
      new File(['x'], 'big.png', { type: 'image/png' }),
    );
    expect(await screen.findByText('사진을 읽는 중…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
    await user.type(screen.getByLabelText('이름'), '밀리{Enter}');
    expect(onClose).not.toHaveBeenCalled();
    expect(await getRepositories().settings.get()).toBeUndefined();
    vi.unstubAllGlobals();
  });
});

describe('ProfileDialog — 사진 (R3·§5)', () => {
  it('파일 입력은 실제 input[type=file] 이고 label "사진 고르기" 가 가리키며, 사진이 없으면 "사진 지우기" 가 없다', () => {
    render(<ProfileDialog {...dialogProps()} />);
    const input = screen.getByLabelText('사진 고르기');
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('accept', 'image/*');
    expect(input).not.toHaveAttribute('hidden');
    expect(screen.queryByRole('button', { name: '사진 지우기' })).not.toBeInTheDocument();
  });

  it('이미지가 아닌 파일은 "이미지 파일만 올릴 수 있어요" 가 role=alert 로 뜨고 input 의 aria-describedby 가 가리킨다', async () => {
    // `accept="image/*"` 는 브라우저 대화상자의 필터일 뿐 보장이 아니다(드래그·"모든 파일") — user-event 의
    // 기본 accept 적용을 꺼서 실제로 텍스트 파일이 들어오는 경로를 재현한다.
    const user = userEvent.setup({ applyAccept: false });
    useProfileStore.setState({ avatar: AVATAR });
    render(<ProfileDialog {...dialogProps()} />);
    const input = screen.getByLabelText('사진 고르기');
    await user.upload(input, new File(['x'], 'memo.txt', { type: 'text/plain' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('이미지 파일만 올릴 수 있어요');
    expect(input).toHaveAttribute('aria-describedby', alert.id);
    // 오류가 나도 이전 미리보기는 유지된다.
    expect(screen.getByRole('presentation')).toHaveAttribute('src', AVATAR);
  });

  it('10MB 를 넘는 이미지는 "10MB 이하 이미지만 올릴 수 있어요"', async () => {
    const user = userEvent.setup();
    render(<ProfileDialog {...dialogProps()} />);
    const big = new File([''], 'big.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 10 * 1024 * 1024 + 1 });
    await user.upload(screen.getByLabelText('사진 고르기'), big);
    expect(await screen.findByRole('alert')).toHaveTextContent('10MB 이하 이미지만 올릴 수 있어요');
  });

  it('브라우저가 열지 못하는 이미지는 "사진을 읽지 못했어요. 다른 사진을 골라 주세요"', async () => {
    const user = userEvent.setup();
    render(<ProfileDialog {...dialogProps()} />);
    // jsdom 에는 createImageBitmap 이 없고 <img> 도 디코드하지 않는다 — 실제 HEIC 와 같은 경로다.
    vi.stubGlobal('createImageBitmap', () => Promise.reject(new Error('unsupported')));
    await user.upload(
      screen.getByLabelText('사진 고르기'),
      new File(['not really'], 'photo.heic', { type: 'image/heic' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '사진을 읽지 못했어요. 다른 사진을 골라 주세요',
    );
    vi.unstubAllGlobals();
  });
});
