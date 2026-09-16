// memory 설정 저장소. 단일 행이고 **기본값을 만들지 않는다** — 없으면 `undefined` 다(ADR-0005).
import { SETTINGS_ID } from '@/domain/theme/settings';

import { liveOne, put, type MemoryTables } from '@/repositories/memory/live';
import type { SettingsRepository } from '@/repositories/settings-repository';

/** 주어진 테이블 묶음 위에서 동작하는 설정 저장소. */
export function createMemorySettingsRepository(tables: MemoryTables): SettingsRepository {
  const table = tables.settings;
  return {
    get: () => liveOne(table, SETTINGS_ID),
    upsert: (settings) => put(table, settings),
  };
}
