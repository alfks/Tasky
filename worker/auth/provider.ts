// 신원 제공자 인터페이스 — 구글(`google.ts`)과 로컬 스텁(`stub.ts`)이 각각 구현한다
// (SYNC_DESIGN.md §②-4). `worker/auth/handlers.ts` 는 이 인터페이스만 보고 어느 구현인지 모른다.
export type IdentityProvider = {
  /** `/auth/login` → 302 대상 URL. `state`·PKCE `code_challenge` 를 실어 보낸다. */
  authorizeUrl(state: string, codeChallenge: string): string;
  /** `/auth/callback` → 코드 교환 + 사용자 조회. */
  exchange(code: string, codeVerifier: string): Promise<{ sub: string; email: string }>;
};
