// 아바타 원 (profile.md R9·§5). 사진이 있으면 `img alt=""`(이름 텍스트가 바로 옆이라 중복 낭독을 피한다),
// 없으면 표시 이름의 첫 글자를 강조색 원에 넣는다(`aria-hidden` — 장식). 카드(40)와 대화상자
// 미리보기(64) 둘이 같은 컴포넌트를 쓴다 — 두 자리의 원이 서로 다른 모양이면 그 자체가 결함이다.
import { cn } from '@/lib/cn';

type ProfileAvatarProps = {
  /** `data:image/webp|jpeg;base64,…` — 96px 원본. 표시 크기가 작아도 다시 줄이지 않는다(2배 화면). */
  avatar: string | undefined;
  /** 사진이 없을 때 원에 넣을 첫 글자. 빈 문자열이면 빈 원. */
  initial: string;
  size: 40 | 64;
};

const SIZE_CLASS: Record<ProfileAvatarProps['size'], string> = {
  40: 'size-[40px] text-base',
  64: 'size-[64px] text-lg',
};

export function ProfileAvatar({ avatar, initial, size }: ProfileAvatarProps) {
  if (avatar !== undefined) {
    return (
      <img
        src={avatar}
        alt=""
        className={cn('shrink-0 rounded-full bg-surface-2 object-cover', SIZE_CLASS[size])}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-accent leading-none font-semibold text-on-accent select-none',
        SIZE_CLASS[size],
      )}
    >
      {initial}
    </span>
  );
}
