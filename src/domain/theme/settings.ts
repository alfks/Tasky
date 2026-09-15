// 앱 설정 엔티티 타입 (docs/ARCHITECTURE.md §4). 단일 행이며 삭제되지 않는다.
import type { Meta } from '@/domain/meta';

/** 라이트/다크/시스템 세 가지 테마 모드. */
export type ThemeMode = 'light' | 'dark' | 'system';

/** 앱 전역 설정. 고정 id 'default' 한 행만 존재한다 (ADR-0005 규칙 1). */
export type Settings = Meta & {
  /** 항상 'default'. */
  id: 'default';
  /** 선택된 테마 모드. */
  theme: ThemeMode;
  /** 강조색(CSS 색 문자열). --color-accent 로 주입된다. */
  accentColor: string;
};
