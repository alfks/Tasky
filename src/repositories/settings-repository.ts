// 설정 저장소 계약 (TECH_PLAN §6). 고정 id `'default'` 단일 행만 다룬다.
import type { Persistable } from '@/domain/meta';
import type { Settings } from '@/domain/theme/settings';

/**
 * 설정 저장소. **레포지토리는 값을 만들지 않는다** — 행이 없으면 `undefined` 이고, 기본값은 도메인
 * `createSettings(deps)` 로 만들어 호출처가 `upsert` 한다(ADR-0005 갱신 규칙, TECH_PLAN §6).
 */
export interface SettingsRepository {
  /** 단일 설정 행. 없거나 툼스톤이면 `undefined`. */
  get(): Promise<Settings | undefined>;
  /** 도메인 함수가 만든 값만 저장한다. */
  upsert(settings: Persistable<Settings>): Promise<void>;
}
