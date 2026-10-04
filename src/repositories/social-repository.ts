/** 온라인 소셜 포트. 구현이 인증 쿠키/actor를 묶고 호출자에게 actor 인자를 노출하지 않는다. */
import type {
  FriendView,
  InviteCreated,
  InviteView,
  OwnReactionView,
  Page,
  PageInput,
  PairResult,
  PostInput,
  PostView,
  ProfileView,
  RequestView,
  SocialId,
  SocialMe,
  SocialErrorCode,
  SocialResponse,
  SocialCategoryView,
  SocialCategoryInput,
  PublicPageInput,
} from '@/domain/social/social';

export type CommandKey = { key: string };
export type SocialRepositoryFailure = Error & {
  code: SocialErrorCode;
  serverTime: number;
  retryAfter?: number;
};

export interface SocialRepository {
  me(): Promise<SocialResponse<SocialMe>>;
  /** 소유자의 공개 category 관리 목록. */
  categories(page?: PageInput): Promise<SocialResponse<Page<SocialCategoryView>>>;
  /** 현재 읽기 권한으로 canonical projection을 확인한다. */
  category(input: { id: SocialId }): Promise<SocialResponse<SocialCategoryView>>;
  /** 서버에서 현재 버전/소유권을 확인해 범위와 metadata를 저장한다. */
  saveCategory(
    input: SocialCategoryInput,
    options: CommandKey,
  ): Promise<SocialResponse<SocialCategoryView>>;
  /** 공개 category를 철회하되 소유자 공유 관리에는 사본을 남긴다. */
  revokeCategory(
    input: { id: SocialId; expectedVersion: number },
    options: CommandKey,
  ): Promise<SocialResponse<SocialCategoryView>>;
  createProfile(input: { nickname: string }): Promise<SocialResponse<ProfileView>>;
  renameProfile(
    input: { nickname: string; expectedVersion: number },
    options: CommandKey,
  ): Promise<SocialResponse<Pick<ProfileView, 'id' | 'version'>>>;

  friends(page?: PageInput): Promise<SocialResponse<Page<FriendView>>>;
  requests(
    direction: 'incoming' | 'outgoing',
    page?: PageInput,
  ): Promise<SocialResponse<Page<RequestView>>>;
  createInvite(options: CommandKey): Promise<SocialResponse<InviteCreated>>;
  invites(page?: PageInput): Promise<SocialResponse<Page<InviteView>>>;
  revokeInvite(
    input: { inviteId: string },
    options: CommandKey,
  ): Promise<SocialResponse<{ revoked: true }>>;
  previewInvite(input: {
    token: string;
  }): Promise<SocialResponse<{ nickname: string; expiresAt: number }>>;
  sendRequest(
    input: { token: string },
    options: CommandKey,
  ): Promise<SocialResponse<Pick<PairResult, 'peerId' | 'pairVersion'>>>;
  acceptRequest(
    input: { peerId: SocialId; expectedVersion: number },
    options: CommandKey,
  ): Promise<SocialResponse<PairResult>>;
  declineRequest(
    input: { peerId: SocialId; expectedVersion: number },
    options: CommandKey,
  ): Promise<SocialResponse<PairResult>>;
  cancelRequest(
    input: { peerId: SocialId; expectedVersion: number },
    options: CommandKey,
  ): Promise<SocialResponse<PairResult>>;
  removeFriend(
    input: { peerId: SocialId; expectedVersion: number },
    options: CommandKey,
  ): Promise<SocialResponse<PairResult>>;
  blocks(page?: PageInput): Promise<SocialResponse<Page<FriendView>>>;
  setBlock(
    input: { peerId: SocialId; blocked: boolean; expectedVersion?: number },
    options: CommandKey,
  ): Promise<SocialResponse<{ blocked: boolean; pairVersion: number }>>;

  feed(page?: PageInput): Promise<SocialResponse<Page<PostView>>>;
  validatePosts(input: {
    ids: readonly SocialId[];
  }): Promise<SocialResponse<{ allowedIds: readonly SocialId[] }>>;
  myPosts(page?: PageInput): Promise<SocialResponse<Page<PostView>>>;
  myReactions(page?: PageInput): Promise<SocialResponse<Page<OwnReactionView>>>;
  createPost(input: PostInput, options: CommandKey): Promise<SocialResponse<{ id: SocialId }>>;
  deletePost(
    input: { id: SocialId },
    options: CommandKey,
  ): Promise<SocialResponse<{ deleted: true }>>;
  setReaction(
    input: { postId: SocialId; active: boolean },
    options: CommandKey,
  ): Promise<SocialResponse<{ postId: SocialId; active: boolean }>>;
}

/** 인증 예외는 이 좁은 공개 읽기 포트뿐이며 mutation을 제공하지 않는다. */
export interface PublicSocialRepository {
  feed(page?: PublicPageInput): Promise<SocialResponse<Page<PostView>>>;
  categories(page?: PageInput): Promise<SocialResponse<Page<SocialCategoryView>>>;
  post(input: { id: SocialId }): Promise<SocialResponse<PostView>>;
  validatePosts(input: {
    ids: readonly SocialId[];
  }): Promise<SocialResponse<{ allowedIds: readonly SocialId[] }>>;
}
