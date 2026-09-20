// 도메인 에러 — 규칙 위반을 코드 + 한국어 문구로 표현하는 유일한 지점.
// 화면 문구는 스펙(todo §2-C, category §2-D)이 확정한 것을 그대로 담는다 — UI 는 code 로 분기하거나
// message 를 그대로 보여준다. 여기서 Error 를 상속하는 것은 스택 트레이스와 throw 안전성 때문이며,
// "클래스 금지"(code-style §5)는 **엔티티**에 대한 규칙이라 에러 타입에는 적용되지 않는다.

/** 도메인이 던지는 모든 규칙 위반의 식별자. UI 분기는 문구가 아니라 이 코드로 한다. */
export type DomainErrorCode =
  | 'TODO_TITLE_REQUIRED'
  | 'TODO_TITLE_TOO_LONG'
  | 'TODO_MEMO_TOO_LONG'
  | 'TODO_REORDER_DONE'
  | 'TODO_NOT_IN_GROUP'
  | 'CATEGORY_NAME_REQUIRED'
  | 'CATEGORY_NAME_TOO_LONG'
  | 'CATEGORY_NAME_DUPLICATE'
  | 'CATEGORY_LIMIT_EXCEEDED'
  | 'CATEGORY_COLOR_INVALID'
  | 'CATEGORY_EMOJI_INVALID'
  | 'CATEGORY_TRANSITION_INVALID'
  | 'CATEGORY_REMOVAL_TARGET_INVALID'
  | 'CATEGORY_NOT_IN_LIST'
  | 'FOCUS_MINUTES_INVALID'
  | 'FOCUS_SESSION_ACTIVE_EXISTS'
  | 'FOCUS_SESSION_NOT_RUNNING'
  | 'FOCUS_SESSION_NOT_PAUSED'
  | 'FOCUS_SESSION_ENDED'
  | 'ROUTINE_DATE_RANGE_INVALID'
  | 'ROUTINE_RECURRENCE_INVALID'
  | 'ROUTINE_NOT_INDEFINITE'
  | 'DDAY_TITLE_REQUIRED'
  | 'DDAY_TITLE_TOO_LONG'
  | 'DDAY_DATE_INVALID'
  | 'DDAY_LIMIT_EXCEEDED'
  | 'INSTANT_FORMAT_INVALID'
  | 'META_FORMAT_INVALID';

/** 코드 → 사용자에게 보여줄 한국어 문구. 스펙에 문구가 있는 것은 그 문구를 그대로 쓴다. */
const MESSAGES: Record<DomainErrorCode, string> = {
  TODO_TITLE_REQUIRED: '할 일을 입력해 주세요',
  TODO_TITLE_TOO_LONG: '100자까지 쓸 수 있어요',
  TODO_MEMO_TOO_LONG: '메모는 500자까지 쓸 수 있어요',
  TODO_REORDER_DONE: '완료된 항목은 순서를 바꿀 수 없어요',
  TODO_NOT_IN_GROUP: '같은 그룹에 없는 할 일은 옮길 수 없어요',
  CATEGORY_NAME_REQUIRED: '이름을 입력해 주세요',
  CATEGORY_NAME_TOO_LONG: '20자까지 쓸 수 있어요',
  CATEGORY_NAME_DUPLICATE: '같은 이름이 이미 있어요',
  CATEGORY_LIMIT_EXCEEDED: '카테고리는 50개까지 만들 수 있어요',
  CATEGORY_COLOR_INVALID: '색을 골라 주세요',
  CATEGORY_EMOJI_INVALID: '이모지는 하나만 쓸 수 있어요',
  CATEGORY_TRANSITION_INVALID: '지금 상태에서는 바꿀 수 없어요',
  CATEGORY_REMOVAL_TARGET_INVALID: '옮길 카테고리를 골라 주세요',
  CATEGORY_NOT_IN_LIST: '카테고리를 찾을 수 없어요',
  FOCUS_MINUTES_INVALID: '집중 시간은 1분부터 180분까지예요',
  FOCUS_SESSION_ACTIVE_EXISTS: '이미 집중 중인 세션이 있어요',
  FOCUS_SESSION_NOT_RUNNING: '실행 중인 집중 세션이 아니에요',
  FOCUS_SESSION_NOT_PAUSED: '일시정지한 집중 세션이 아니에요',
  FOCUS_SESSION_ENDED: '이미 끝난 집중 세션이에요',
  ROUTINE_DATE_RANGE_INVALID: '종료일은 시작일과 같거나 이후여야 해요',
  ROUTINE_RECURRENCE_INVALID: '반복할 요일이나 날짜를 하나 이상 골라 주세요',
  ROUTINE_NOT_INDEFINITE: '종료일이 있는 루틴은 중지·재개할 수 없어요',
  DDAY_TITLE_REQUIRED: '제목을 입력해 주세요',
  DDAY_TITLE_TOO_LONG: '30자까지 쓸 수 있어요',
  DDAY_DATE_INVALID: '날짜를 골라 주세요',
  DDAY_LIMIT_EXCEEDED: 'D-day는 50개까지 만들 수 있어요',
  INSTANT_FORMAT_INVALID: '시각 형식이 올바르지 않아요',
  META_FORMAT_INVALID: '파일 형식이 올바르지 않아요',
};

/** 도메인 규칙 위반. `code` 로 분기하고 `message` 를 그대로 화면에 쓸 수 있다. */
export class DomainError extends Error {
  readonly code: DomainErrorCode;
  /** 디버깅·리뷰용 부가 정보(어떤 값이 문제였는지). 화면에 쓰지 않는다. */
  readonly detail?: string;

  constructor(code: DomainErrorCode, detail?: string) {
    super(MESSAGES[code]);
    this.name = 'DomainError';
    this.code = code;
    this.detail = detail;
  }
}

/** 던져진 값이 도메인 에러인지. 저장소·인프라 에러와 구분할 때 쓴다. */
export function isDomainError(value: unknown): value is DomainError {
  return value instanceof DomainError;
}

/** 코드에 대응하는 사용자 문구(에러를 던지지 않고 미리 보여줄 때 — 검증 오류 인라인 표시). */
export function domainErrorMessage(code: DomainErrorCode): string {
  return MESSAGES[code];
}
