// 데이터셋 단위 계약 (ADR-0009, TECH_PLAN §6). **엔티티 레포지토리가 아니다** — 교차 테이블·전량 작업만
// 담당하며 엔티티 단위 `remove`·`delete` 는 여기에도 없다(ADR-0009 결정 2).
//
// 값 타입(`DatasetWrite`·`DatasetSnapshot`·`PersistableSnapshot`)은 `@/domain/dataset` 이 단일 소스다 —
// `planCategoryRemoval` 이 `DatasetWrite[]` 를 반환하는데 도메인은 repositories 를 import 할 수 없기
// 때문이다(ARCHITECTURE §1, T-05 핸드오프 결정 1). 여기서 다시 선언하지 않고 그대로 쓴다.
import type { DatasetSnapshot, DatasetWrite, PersistableSnapshot } from '@/domain/dataset';

/** 교차 테이블·전량 연산. 메서드는 셋뿐이고 콜백을 받는 일반 `transaction(fn)` 은 두지 않는다 (ADR-0009 결정 2). */
export interface DatasetRepository {
  /**
   * **툼스톤을 포함한** 전량 읽기. 툼스톤을 읽는 유일한 경로다(ADR-0009 규칙 4).
   * 호출처는 셋 — 백업 내보내기(backup R2), 병합 가져오기의 현재 스냅샷(backup R6),
   * "삭제됨" 그룹 표시(category R17). 넷째가 생기면 ADR-0009 를 다시 본다.
   *
   * 돌려주는 배열은 `id` 오름차순이고, 설정 행이 없으면 `RepositoryError('SETTINGS_MISSING')` 이다
   * (계약이 `settings: Settings` 단일 값이라 없는 상태를 표현할 자리가 없다 — 레포지토리는 만들지 않는다).
   */
  readAll(): Promise<DatasetSnapshot>;
  /**
   * 여러 테이블에 걸친 `upsert` 를 **단일 트랜잭션**으로. 중간에 실패하면 아무것도 쓰지 않는다.
   * 콜백이 아니라 값 목록을 받는다 — `planCategoryRemoval` 이 만든 `writes` 를 그대로 넘긴다 (category R13·R15).
   */
  write(writes: readonly DatasetWrite[]): Promise<void>;
  /**
   * 백업 가져오기 전용: 일곱 테이블(T-86 이후 `ddays`·`diaryEntries`·`routines` 포함)을 물리적으로
   * 비우고 스냅샷으로 대체하는 단일 트랜잭션.
   * 인자가 **툼스톤을 포함한 최종 전량**이라 물리 삭제가 정보를 지우지 않는다(ADR-0009 결정 4).
   * 인자는 `PersistableSnapshot` 이므로 `readAll()` 결과를 그대로 넘기면 컴파일 에러다(ADR-0009 규칙 2).
   */
  restore(snapshot: PersistableSnapshot): Promise<void>;
}
