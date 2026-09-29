// 투두 화면의 한국어 문구 (todo.md §2·§5). 세 곳 이상에서 쓰이거나 테스트가 문면을 고정해야 하는
// 문자열만 모은다(code-style §3) — 한 컴포넌트에서만 쓰는 문구는 그 컴포넌트에 직접 적는다.
//
// 저장 실패·검증 실패 문구는 여기 없다. 그쪽 단일 소스는 `domain/errors.ts` 와
// `store/todo-state.ts#SAVE_FAILED` 이고, 화면은 스토어의 `error` 를 그대로 보여 준다 — 복제하면
// 도메인 규칙을 고쳤을 때 화면만 옛 문구를 계속 말한다.
//
// 목적격 조사(을/를)는 `@/lib/korean#objectParticle` 이다 — category 의 삭제 확인·되돌리기 문구도
// 같은 규칙을 쓴다(T-87, `features/AGENTS.md` 규칙 5).
import type { RoutineRecurrence } from '@/domain/todo/routine.rules';

import { objectParticle } from '@/lib/korean';

const WEEKDAY_SHORT_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/**
 * 반복 패턴을 사람이 읽는 문구로 ("매주 금·토", "매달 1·15일", routine.md §5). 투두 행의 🔁 배지
 * (`TodoItem`)와 관리 화면(T-83)이 함께 읽는다 — 단일 소스가 여기인 이유는 두 화면이 같은 문구를
 * 말해야 하기 때문이다(그 말고는 순수 표기라 `domain/routine/` 이 아니라 여기 둔다, AGENTS.md).
 */
export function describeRoutineRecurrence(recurrence: RoutineRecurrence): string {
  if (recurrence.type === 'weekly') {
    const days = [...recurrence.daysOfWeek]
      .sort((a, b) => a - b)
      .map((day) => WEEKDAY_SHORT_LABELS[day]);
    return `매주 ${days.join('·')}`;
  }
  const days = [...recurrence.daysOfMonth].sort((a, b) => a - b);
  return `매달 ${days.join('·')}일`;
}

/** 피커 힌트에 남기는 제목 글자 수 — 280px 패널 한 줄(`--text-xs`)에 질문까지 들어가는 폭. */
const PICK_DATE_TITLE_MAX = 14;

