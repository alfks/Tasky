// 저장소 계층의 실패 — 도메인 규칙 위반(`DomainError`)과 구분되는 타입이다.
// 여기서 클래스를 쓰는 것은 스택 트레이스와 `instanceof` 판정 때문이며, code-style §5 의 "클래스 금지"는
// **엔티티**에 대한 규칙이라 에러 타입에는 적용되지 않는다(`@/domain/errors` 와 같은 판단).

/** 저장소가 던지는 실패의 식별자. UI 분기는 문구가 아니라 이 코드로 한다. */
export type RepositoryErrorCode =
  /** `DatasetRepository.readAll()` 인데 설정 행이 없다. 레포지토리는 기본값을 만들지 않는다(ADR-0005). */
  | 'SETTINGS_MISSING'
  /** `DatasetRepository.write()` 의 원소가 계약에 없는 테이블을 가리킨다. 아무것도 쓰지 않았다. */
  | 'DATASET_WRITE_INVALID'
  /** Dexie `upgrade` 실패 — 앱 셸이 "백업 내보내기만 가능한 모드" 로 안내한다 (TECH_PLAN §5 규칙 4). */
  | 'SCHEMA_UPGRADE_FAILED';

/** 저장소 실패. `code` 로 분기하고 `detail` 은 디버깅용이다(화면에 쓰지 않는다). */
export class RepositoryError extends Error {
  readonly code: RepositoryErrorCode;
  readonly detail?: string;

  constructor(code: RepositoryErrorCode, detail?: string) {
    super(detail === undefined ? code : `${code}: ${detail}`);
    this.name = 'RepositoryError';
    this.code = code;
    this.detail = detail;
  }
}

/** 던져진 값이 저장소 에러인지. */
export function isRepositoryError(value: unknown): value is RepositoryError {
  return value instanceof RepositoryError;
}
