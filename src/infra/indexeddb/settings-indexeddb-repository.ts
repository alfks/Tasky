// IndexedDB 설정 저장소. 단일 행이고 **기본값을 만들지 않는다** — 없으면 `undefined` 다(ADR-0005).
import { SETTINGS_ID } from '@/domain/theme/settings';

import type { SettingsRepository } from '@/repositories/settings-repository';

import { liveOne, put, type Store } from '@/infra/indexeddb/query';

/** Dexie 테이블 위에서 동작하는 설정 저장소. 키는 언제나 `SETTINGS_ID` 하나다. */
export function createIndexedDbSettingsRepository(store: Store): SettingsRepository {
  const table = store.settings;
  return {
    get: () => liveOne(table, SETTINGS_ID),
    upsert: (settings) => put(table, settings),
  };
}
