// 설정 저장소 계약. 단일 행(id: 'default')만 다룬다.
import type { Persistable } from '@/domain/meta';
import type { Settings } from '@/domain/theme/settings';

/** 설정 저장소. 레포지토리는 값을 만들지 않는다 — 행이 없으면 undefined 다 (ADR-0005 · TECH_PLAN §6). */
export interface SettingsRepository {
  /** 단일 설정 행. 없거나 툼스톤이면 undefined — 기본값 생성은 도메인(createSettings)이 하고 호출처가 upsert 한다. */
  get(): Promise<Settings | undefined>;
  /** 도메인 함수가 만든 값만 저장한다. */
  upsert(settings: Persistable<Settings>): Promise<void>;
}
