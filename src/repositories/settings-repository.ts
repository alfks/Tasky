// 설정 저장소 계약. 단일 행(id: 'default')만 다룬다.
import type { Persistable } from '@/domain/meta';
import type { Settings } from '@/domain/theme/settings';

/** 설정 저장소. get() 은 행이 없으면 기본 행을 만들어 반환한다(단일 행 보장). */
export interface SettingsRepository {
  /** 단일 설정 행. 없으면 기본값으로 생성해 반환한다. */
  get(): Promise<Settings>;
  /** 도메인 함수가 만든 값만 저장한다. */
  upsert(settings: Persistable<Settings>): Promise<void>;
}
