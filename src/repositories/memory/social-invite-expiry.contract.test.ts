import { describe, expect, it } from 'vitest';

import { createMemorySocialServer } from '@/repositories/memory/social-repository';

const START = Date.UTC(2026, 8, 30);
const DAY = 86_400_000;

async function fixture() {
  let now = START;
  let nonce = 0;
  const server = createMemorySocialServer({ now: () => now });
  const owner = server.forActor('owner');
  const guest = server.forActor('guest');
  const profile = (await owner.createProfile({ nickname: '주인' })).data;
  await guest.createProfile({ nickname: '손님' });
  const key = () => ({ key: `v1.${now}.${(++nonce).toString(16).padStart(32, '0')}` });
  const originalKey = key();
  const invite = (await owner.createInvite(originalKey)).data;
  if (!('token' in invite)) throw new Error('first creation must return a token');
  return {
    server,
    owner,
    guest,
    profile,
    key,
    originalKey,
    invite,
    at: (time: number) => (now = time),
  };
}

describe('memory invitation token expires at 24 hours / R2-04', () => {
  it('24h 직전 초대는 사용할 수 있고 별도 친구 요청은 여전히 7일간 유효하다', async () => {
    const f = await fixture();
    expect(f.invite.expiresAt).toBe(START + DAY);
    f.at(START + DAY - 1);
    expect((await f.owner.invites()).data.items[0].status).toBe('active');
    expect((await f.guest.previewInvite({ token: f.invite.token })).data).toEqual({
      nickname: '주인',
      expiresAt: START + DAY,
    });
    await f.guest.sendRequest({ token: f.invite.token }, f.key());
    const request = (await f.guest.requests('outgoing')).data.items[0];
    expect(request.expiresAt).toBe(START + DAY - 1 + 7 * DAY);
    expect((await f.owner.invites()).data.items[0].status).toBe('used');
    f.at(request.expiresAt - 1);
    expect((await f.guest.requests('outgoing')).data.items).toHaveLength(1);
    f.at(request.expiresAt);
    expect((await f.guest.requests('outgoing')).data.items).toEqual([]);
  });

  it.each([0, 1])(
    '24h +%dms 만료는 preview/send를 거부하고 active5 공간을 회복한다',
    async (offset) => {
      const f = await fixture();
      for (let index = 0; index < 4; index += 1) await f.owner.createInvite(f.key());
      await expect(f.owner.createInvite(f.key())).rejects.toMatchObject({ code: 'limit-reached' });
      const counterKey = `${f.profile.id}:invite-create`;
      expect(f.server.state.successfulCreates.get(counterKey)?.count).toBe(5);
      f.at(START + DAY + offset);
      await expect(f.guest.previewInvite({ token: f.invite.token })).rejects.toMatchObject({
        code: 'unavailable',
      });
      await expect(f.guest.sendRequest({ token: f.invite.token }, f.key())).rejects.toMatchObject({
        code: 'unavailable',
      });
      expect(f.server.state.pairs.size).toBe(0);
      expect(
        [...f.server.state.invites.values()].every((invite) => invite.status === 'active'),
      ).toBe(true);
      expect((await f.owner.invites()).data.items.map((invite) => invite.status)).toEqual(
        Array(5).fill('expired'),
      );
      // Expiry/refused use did not refund the previous UTC day's accepted creations.
      expect(f.server.state.successfulCreates.get(counterKey)?.count).toBe(5);
      const fresh = (await f.owner.createInvite(f.key())).data;
      expect('token' in fresh && fresh.expiresAt).toBe(START + 2 * DAY + offset);
      expect(f.server.state.successfulCreates.get(counterKey)).toEqual({
        windowStart: START + DAY,
        count: 1,
      });
    },
  );

  it('만료 뒤 성공 receipt 재생은 원래 만료시각·초대·생성량을 연장하거나 늘리지 않는다', async () => {
    const f = await fixture();
    f.at(START + DAY);
    const replay = (await f.owner.createInvite(f.originalKey)).data;
    expect(replay).toMatchObject({ tokenUnavailable: true });
    expect(f.server.state.invites.size).toBe(1);
    expect([...f.server.state.invites.values()][0].expiresAt).toBe(START + DAY);
    expect((await f.owner.invites()).data.items[0].status).toBe('expired');
    expect(f.server.state.successfulCreates.get(`${f.profile.id}:invite-create`)).toEqual({
      windowStart: START,
      count: 1,
    });
  });
});
