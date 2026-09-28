/** 진입 청크에 남는 작은 경계. 내용·HTTP·스토어를 import하지 않는다. */
export type SocialSessionScope = { token: string; epoch: number };
export type SocialInvalidation =
  | 'closed'
  | 'activation'
  | 'recheck'
  | 'auth'
  | 'account'
  | 'offline'
  | 'hidden'
  | 'revoked'
  | 'cross-tab'
  | 'provider';
export type SocialSessionClient = {
  invalidate: (reason: SocialInvalidation) => void;
  resume?: (scope: SocialSessionScope) => void;
};

let epoch = 0;
let active = false;
let scope: SocialSessionScope | null = null;
let verifier: (() => Promise<string | null>) | null = null;
let client: SocialSessionClient | null = null;
const listeners = new Set<(reason: SocialInvalidation) => void>();

/** Provider만 등록한다. 반환 cleanup은 이전 Provider가 새 등록을 지우지 않는다. */
export function configureSocialVerifier(verify: () => Promise<string | null>): () => void {
  verifier = verify;
  invalidateSocialSession('provider');
  return () => {
    if (verifier === verify) {
      verifier = null;
      invalidateSocialSession('provider');
    }
  };
}

/** 무거운 클라이언트가 처음 로드된 뒤에는 무효화를 동기로 전달한다. */
export function attachSocialClient(next: SocialSessionClient): () => void {
  client = next;
  return () => {
    if (client === next) client = null;
  };
}

export function invalidateSocialSession(reason: SocialInvalidation): void {
  epoch += 1;
  scope = null;
  client?.invalidate(reason);
  for (const listener of listeners) listener(reason);
}

export function onSocialInvalidation(listener: (reason: SocialInvalidation) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 화면 활성화 외에는 신원 확인 왕복을 시작하지 않는다. */
export async function activateSocialSession(): Promise<SocialSessionScope | null> {
  active = true;
  invalidateSocialSession('activation');
  const captured = epoch;
  const verify = verifier;
  if (verify === null) return null;
  let token: string | null;
  try {
    token = await verify();
  } catch {
    return null;
  }
  if (!active || epoch !== captured || token === null) return null;
  scope = { token, epoch };
  client?.resume?.(scope);
  return scope;
}

export function deactivateSocialSession(): void {
  active = false;
  invalidateSocialSession('closed');
}

/** 각 호출이 획득한 세대만 승인한다. lazy import 대기 전·후 모두 확인한다. */
export function captureSocialDispatch(): () => boolean {
  const captured = scope;
  return () => active && captured !== null && scope === captured && epoch === captured.epoch;
}

export function isSocialSessionActive(): boolean {
  return active;
}

/** 테스트 파일 사이에 모듈 전역 상태가 새지 않게 한다. */
export function resetSocialSessionForTest(): void {
  epoch = 0;
  active = false;
  scope = null;
  verifier = null;
  client = null;
  listeners.clear();
}
