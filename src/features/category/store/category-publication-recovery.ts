import type { Category } from '@/domain/category/category';
import type { SocialCategoryInput } from '@/domain/social/social';

import type { SocialRepository } from '@/repositories/social-repository';

import {
  publicationError,
  publicationErrorCode,
} from '@/features/category/store/category-publication-contract';

export type PublicationIntent =
  | { kind: 'save'; input: SocialCategoryInput; original: Category }
  | {
      kind: 'revoke';
      input: { id: string; expectedVersion: number };
      original?: Category;
      originals?: readonly Category[];
    };
export type PublicationEntry = {
  readonly actor: string;
  readonly namespace: string;
  readonly key: string;
  readonly intent: PublicationIntent;
  status: 'submitting' | 'uncertain';
  observer: number;
  wasUncertain: boolean;
  blocked: 'request-expired' | 'idempotency-conflict' | null;
};
/** 관측 수명과 이미 제출한 명령의 수명을 분리한다. 영속 저장·자동 전송은 없다. */
export function createPublicationRecovery() {
  let actor: string | null = null;
  let locked = true;
  let epoch = 0;
  const entries = new Map<string, PublicationEntry>();
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  function purge() {
    epoch += 1;
    actor = null;
    locked = true;
    entries.clear();
    notify();
  }
  function lock(reason: string) {
    if (reason === 'account' || reason === 'account-deleted') {
      purge();
      return;
    }
    epoch += 1;
    locked = true;
    for (const entry of entries.values()) {
      entry.status = 'uncertain';
      entry.wasUncertain = true;
      entry.observer += 1;
    }
    notify();
  }
  function verifyActor(next: string, proof: number, allowed: () => boolean): boolean {
    if (proof !== epoch || !allowed()) return false;
    if (actor !== null && actor !== next) {
      entries.clear();
      epoch += 1;
    }
    actor = next;
    locked = false;
    notify();
    return true;
  }
  function get(namespace: string): PublicationEntry | null {
    return locked ? null : (entries.get(namespace) ?? null);
  }
  function reserve(
    namespace: string,
    intent: PublicationIntent,
    key: () => string,
  ): PublicationEntry {
    if (actor === null || locked) throw publicationError('unauthorized');
    const previous = entries.get(namespace);
    if (previous !== undefined) {
      if (
        JSON.stringify(previous.intent.input) !== JSON.stringify(intent.input) ||
        previous.intent.kind !== intent.kind
      )
        throw publicationError('request-pending');
      if (previous.status === 'submitting') throw publicationError('request-pending');
      return previous;
    }
    if (entries.size >= 32) throw publicationError('limit-reached');
    const immutable = Object.freeze({
      ...intent,
      input: Object.freeze({ ...intent.input }),
      ...(intent.original ? { original: Object.freeze({ ...intent.original }) } : {}),
      ...(intent.kind === 'revoke' && intent.originals
        ? { originals: Object.freeze(intent.originals.map((item) => Object.freeze({ ...item }))) }
        : {}),
    }) as PublicationIntent;
    const entry: PublicationEntry = {
      actor,
      namespace,
      key: key(),
      intent: immutable,
      status: 'uncertain',
      observer: 0,
      wasUncertain: false,
      blocked: null,
    };
    entries.set(namespace, entry);
    notify();
    return entry;
  }
  function begin(entry: PublicationEntry) {
    if (entry.blocked !== null) throw publicationError(entry.blocked);
    if (
      locked ||
      actor !== entry.actor ||
      entries.get(entry.namespace) !== entry ||
      entry.status === 'submitting'
    )
      throw publicationError('request-pending');
    const captured = epoch;
    const observer = ++entry.observer;
    entry.status = 'submitting';
    notify();
    return () =>
      !locked &&
      epoch === captured &&
      actor === entry.actor &&
      entries.get(entry.namespace) === entry &&
      entry.observer === observer;
  }
  function uncertain(entry: PublicationEntry, allowed: () => boolean) {
    if (allowed()) {
      entry.status = 'uncertain';
      entry.wasUncertain = true;
      entry.observer += 1;
      notify();
    }
  }
  function resolved(entry: PublicationEntry, allowed: () => boolean) {
    if (allowed()) {
      entries.delete(entry.namespace);
      notify();
    }
  }
  return {
    purge,
    lock,
    verifyActor,
    get,
    reserve,
    begin,
    uncertain,
    resolved,
    proof: () => epoch,
    actor: () => (locked ? null : actor),
    list: () => (locked ? [] : [...entries.values()]),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
export type PublicationRecovery = ReturnType<typeof createPublicationRecovery>;
export const publicationRecovery = /* @__PURE__ */ createPublicationRecovery();

export type PublicationObservation<T> =
  { type: 'success'; value: T } | { type: 'error'; error: unknown } | { type: 'uncertain' };
/** 요청을 중단했다고 주장하지 않고 15초 이후의 관측 결과만 폐기한다. */
export function observePublication<T>(command: () => Promise<T>) {
  let finish!: (result: PublicationObservation<T>) => void;
  let settled = false;
  const promise = new Promise<PublicationObservation<T>>((resolve) => {
    finish = resolve;
  });
  const settle = (result: PublicationObservation<T>) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    finish(result);
  };
  const timer = setTimeout(() => settle({ type: 'uncertain' }), 15_000);
  try {
    void command().then(
      (value) => settle({ type: 'success', value }),
      (error) => settle({ type: 'error', error }),
    );
  } catch (error) {
    settle({ type: 'error', error });
  }
  return { promise, cancel: () => settle({ type: 'uncertain' }) };
}

/** 같은 불변 명령을 다시 확인하고 결과 적용은 해당 관측에만 허용한다. */
export function startPublicationCommand(
  entry: PublicationEntry,
  recovery: PublicationRecovery,
  repository: SocialRepository,
  scopeAllowed: () => boolean,
) {
  const lease = recovery.begin(entry);
  const allowed = () => lease() && scopeAllowed();
  const command = entry.intent;
  const observation = observePublication(() =>
    command.kind === 'save'
      ? repository.saveCategory(command.input, { key: entry.key })
      : repository.revokeCategory(command.input, { key: entry.key }),
  );
  const promise = observation.promise.then((result) => {
    if (!allowed()) {
      recovery.uncertain(entry, lease);
      return { type: 'stale' as const };
    }
    if (result.type === 'success')
      return {
        type: 'success' as const,
        canonical:
          command.kind === 'revoke' || result.value.data.revoked === true
            ? null
            : result.value.data,
        allowed,
        resolve: () => recovery.resolved(entry, allowed),
      };
    const code = result.type === 'uncertain' ? 'temporary' : publicationErrorCode(result.error);
    const uncertain =
      code === 'temporary' ||
      code === 'request-pending' ||
      code === 'idempotency-conflict' ||
      (entry.wasUncertain &&
        ['rate-limited', 'csrf', 'request-expired', 'social-disabled', 'validation'].includes(
          code,
        ));
    if (uncertain && (code === 'request-expired' || code === 'idempotency-conflict'))
      entry.blocked = code;
    if (uncertain) recovery.uncertain(entry, allowed);
    else if (code === 'unauthorized' || code === 'account-deleted') recovery.lock(code);
    else recovery.resolved(entry, allowed);
    return { type: 'error' as const, code, uncertain };
  });
  return {
    promise,
    cancel: () => {
      observation.cancel();
      recovery.uncertain(entry, lease);
    },
  };
}