export const TODO_MESSAGES = {
  /** 입력 행을 여는 버튼 (§2-A). */
  addButton: '+ 할 일 추가',
  addPlaceholder: '할 일을 입력하고 Enter',
  /** 입력 행의 접근 이름 (§5). */
  addLabel: (categoryName: string): string => `${categoryName}에 할 일 추가`,
  /** 항목 목록(`ul`)의 접근 이름 — 그룹 영역·제목과 같은 문자열이면 셋이 구별되지 않는다. */
  listLabel: (name: string): string => `${name} 할 일`,
  /** 그룹 접기/펼치기 토글의 접근 이름 (R22) — 다음에 누르면 할 동작을 말한다. */
  collapseGroup: (name: string): string => `${name} 접기`,
  expandGroup: (name: string): string => `${name} 펼치기`,
  /** 완료 블록 구분선 (§2-A·§5). */
  doneDivider: (count: number): string => `완료 ${count}`,
  /** 이동이 끝난 뒤 1회 낭독 (§5). */
  movedDown: '완료됨, 아래로 이동',
  movedUp: '완료 해제됨, 위로 이동',
  /** 순서 변경 결과 낭독 (§5 — 드래그의 키보드 대안이 결과를 말해 준다). */
  reordered: (title: string, position: number): string =>
    `${title}${objectParticle(title)} ${position}번째로 옮겼어요`,
  /** 더 옮길 이웃이 없을 때. 아무 일도 안 일어난 것과 실패를 구분해 준다. */
  reorderEdge: '더 옮길 곳이 없어요',
  /** 삭제 확인 (R13, app-shell R14). */
  deleteTitle: (title: string): string => `'${title}'${objectParticle(title)} 삭제할까요?`,
  deleteDescription: '삭제한 할 일은 목록에서 사라져요.',
  deleted: '삭제했어요',
  /** 날짜 이동 토스트 (R10). 되돌리기는 **대상 그룹 끝**으로 돌아가므로 "원래대로" 라고 하지 않는다. */
  movedToDate: (label: string): string => `${label}로 옮겼어요`,
  undo: '되돌리기',
  /**
   * 삭제된 카테고리 그룹 (R16·category R17). `deletedCategory` 는 tombstone 마저 못 찾았을 때만
   * 쓰는 **최후의 폴백**이다 — 보통은 `deletedCategoryName` 이 실제 이름을 쓴다(category R22).
   */
  deletedCategory: '삭제된 카테고리',
  deletedCategoryName: (name: string): string => `${name} (삭제됨)`,
  readOnlyHint: '삭제된 카테고리의 할 일이에요. 옮기거나 지울 수만 있어요.',
  /** 항목 메뉴 (§2-A). */
  menuLabel: (title: string): string => `${title} 메뉴`,
  menuEdit: '수정',
  menuMemo: '메모 추가',
  /** 이 투두를 대상으로 집중 타이머를 시작한다(timer.md §2 진입점, 사용자 결정 — 메인 화면
   *  상시 "집중" 섹션 대신 항목 메뉴로 진입). */
  menuTimer: '타이머 시작',
  menuTomorrow: '내일로',
  menuPickDate: '날짜 바꾸기…',
  /**
   * "날짜 바꾸기…" 가 여는 일 피커 위 한 줄 안내(R10-b) — 피커가 행을 가려도 무엇을 옮기는지 남긴다.
   * 제목이 길면 **제목 쪽을** 자른다 — 한 줄 고정(자리표시자 높이)에서 잘리는 것이 질문이면 안 된다.
   */
  pickDateHint: (title: string): string => {
    const clamped =
      title.length > PICK_DATE_TITLE_MAX ? `${title.slice(0, PICK_DATE_TITLE_MAX)}…` : title;
    return `'${clamped}'${objectParticle(clamped)} 어느 날로 옮길까요?`;
  },
  menuMoveCategory: '다른 카테고리로 옮기기',
  menuDelete: '삭제',
  /** 메모·집중 시간 표시 (R19). */
  hasMemo: '메모 있음',
  focusChip: (minutes: number): string => `⏱ ${minutes}분`,
  focusLabel: (minutes: number): string => `집중 ${minutes}분`,
  /**
   * 루틴 등록 (R21). 다이얼로그 안의 필드 라벨(제목·메모·카테고리·시작일·종료일·반복 주기·반복
   * 요일·반복 일)은 `TodoEditPanel` 의 같은 라벨들처럼 **그 컴포넌트에서만** 쓰여 여기 없다
   * (code-style §3 — 한 곳에서만 쓰는 문구는 그 컴포넌트에 직접 적는다).
   */
  menuRoutine: '루틴으로 등록',
  routineDialogTitle: '루틴 등록',
  routineSubmit: '루틴 등록',
  routineCreated: (count: number): string => `${count}개의 할 일을 만들었어요`,
  routineEmptyResult: '이 기간에는 반복 조건에 맞는 날짜가 없어요',
  routineDatesRequired: '시작일과 종료일을 골라 주세요',
  /** 시작·종료 순서는 맞지만 날짜 스트립 범위(1970~2099) 밖일 때 — 순서 오류와 다른 문구를 쓴다. */
  routineDateOutOfRange: '1970-01-01~2099-12-31 사이 날짜만 골라 주세요',
  /** 반복 조건에 맞는 날짜가 있었지만 전부 이미 등록돼 있던 경우(중복 방지). */
  routineAllDuplicates: '이미 전부 등록돼 있어요',
  /** "계속 반복" 체크박스 (routine.md §2·R2) — 체크하면 종료일이 비활성 + 빈값이 된다. */
  routineIndefiniteLabel: '계속 반복',
  /** 체크됐을 때 종료일 입력의 `aria-describedby` 설명 (routine.md §5). */
  routineIndefiniteHint: '종료일 없이 계속 반복돼요',
  /**
   * 무기한 등록의 즉시 채우기 결과가 0건일 때(routine.md R4·R5) — 오류가 아니라 성공 토스트다.
   * 되돌릴 인스턴스가 없어 `routineCreated` 와 달리 되돌리기 액션은 붙지 않는다.
   */
  routinePendingStart: '곧 반복이 시작돼요',
  /**
   * 🔁 배지의 접근 이름 (routine.md §5) — 아이콘만으로는 스크린리더에 의미가 전달되지 않아
   * `describeRoutineRecurrence` 의 결과를 그대로 문장에 담는다.
   */
  routineBadgeLabel: (description: string): string => `루틴: ${description} 반복`,
} as const;
