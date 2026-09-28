import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./social/limits', () => ({ collectSocialGarbage: vi.fn() }));

import worker from './index';
import { collectSocialGarbage } from './social/limits';

import type { Env } from './env';

const NOW = 1_800_000_000_000;
const cleanup = vi.mocked(collectSocialGarbage);
const env = { DB: {} as D1Database } as Env;
const controller = { scheduledTime: NOW } as ScheduledController;

function context() {
  const waitUntil = vi.fn((pending: Promise<unknown>) => {
    void pending.catch(() => undefined);
  });
  return { waitUntil } as unknown as ExecutionContext & { waitUntil: typeof waitUntil };
}

describe('scheduled social garbage entry', () => {
  beforeEach(() => cleanup.mockReset());

  it('호출마다 공개 bounded helper 한 번을 runtime 수명에 연결한다', async () => {
    cleanup.mockResolvedValue(17);
    const ctx = context();
    await worker.scheduled(controller, env, ctx);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledWith(env.DB, NOW);
    expect(ctx.waitUntil).toHaveBeenCalledOnce();
    await expect(ctx.waitUntil.mock.calls[0][0]).resolves.toBe(17);
  });
});
