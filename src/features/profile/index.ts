// 공개 API 배럴 — src/ 에서 index.ts 가 허용되는 유일한 위치(code-style.md §2).
// 진입 청크에 남는 전부: 카드 + 스토어. 편집 대화상자·사진 파이프라인·`profile.rules` 는 카드가
// `lazy()` 로만 부르므로 여기서 재export 하지 않는다(재export 하는 순간 진입에 흡수된다).
export {
  PROFILE_BIO_PLACEHOLDER,
  PROFILE_CARD_LABEL,
  PROFILE_EDIT_LABEL,
  ProfileCard,
} from '@/features/profile/components/ProfileCard';

export { createProfileStore, useProfileStore } from '@/features/profile/store/profile-store';
export type {
  ProfileActions,
  ProfileLoadStatus,
  ProfileState,
  ProfileStore,
} from '@/features/profile/store/profile-store';
export { PROFILE_MIRROR_KEY } from '@/features/profile/store/profile-mirror';
