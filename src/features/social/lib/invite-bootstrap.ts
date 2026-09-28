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
let clearRequired = false;

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
/** 한 개의 저장 키를 지우거나 유효하지 않은 값으로 덮어써 폐기를 확인한다. */
function durableClear(): boolean {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, 'null');
      return true;
    } catch {
      try {
        return window.sessionStorage.getItem(STORAGE_KEY) === null;
      } catch {
        return false;
      }
    }
  }
}

function takeStoredInvite(): PendingInvite | null {
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    clearRequired = true;
    return null;
  }
  if (raw === null) return null;
  if (!durableClear()) {
    clearRequired = true;
    return null;
  }
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
  if (clearRequired) {
    if (!durableClear()) return false;
    clearRequired = false;
  }
  if (withoutInvite) {
    return clearPendingInvite();
  }
  if (invalid) return clearPendingInvite();
  // 로그아웃/계정 교체 후 남은 키도 일반 로그인 전에 제거한다.
  if (pending === null) return durableClear();
  if (!valid(pending)) {
    return clearPendingInvite();
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
  if (clearRequired) {
    if (!durableClear()) return null;
    clearRequired = false;
  }
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
  if (clearRequired) {
    active = null;
    return null;
  }
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
  const cleared = durableClear();
  clearRequired = !cleared;
  return cleared;
}

/** head의 hashchange scrub가 원문 없이 알린 뒤, 현재 화면만 새 초대를 소비한다. */
export function onIncomingInvite(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const receive = () => {
    captureEarlyInvite();
    callback();
  };
  window.addEventListener('tasky:social-invite', receive);
  return () => window.removeEventListener('tasky:social-invite', receive);
}

captureEarlyInvite();
