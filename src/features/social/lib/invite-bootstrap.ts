import { isInviteToken } from '@/domain/social/input';

const STORAGE_KEY = 'tasky.social.invite.v1';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

type PendingInvite = { token: string; expiresAt: number };
type InviteWindow = Window & {
  __taskyIncomingInvite?: PendingInvite;
  __taskyInvalidInvite?: boolean;
};

export type InviteBootstrap = { kind: 'invite'; token: string } | { kind: 'invalid' };

let pending: PendingInvite | null = null;
let invalid = false;
let active: InviteBootstrap | null | undefined;
let activeUntil = 0;

function valid(value: unknown): value is PendingInvite {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const now = Date.now();
  return (
    Object.keys(candidate).length === 2 &&
    isInviteToken(candidate.token) &&
    typeof candidate.expiresAt === 'number' &&
    Number.isFinite(candidate.expiresAt) &&
    candidate.expiresAt > now &&
    candidate.expiresAt <= now + MAX_AGE_MS
  );
}

/** head inline script가 URL을 지운 뒤 남긴 탭 메모리만 가져온다. */
function captureEarlyInvite(): void {
  if (typeof window === 'undefined') return;
  const source = window as InviteWindow;
  const incoming = source.__taskyIncomingInvite;
  const incomingInvalid = source.__taskyInvalidInvite;
  delete source.__taskyIncomingInvite;
  delete source.__taskyInvalidInvite;
  if (incoming !== undefined) {
    pending = valid(incoming) ? incoming : null;
    invalid = pending === null;
    active = undefined;
  } else if (incomingInvalid) {
    pending = null;
    invalid = true;
    active = undefined;
  }
}

/** 저장값은 파싱하기 전에 먼저 없애고, 신선한 URL 초대가 있으면 그쪽을 우선한다. */
function takeStoredInvite(): PendingInvite | null {
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(STORAGE_KEY);
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return valid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** 로그인 버튼의 동기 click 경로에서만 영속 저장한다. 실패면 이동을 막고 안내한다. */
export function prepareInviteLogin(withoutInvite = false): boolean {
  captureEarlyInvite();
  if (withoutInvite) {
    // 명시적으로 초대를 버린 뒤에는 Storage 접근이 막혀도 일반 로그인은 진행할 수 있다.
    // 삭제 실패를 성공으로 해석하지 않으며, 이 문서의 메모리 초대는 이미 비웠다.
    clearPendingInvite();
    return true;
  }
  if (invalid) {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return true;
    } catch {
      return false;
    }
  }
  if (pending === null) return true;
  if (!valid(pending)) {
    pending = null;
    invalid = true;
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return true;
    } catch {
      return false;
    }
  }
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
    return true;
  } catch {
    return false;
  }
}

/** 저장값은 한 번만 소비하고 메모리 결과를 유지해 StrictMode 재호출도 안전하게 한다. */
export function consumeInviteAfterReady(): InviteBootstrap | null {
  captureEarlyInvite();
  if (active !== undefined) {
    if (activeUntil !== 0 && activeUntil <= Date.now()) {
      active = { kind: 'invalid' };
      activeUntil = 0;
    }
    return active;
  }
  const fresh = pending;
  const freshInvalid = invalid;
  pending = null;
  invalid = false;
  const stored = takeStoredInvite();
  const chosen = fresh ?? stored;
  activeUntil = chosen?.expiresAt ?? 0;
  active =
    freshInvalid || (fresh !== null && !valid(fresh))
      ? { kind: 'invalid' }
      : chosen === null
        ? null
        : { kind: 'invite', token: chosen.token };
  return active;
}

export function clearPendingInvite(): boolean {
  pending = null;
  invalid = false;
  active = null;
  activeUntil = 0;
  if (typeof window === 'undefined') return true;
  const source = window as InviteWindow;
  delete source.__taskyIncomingInvite;
  delete source.__taskyInvalidInvite;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

captureEarlyInvite();
