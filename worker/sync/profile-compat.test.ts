// ADR-0026: 실제 D1에서 구버전 설정 쓰기와 새 버전의 명시적 프로필 삭제를 구분한다.
import { describe, expect, it } from 'vitest';

import type { SyncOkResponse } from '@/domain/sync/wire';
import type { Settings } from '@/domain/theme/settings';

import { makeSettings } from '@/test/fixtures/settings';

import { handleSync } from './handler';
import { forUser, type UserDb } from '../db/user-db';
import { createD1Fixture, type D1Fixture } from '../test/d1-harness';

const FIRST = '2026-10-01T00:00:00.000Z';
const SECOND = '2026-10-01T00:00:01.000Z';
const PROFILE = {
  profileVersion: 1 as const,
  profileName: '밀리',
  profileBio: '오늘도 한 칸씩',
  profileAvatar: 'data:image/webp;base64,AAAA',
};

async function pushSettings(db: UserDb, row: Settings, version: unknown, baseSeq = 1) {
  const result = await handleSync(
    {
      protocol: 1,
      deviceId: 'writer',
      cursor: 0,
      changes: [{ tbl: 'settings', id: 'default', baseSeq, row }],
      ...(version === undefined ? {} : { settingsProfileVersion: version }),
    },
    db,
    SECOND,
  );
  expect(result.status).toBe(200);
  return result.response as SyncOkResponse;
}

async function pulledSettings(db: UserDb) {
  const result = await handleSync(
    { protocol: 1, deviceId: 'reader-after-redeploy', cursor: 0, changes: [] },
    db,
    SECOND,
  );
  const response = result.response as SyncOkResponse;
  expect(response.pulled).toHaveLength(1);
  return response.pulled[0]!.row;
}

async function withProfile(run: (db: UserDb, fx: D1Fixture) => Promise<void>) {
  const fx = await createD1Fixture();
  try {
    await fx.db
      .prepare('INSERT INTO users (sub, email, created_at) VALUES (?, ?, ?)')
      .bind('profile-owner', 'owner@example.com', FIRST)
      .run();
    const db = forUser(fx.db, 'profile-owner');
    const response = await pushSettings(db, makeSettings({ ...PROFILE, updatedAt: FIRST }), 1, 0);
    expect(response.applied).toHaveLength(1);
    await run(db, fx);
  } finally {
    await fx.dispose();
  }
}

describe('재배포 후 혼합 버전 프로필 보존 (ADR-0026)', () => {
  it.each([undefined, 0, 2, '1'])(
    '지원 표식 %s인 구버전 테마 쓰기는 프로필을 보존한다',
    async (version) => {
      await withProfile(async (db) => {
        // 구버전 화이트리스트는 프로필 세 필드를 뺀 설정을 다시 올린다.
        const response = await pushSettings(
          db,
          makeSettings({ theme: 'dark', updatedAt: SECOND }),
          version,
        );
        expect(response.applied).toHaveLength(1);
        expect(response.rejected).toEqual([]);
        expect(await pulledSettings(db)).toMatchObject({
          ...PROFILE,
          theme: 'dark',
          updatedAt: SECOND,
        });
      });
    },
  );

  it('구버전이 보낸 유효한 프로필 수정은 받고 누락된 소개·사진은 보존한다', async () => {
    await withProfile(async (db) => {
      await pushSettings(
        db,
        makeSettings({ profileName: '새 이름', updatedAt: SECOND }),
        undefined,
      );
      expect(await pulledSettings(db)).toMatchObject({ ...PROFILE, profileName: '새 이름' });
    });
  });

  it.each(['profileName', 'profileBio', 'profileAvatar', 'all'] as const)(
    '새 버전의 %s 삭제는 다음 풀에도 삭제된 채 남는다',
    async (field) => {
      await withProfile(async (db) => {
        const remaining: Partial<typeof PROFILE> = { ...PROFILE };
        if (field === 'all') {
          delete remaining.profileName;
          delete remaining.profileBio;
          delete remaining.profileAvatar;
        } else {
          delete remaining[field];
        }
        const response = await pushSettings(
          db,
          makeSettings({ ...remaining, updatedAt: SECOND }),
          1,
        );
        expect(response.applied).toHaveLength(1);
        const pulled = await pulledSettings(db);
        expect(pulled).toEqual(makeSettings({ ...remaining, updatedAt: SECOND }));
        // 이어지는 구버전 테마 쓰기가 삭제한 필드를 되살리지 않는다.
        await pushSettings(db, makeSettings({ theme: 'dark', updatedAt: SECOND }), undefined);
        expect(await pulledSettings(db)).toEqual(
          makeSettings({ ...remaining, theme: 'dark', updatedAt: SECOND }),
        );
      });
    },
  );

  it('오래된 구버전 요청은 LWW에 따라 거절하며 프로필·테마를 바꾸지 않는다', async () => {
    await withProfile(async (db) => {
      const response = await pushSettings(
        db,
        makeSettings({ theme: 'dark', updatedAt: '2026-09-30T23:59:59.000Z' }),
        undefined,
      );
      expect(response.applied).toEqual([]);
      expect(response.rejected[0]?.reason).toBe('stale');
      expect(await pulledSettings(db)).toMatchObject({
        ...PROFILE,
        theme: 'system',
        updatedAt: FIRST,
      });
    });
  });

  it('다른 계정의 구버전 설정 쓰기에 프로필이 섞이지 않는다', async () => {
    await withProfile(async (db, fx) => {
      await fx.db
        .prepare('INSERT INTO users (sub, email, created_at) VALUES (?, ?, ?)')
        .bind('other-owner', 'other@example.com', FIRST)
        .run();
      const other = forUser(fx.db, 'other-owner');
      await pushSettings(other, makeSettings({ updatedAt: FIRST }), undefined, 0);
      await pushSettings(other, makeSettings({ theme: 'dark', updatedAt: SECOND }), undefined);
      expect(await pulledSettings(other)).toEqual(
        makeSettings({ theme: 'dark', updatedAt: SECOND }),
      );
      expect(await pulledSettings(db)).toMatchObject(PROFILE);
    });
  });

  it('구버전 툼스톤·부활 요청에는 지운 프로필을 붙이지 않는다', async () => {
    await withProfile(async (db) => {
      await pushSettings(db, makeSettings({ deletedAt: FIRST, updatedAt: FIRST }), undefined);
      expect(await pulledSettings(db)).toEqual(
        makeSettings({ deletedAt: FIRST, updatedAt: FIRST }),
      );
      await pushSettings(db, makeSettings({ updatedAt: SECOND }), undefined);
      expect(await pulledSettings(db)).toEqual(makeSettings({ updatedAt: SECOND }));
    });
  });

  it('업데이트 전 대기하던 표식 없는 행은 새 클라이언트가 올려도 보존한다', async () => {
    await withProfile(async (db) => {
      await pushSettings(db, makeSettings({ theme: 'dark', updatedAt: SECOND }), 1);
      expect(await pulledSettings(db)).toMatchObject({ ...PROFILE, theme: 'dark' });
      // 자기 기기에서 올린 설정이고 커서보다 오래돼도 업데이트 첫 수신에는 포함한다.
      const result = await handleSync(
        {
          protocol: 1,
          settingsProfileVersion: 1,
          includeOwnSettings: true,
          deviceId: 'writer',
          cursor: 100,
          changes: [],
        },
        db,
        SECOND,
      );
      const response = result.response as SyncOkResponse;
      expect(response.cursor).toBe(100);
      expect(response.pulled).toHaveLength(1);
      expect(response.pulled[0]!.row).toMatchObject(PROFILE);
    });
  });
});
