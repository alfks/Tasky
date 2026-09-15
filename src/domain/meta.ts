// 엔티티 공통 필드(Meta)와 저장 가능 브랜드(Persistable)의 유일한 정의·생성 지점 (ADR-0005 · ADR-0007).
// 시각과 ID 는 deps 로 주입받는다 — 이 파일도 Date·crypto 를 호출하지 않는다(도메인 결정성).

/** 런타임 흔적 없는 브랜드 키. 선언만 존재하므로 직렬화에 들어가지 않는다 (ADR-0007 결정 1). */
declare const PERSISTABLE: unique symbol;

/** 세 엔티티(Todo·Category·Settings)가 예외 없이 갖는 공통 필드 (ADR-0005). */
export type Meta = {
  /** UUID v4. Settings 만 고정값 'default'. */
  id: string;
  /** 생성 시각 (ISO 8601 UTC). 이후 변하지 않는다. */
  createdAt: string;
  /** 마지막 변경 시각 (ISO 8601 UTC). touch() 만 갱신한다. */
  updatedAt: string;
  /** 쓰기마다 +1 되는 개정 번호. Phase 2 LWW 충돌 해소의 근거. */
  rev: number;
  /** 소프트 삭제 시각. 설정되면 툼스톤이며 조회 API 는 반환하지 않는다. */
  deletedAt?: string;
};

/** upsert 가 받는 유일한 타입. 이 파일의 세 함수만 만든다 (ADR-0007 결정 1·2). */
export type Persistable<T extends Meta> = T & { readonly [PERSISTABLE]: true };

/** 도메인이 시각·ID 를 주입받는 통로 (ADR-0005 규칙 2). */
export type MetaDeps = {
  /** 현재 시각을 ISO 8601 UTC 문자열로 돌려준다. */
  now: () => string;
  /** 새 UUID v4 를 돌려준다. */
  id: () => string;
};

/** 새 엔티티의 Meta 를 만든다. rev 는 1 에서 시작하고 createdAt = updatedAt. */
export function createMeta(deps: MetaDeps): Persistable<Meta> {
  const at = deps.now();
  return { id: deps.id(), createdAt: at, updatedAt: at, rev: 1 } as Persistable<Meta>;
}

/** 엔티티의 updatedAt 을 now 로, rev 를 +1 한다. 모든 변경 함수의 마지막 단계 (ADR-0005 규칙 3). */
export function touch<T extends Meta>(entity: T, now: string): Persistable<T> {
  const next = { ...entity, updatedAt: now, rev: entity.rev + 1 };
  return next as Persistable<T>;
}

/** 소프트 삭제: deletedAt 을 설정하고 touch 한다. 물리 삭제 API 는 없다 (ADR-0005 규칙 5). */
export function markDeleted<T extends Meta>(entity: T, now: string): Persistable<T> {
  const next = { ...entity, deletedAt: now };
  return touch(next, now);
}

/** 툼스톤(소프트 삭제된 로우) 여부. 조회 필터가 쓰는 유일한 판정 (ADR-0007 결정 5). */
export function isTombstone(entity: Meta): boolean {
  return entity.deletedAt !== undefined;
}
