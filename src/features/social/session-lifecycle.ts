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
const owners = new Set<symbol>();
let feedOwner: symbol | null = null;
let verification: { epoch: number; promise: Promise<SocialSessionScope | null> } | null = null;
let scope: SocialSessionScope | null = null;
let verifier: (() => Promise<string | null>) | null = null;
let client: SocialSessionClient | null = null;
const listeners = new Set<(reason: SocialInvalidation) => void>();
const readyListeners = new Set<(ready: SocialSessionScope) => void>();

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

/** 관계·초대 화면은 인증 재확인 완료 후에만 새 목록을 읽는다. */
export function onSocialReady(listener: (ready: SocialSessionScope) => void): () => void {
  readyListeners.add(listener);
  return () => readyListeners.delete(listener);
}

/** 화면 소유자가 있을 때만 확인하며 같은 세대의 왕복은 공유한다. */
async function verifyScope(): Promise<SocialSessionScope | null> {
  if (scope !== null) return scope;
  if (verification?.epoch === epoch) return verification.promise;
  const captured = epoch;
  const verify = verifier;
  if (verify === null) return null;
  const promise = (async () => {
    let token: string | null;
    try {
      token = await verify();
    } catch {
      return null;
    }
    if (owners.size === 0 || epoch !== captured || token === null) return null;
    scope = { token, epoch };
    client?.resume?.(scope);
    for (const listener of readyListeners) listener(scope);
    return scope;
  })();
  verification = { epoch: captured, promise };
  try {
    return await promise;
  } finally {
    if (verification?.promise === promise) verification = null;
  }
}

function releaseOwner(owner: symbol): void {
  if (!owners.delete(owner)) return;
  if (owners.size === 0) invalidateSocialSession('closed');
}

/** 범위 편집기는 피드를 활성화하지 않고 자기 소유권만 해제한다. */
export async function acquireSocialSession(): Promise<{
  scope: SocialSessionScope;
  release: () => void;
} | null> {
  const owner = Symbol();
  owners.add(owner);
  const acquired = await verifyScope();
  if (acquired === null || !owners.has(owner)) {
    releaseOwner(owner);
    return null;
  }
  return { scope: acquired, release: () => releaseOwner(owner) };
}

/** 기존 피드 소유권과 Provider의 재확인 왕복을 유지한다. */
export async function activateSocialSession(): Promise<SocialSessionScope | null> {
  if (feedOwner === null) {
    feedOwner = Symbol();
    owners.add(feedOwner);
  }
  if (scope === null && verification?.epoch !== epoch) invalidateSocialSession('activation');
  return verifyScope();
}

/** Provider의 복귀 확인은 새 화면 소유권을 만들지 않는다. */
export async function recheckSocialSession(): Promise<SocialSessionScope | null> {
  return owners.size === 0 ? null : verifyScope();
}

export function deactivateSocialSession(): void {
  if (feedOwner === null) return;
  releaseOwner(feedOwner);
  feedOwner = null;
}

/** 각 호출이 획득한 세대만 승인한다. lazy import 대기 전·후 모두 확인한다. */
export function captureSocialDispatch(): () => boolean {
  const captured = scope;
  return () =>
    owners.size > 0 && captured !== null && scope === captured && epoch === captured.epoch;
}

export function isSocialSessionActive(): boolean {
  return owners.size > 0;
}

/** 테스트 파일 사이에 모듈 전역 상태가 새지 않게 한다. */
export function resetSocialSessionForTest(): void {
  epoch = 0;
  owners.clear();
  feedOwner = null;
  verification = null;
  scope = null;
  verifier = null;
  client = null;
  listeners.clear();
  readyListeners.clear();
}
