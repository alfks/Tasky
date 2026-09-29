// 앱 설정 엔티티 타입 (docs/ARCHITECTURE.md §4, TECH_PLAN §5). 단일 행이며 삭제되지 않는다.
import type { Meta } from '@/domain/meta';

/** 라이트/다크/시스템 세 가지 테마 모드. 기본값은 `'system'` (theme R6). */
export type ThemeMode = 'light' | 'dark' | 'system';

/** `Settings` 단일 행의 고정 id (ADR-0005 규칙 1). */
export const SETTINGS_ID = 'default';

/** 앱 전역 설정. 고정 id 'default' 한 행만 존재하고 `deletedAt` 은 설정되지 않는다 (ADR-0005 규칙 1). */
export type Settings = Meta & {
  /** 항상 'default'. */
  id: typeof SETTINGS_ID;
  /** 선택된 테마 모드. */
  theme: ThemeMode;
  /** 강조색. 팔레트 12색의 라이트 HEX 를 저장하고 다크 모드는 같은 프리셋의 다크 값을 쓴다 (theme R3). */
  accentColor: string;
  /** 첫 실행 시드를 수행한 시각. 있으면 다시 시드하지 않는다 (category R18). */
  seededAt?: string;
  /** 마지막 백업 내보내기 시각 (backup R10). */
  lastBackupAt?: string;
  /** 프로필 이름 — 다듬은 뒤 1~20자, 없음 = 미설정 (profile.md R1, ADR-0023). */
  profileName?: string;
  /** 한 줄 소개 — 0~60자 (profile.md R2). */
  profileBio?: string;
  /** 사진 — 클라이언트가 96px 로 줄인 `data:image/webp|jpeg;base64,…` ≤ 16,384자 (profile.md R5). */
  profileAvatar?: string;
};
