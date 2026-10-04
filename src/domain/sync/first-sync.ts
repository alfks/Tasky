// 첫 실행 시드(category.md R18)를 언제 해도 되는지 가르는 순수 판정.
// 로그인된 기기는 서버와 한 번 맞추기 전에는 "비어 있다" 가 "첫 사용자" 를 뜻하지 않는다 — 서버에
// 이미 자료가 있는 계정이 빈 기기를 만나는 것이 정상 흐름이라, 그 전에 시드하면 빈 설정 행·`todo`
// 카테고리가 서버 자료를 덮거나 섞인다. `lastSyncedAt` 은 왕복마다 쓰이고 로그인·wipe 가 상태를
// 새로 만들면 사라지므로 새 필드가 필요 없다.
import type { SyncState } from '@/domain/sync/wire';

export function canSeedLocally(
  state: Pick<SyncState, 'userSub' | 'lastSyncedAt'> | undefined,
): boolean {
  return state?.userSub === undefined || state.lastSyncedAt !== undefined;
}
