// 투두 화면의 한국어 문구 (todo.md §2·§5). 세 곳 이상에서 쓰이거나 테스트가 문면을 고정해야 하는
// 문자열만 모은다(code-style §3) — 한 컴포넌트에서만 쓰는 문구는 그 컴포넌트에 직접 적는다.
//
// 저장 실패·검증 실패 문구는 여기 없다. 그쪽 단일 소스는 `domain/errors.ts` 와
// `store/todo-state.ts#SAVE_FAILED` 이고, 화면은 스토어의 `error` 를 그대로 보여 준다 — 복제하면
// 도메인 규칙을 고쳤을 때 화면만 옛 문구를 계속 말한다.

/**
 * 받침 유무에 따른 목적격 조사. `'장보기'를 삭제할까요?` 처럼 제목이 그대로 문장에 들어가는 자리는
 * `을(를)` 로 도망치지 않고 실제 글자를 고른다 — 이 앱의 문장은 사용자가 쓴 제목을 품는 일이 잦다.
 *
 * 한글 음절(U+AC00~U+D7A3)만 받침을 계산한다. 영문·숫자·기호로 끝나면 읽는 방식이 갈리므로
 * 기본값 `를` 을 쓴다(한국어 표기 관행에서 더 흔한 쪽).
 */
export function objectParticle(word: string): '을' | '를' {
  const last = word.at(-1);
  if (last === undefined) return '를';
  const code = last.codePointAt(0) ?? 0;
  if (code < 0xac00 || code > 0xd7a3) return '를';
  return (code - 0xac00) % 28 === 0 ? '를' : '을';
}

export const TODO_MESSAGES = {
  /** 입력 행을 여는 버튼 (§2-A). */
  addButton: '+ 할 일 추가',
  addPlaceholder: '할 일을 입력하고 Enter',
  /** 입력 행의 접근 이름 (§5). */
  addLabel: (categoryName: string): string => `${categoryName}에 할 일 추가`,
  /** 그룹에 항목이 하나도 없을 때 (§2-C). */
  empty: '아직 할 일이 없어요',
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
  menuTomorrow: '내일로',
  menuPickDate: '날짜 바꾸기…',
  menuUp: '위로',
  menuDown: '아래로',
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
} as const;
