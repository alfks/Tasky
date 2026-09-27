import { actorAccess } from '@/domain/social/access';
import type { ActorFacts, SocialErrorCode, SocialId } from '@/domain/social/social';

export type CommandReceipt = {
  actorId: SocialId;
  key: string;
  requestHash: string;
  executionNonce: string;
  resultCode: 'ok' | SocialErrorCode;
  resourceId: SocialId | null;
  resultVersion: number | null;
};
export type CommandAttempt =
  | { kind: 'execute' }
  | { kind: 'replay'; receipt: CommandReceipt }
  | { kind: 'reject'; code: SocialErrorCode };
export type CommandResult =
  | { ok: true; resourceId: SocialId | null; resultVersion: number | null; didApply: boolean }
  | { ok: false; code: SocialErrorCode };

const KEY_PATTERN = /^v1\.(\d{13})\.([0-9a-f]{32})$/u;
const PAST_MS = 24 * 60 * 60 * 1000;
const FUTURE_MS = 5 * 60 * 1000;

/** 검증된 평평한 DTO를 서버가 해시하기 직전의 정규형으로 만든다. 해시 계산은 어댑터 책임이다. */
export function canonicalCommandRequest(
  method: string,
  path: string,
  schemaVersion: number,
  dto: Readonly<Record<string, string | number | boolean | null>>,
): string {
  const fields = Object.entries(dto).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify([method, path, schemaVersion, fields]);
}

/** 문법과 신규 실행의 시각 허용을 분리한다. 기존 receipt는 24시간 이후에도 조회한다. */
export function keyTimestamp(key: unknown): number | null {
  if (typeof key !== 'string') return null;
  const match = KEY_PATTERN.exec(key);
  return match === null ? null : Number(match[1]);
}

export function isFreshNewKey(timestamp: number, nowMs: number): boolean {
  return (
    Number.isSafeInteger(nowMs) && timestamp >= nowMs - PAST_MS && timestamp <= nowMs + FUTURE_MS
  );
}

/** receipt의 고유 범위는 actor+key이며 method/path/schema/DTO는 서버 requestHash에 포함한다. */
export function planCommandAttempt(
  actor: ActorFacts,
  key: unknown,
  requestHash: string,
  nowMs: number,
  receipt: CommandReceipt | undefined,
): CommandAttempt {
  const access = actorAccess(actor);
  if (!access.allowed) return { kind: 'reject', code: access.code };
  const timestamp = keyTimestamp(key);
  if (timestamp === null) return { kind: 'reject', code: 'validation' };
  if (receipt !== undefined && receipt.actorId === actor.actorId && receipt.key === key) {
    if (receipt.requestHash !== requestHash) {
      return { kind: 'reject', code: 'idempotency-conflict' };
    }
    return { kind: 'replay', receipt };
  }
  if (!isFreshNewKey(timestamp, nowMs)) return { kind: 'reject', code: 'request-expired' };
  return { kind: 'execute' };
}

/** SQL 0행은 성공이 아니다. 새 nonce와 일치한 ok receipt만 효과 적용을 주장한다. */
export function readCommandResult(
  actor: ActorFacts,
  key: string,
  requestHash: string,
  nonce: string,
  receipt: CommandReceipt | undefined,
): CommandResult {
  const access = actorAccess(actor);
  if (!access.allowed) return { ok: false, code: access.code };
  if (receipt === undefined || receipt.actorId !== actor.actorId || receipt.key !== key) {
    return { ok: false, code: 'unavailable' };
  }
  if (receipt.requestHash !== requestHash) return { ok: false, code: 'idempotency-conflict' };
  if (receipt.resultCode !== 'ok') return { ok: false, code: receipt.resultCode };
  return {
    ok: true,
    resourceId: receipt.resourceId,
    resultVersion: receipt.resultVersion,
    didApply: receipt.executionNonce === nonce,
  };
}
