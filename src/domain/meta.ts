// 엔티티 공통 필드(Meta)와 저장 가능 브랜드(Persistable)의 유일한 정의·생성 지점 (ADR-0005 · ADR-0007 · ADR-0009).
// 시각과 ID 는 deps 로 주입받는다 — 이 파일도 Date·crypto 를 호출하지 않는다(도메인 결정성).
import { INSTANT_PATTERN } from '@/domain/date/instant';
import { DomainError } from '@/domain/errors';

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

/**
 * upsert 가 받는 유일한 타입. 이 파일의 createMeta()/touch()/markDeleted() 만 만든다(ADR-0009 가 adopt() 를 넷째로 더한다) (ADR-0007 결정 1·2).
 *
 * 브랜드 값이 `true` 가 아니라 **T 자신**인 것이 핵심이다. 브랜드가 `true` 이던 시절에는
 * `Object.assign(a, b)` 의 반환 타입이 교차 타입 `A & B` 라서, 브랜드가 붙은 아무 값에나 다른 엔티티를
 * 덮어쓰면 그 엔티티의 `Persistable` 이 만들어졌다(lint 0 / tsc 0 — 리뷰 라운드 1 실측).
 * 브랜드가 T 자신이면 T 에 대해 불변이라 그 경로가 닫힌다: `Persistable<Meta> & Todo` 의 브랜드는 여전히
 * `Meta` 라서 브랜드가 `Todo` 여야 하는 `Persistable<Todo>` 에 대입되지 않는다(TS2345).
 * 남는 구멍은 "이미 브랜드가 붙은 **같은** 엔티티 위에 값을 덮어쓰는" 경우뿐이며, 그쪽은 린트
 * (NO_OBJECT_MUTATE·NO_META_WRITE)가 맡는다 — 구분 근거는 ADR-0007 '결과' 절.
 */
export type Persistable<T extends Meta> = T & { readonly [PERSISTABLE]: T };

/** 도메인이 시각·ID 를 주입받는 통로 (ADR-0005 규칙 2). */
export type MetaDeps = {
  /** 현재 시각을 ISO 8601 UTC 문자열로 돌려준다. */
  now: () => string;
  /** 새 UUID v4 를 돌려준다. */
  id: () => string;
};

/**
 * 새 엔티티를 만드는 유일한 함수. 도메인 필드를 받아 Meta(rev 1, createdAt = updatedAt)를 붙이고 브랜드를 봉인한다.
 * 호출: `createMeta<Todo>(deps, { categoryId, date, title, done, order })`.
 * `id` 는 fields 로 덮어쓸 수 있다(Settings 의 고정 id 'default').
 *
 * 브랜드가 불변이라 "Meta 만 만들어 두고 나중에 합치는" 중간 단계를 둘 수 없다 — 그 중간값이
 * `Object.assign`·스프레드로 다른 엔티티에 브랜드를 옮겨 붙이는 통로였다(ADR-0007 결정 1).
 */
export function createMeta<T extends Meta>(
  deps: MetaDeps,
  fields: Omit<T, keyof Meta> & { id?: string },
): Persistable<T> {
  const at = deps.now();
  const entity = { id: deps.id(), createdAt: at, updatedAt: at, rev: 1, ...fields };
  return entity as unknown as Persistable<T>;
}

/** 엔티티의 updatedAt 을 now 로, rev 를 +1 한다. 모든 변경 함수의 마지막 단계 (ADR-0005 규칙 3). */
export function touch<T extends Meta>(entity: T, now: string): Persistable<T> {
  const next = { ...entity, updatedAt: now, rev: entity.rev + 1 };
  return next as unknown as Persistable<T>;
}

/** 소프트 삭제: deletedAt 을 설정하고 touch 한다. 물리 삭제 API 는 없다 (ADR-0005 규칙 5). */
export function markDeleted<T extends Meta>(entity: T, now: string): Persistable<T> {
  const next = { ...entity, deletedAt: now };
  return touch(next, now) as unknown as Persistable<T>;
}

/** UUID v4 형식(`lib/id.ts#newId()` 출력). `Settings` 의 고정 id `'default'` 는 이 검사에서 제외된다(ADR-0005 규칙 3). */
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** `Settings` 단일 행의 고정 id. adopt() 의 id 검사 예외이자 SettingsRepository 의 유일한 키. */
const SETTINGS_FIXED_ID = 'default';

function assertInstant(value: unknown, field: string): void {
  if (typeof value !== 'string' || !INSTANT_PATTERN.test(value)) {
    throw new DomainError('META_FORMAT_INVALID', `${field}=${JSON.stringify(value)}`);
  }
}

/**
 * 네 번째 브랜드 생성 함수 (ADR-0009 결정 3) — **백업 가져오기 전용**(호출처는 `src/domain/backup/**` 하나).
 *
 * 시각도 `rev` 도 새로 찍지 않는다. 찍으면 파일과 로컬을 비교하는 병합 기준(backup R6)과
 * 내보내기 → 가져오기 왕복 동일성(R2)이 무너진다. 하는 일은 `Meta` **형식 검증**뿐이고,
 * 통과하면 "도메인을 거쳤다"는 증거로 브랜드만 붙인다. 검증 실패는 backup R4 의 형식 오류다.
 */
export function adopt<T extends Meta>(entity: T): Persistable<T> {
  if (typeof entity !== 'object' || entity === null) {
    throw new DomainError('META_FORMAT_INVALID', String(entity));
  }
  if (typeof entity.id !== 'string' || entity.id.length === 0) {
    throw new DomainError('META_FORMAT_INVALID', `id=${JSON.stringify(entity.id)}`);
  }
  if (entity.id !== SETTINGS_FIXED_ID && !UUID_V4_PATTERN.test(entity.id)) {
    throw new DomainError('META_FORMAT_INVALID', `id=${entity.id}`);
  }
  assertInstant(entity.createdAt, 'createdAt');
  assertInstant(entity.updatedAt, 'updatedAt');
  if (entity.deletedAt !== undefined) {
    assertInstant(entity.deletedAt, 'deletedAt');
  }
  if (!Number.isInteger(entity.rev) || entity.rev < 1) {
    throw new DomainError('META_FORMAT_INVALID', `rev=${String(entity.rev)}`);
  }
  return entity as unknown as Persistable<T>;
}

/** 툼스톤(소프트 삭제된 로우) 여부. 조회 필터가 쓰는 유일한 판정 (ADR-0007 결정 5). */
export function isTombstone(entity: Meta): boolean {
  return entity.deletedAt !== undefined;
}

/**
 * 툼스톤의 삭제 시각을 **결과 객체 형태로** 돌려준다.
 *
 * `deletedAt` 은 Meta 필드라 객체 리터럴의 키로 쓰는 것이 `meta.ts` 밖에서는 린트 에러다(NO_META_WRITE).
 * `planCategoryRemoval` 의 `CategoryRemovalResult.deletedAt`(TECH_PLAN §6 이 고정한 계약)처럼
 * **엔티티가 아닌 결과 객체**가 그 값을 실어야 할 때, 규칙을 우회하지 않고 이 파일을 거쳐 얻는다.
 * 값의 출처가 실제 툼스톤이므로 "카테고리와 같은 deletedAt"(category R14)이 구조적으로 보장된다.
 */
export function deletionStamp(entity: Meta): { deletedAt: string } {
  if (entity.deletedAt === undefined) {
    throw new DomainError('META_FORMAT_INVALID', 'deletedAt=undefined');
  }
  return { deletedAt: entity.deletedAt };
}
