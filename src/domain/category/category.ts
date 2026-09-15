// 카테고리 엔티티 타입 (docs/ARCHITECTURE.md §4, TECH_PLAN §5). 규칙 함수는 category.rules.ts, 삭제 계획은 removal.ts.
import type { Meta } from '@/domain/meta';

/**
 * 카테고리 상태 (category R7). 전이는 `active ⇄ completed`·`active ⇄ paused`·`completed ⇄ paused` 이고
 * 자동 전이는 없다. 활성을 떠날 때 `closedAt` 을 기록하고 돌아오면 제거한다.
 */
export type CategoryStatus = 'active' | 'completed' | 'paused';

/** 색상을 가진 투두 묶음 (예: 공부, 운동). 색을 고르는 유일한 곳이다. */
export type Category = Meta & {
  /** 사용자가 입력한 이름. 앞뒤 공백 제거 후 1~20자 (category R1). */
  name: string;
  /** 팔레트 12색 중 하나의 라이트 HEX(대문자). 정보 전달은 텍스트가 병행한다 (category R3, theme §3-C). */
  color: string;
  /** 이름 앞에 붙는 선택적 이모지. 0 또는 1 grapheme (category R4). */
  emoji?: string;
  /** 활성 목록에서의 표시 순서. 종료된 카테고리는 활성 목록에 없다 (category R5·R8). */
  order: number;
  /** 활성 / 완료로 종료 / 중단으로 종료 (category R7). */
  status: CategoryStatus;
  /** 활성을 떠난 시각(ISO UTC). 종료 섹션 정렬 키이고 재개하면 제거된다 (category R8·R9). */
  closedAt?: string;
};
