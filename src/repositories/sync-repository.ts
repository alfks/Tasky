// 동기화 저장소 계약 (ADR-0018, docs/specs/sync.md §4). `SyncOutbox`·`syncState` 두 로컬 개념을 감싼다.
// 시각·rev·seq 를 만들지 않는다(레포지토리 규칙 2 그대로) — `applyRemote` 가 받는 로우는 이미
// `readRemoteRow`(도메인)가 검증·봉인한 `Persistable` 이고, `enqueueAll`/`ackOutbox` 가 다루는
// `rev` 는 전부 로컬 엔티티의 것을 그대로 옮길 뿐이다.
//
// **`SyncTransport` 를 여기 두지 않는 이유**: 저장소가 아니라 네트워크 어댑터라 `Repositories` 슬롯이
// 아니고(`container.ts` 의 둘째 슬롯, `setSyncTransport`), memory 가짜 서버(`memory/sync-server.ts`)가
// 앱 번들에 절대 들어가지 않게 하는 경계이기도 하다(§C-6, `src/features/shell/store/shell-storage-store.ts`
// 가 `createMemoryRepositories` 를 정적 import 하므로 `Repositories.sync` 의 memory 구현은 진입 청크에
// 실린다 — `SyncTransport` 는 별개 슬롯이라 그 영향을 받지 않는다).
import type { DatasetSnapshot } from '@/domain/dataset';
import type { Meta, Persistable } from '@/domain/meta';
import type { OutboxEntry } from '@/domain/sync/outbox';
import type { SyncState, SyncTable } from '@/domain/sync/wire';

/**
 * 테이블 이름 → 엔티티. `settings` 만 배열이 아니다(`DatasetSnapshot` 그대로).
 *
 * `K extends SyncTable ? … : never` 로 감싸 **분배 조건부 타입**으로 만든다 — 그냥
 * `DatasetSnapshot[K] extends readonly (infer E)[] ? E : DatasetSnapshot[K]` 라고만 적으면 검사
 * 대상이 `K` 자신(naked type parameter)이 아니라 `DatasetSnapshot[K]`(인덱스 접근)라 `K` 가 `SyncTable`
 * 전체(유니온)로 인스턴스화될 때 분배되지 않고 `unknown` 으로 무너진다(실측: `applyRemote` 가
 * `RemoteWrite` 유니온을 순회하며 `EntityOf<K>` 를 제네릭으로 쓰는 자리에서 tsc 가 그렇게 떨어졌다).
 */
export type EntityOf<K extends SyncTable> = K extends SyncTable
  ? DatasetSnapshot[K] extends readonly (infer E)[]
    ? E
    : DatasetSnapshot[K]
  : never;

/**
 * 검증·브랜딩이 끝난 원격 로우 한 건. `DatasetWrite`(domain/dataset.ts) 와 같은 판별 합집합 꼴 —
 * 테이블이 늘면 `SyncTable` 이 먼저 바뀌어 이 타입과 구현의 매핑이 컴파일 에러로 드러난다.
 */
export type RemoteWrite = {
  [K in SyncTable]: { tbl: K; seq: number; entity: Persistable<EntityOf<K>> };
}[SyncTable];

/** 푸시용 읽기 결과. `row === undefined` 는 그 로우가 물리 삭제됐다는 뜻(restore 뒤) — 호출부가 `dropOutbox`. */
export type OutboxRow = { entry: OutboxEntry; row: Meta | undefined };

export type ApplyRemoteResult = {
  /** `planClientMerge` 가 adopt-remote(-and-drop-outbox) 를 낸 건수(테이블별). 화면 재조회의 근거. */
  adopted: Readonly<Record<SyncTable, number>>;
  kept: number;
  droppedOutbox: number;
};

/**
 * `source` 에서 `keys` 만 골라 새 객체로 옮긴다. `OutboxEntry.rev`·`ExistingServerRow.updatedAt`
 * 같은 필드는 `Meta` 와 이름만 같을 뿐 다른 타입의 필드인데도, `no-restricted-syntax`(NO_META_WRITE,
 * ADR-0007)가 **프로퍼티 키 이름만** 보고 `src/domain/meta.ts` 밖에서 그 리터럴을 전부 막는다(실측).
 * 스프레드(`{ ...pick(...) }`)는 `ObjectExpression > Property` 리터럴이 아니라 `SpreadElement` 라
 * 그 선택자에 걸리지 않는다 — `source` 가 이미 도메인이 만든 값이므로(예: `entity.rev`) 옮겨 적는
 * 것은 "새로 쓰기" 가 아니라 "읽어서 옮기기" 다.
 *
 * **`shapeOf(튜플 배열)` 대신 이 형태를 쓰는 이유(리뷰 지적)**: 이전 버전은 `Object.fromEntries` +
 * `as T` 캐스팅이라, 호출부가 키 이름을 잘못 적어도(오타·순서 착오) 타입이 잡지 못했다 — 호출부의
 * 타입 annotation 이 실제 런타임 모양과 다를 수 있는 구조였다(이 레포가 #114 에서 겪은 회귀와 같은
 * 종류의 위험). `pick` 은 `K extends keyof T` 라 **오타가 컴파일 에러**고, 캐스팅이 전혀 없다 —
 * 반환 타입이 실제로 만든 값과 항상 같다(구조적으로 tsc 가 보장한다).
 */
export function pick<T, K extends keyof T>(source: T, keys: readonly K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    result[key] = source[key];
  }
  return result;
}

/**
 * `pick` 으로 못 옮기는, **source 에 없는 계산값** 하나를 위한 마지막 수단(예: 클램프된 `updatedAt`
 * 처럼 그 자리에서 계산한 값). 필드를 **하나로 제한**한 이유는 `shapeOf` 가 겪은 위험(여러 필드를
 * 튜플로 나열하면 순서·철자가 타입 검사를 피해 간다)을 원천적으로 줄이기 위해서다 — 한 필드짜리는
 * 호출부에서 눈으로 봐도 어긋날 여지가 거의 없다. 매핑 타입 반환은 computed key 특성상 캐스팅이
 * 여전히 필요하지만, 이 함수 3줄이 유일한 위조 지점이라 감사(audit) 범위가 `shapeOf` 보다 훨씬 좁다.
 */
export function withField<K extends string, V>(key: K, value: V): { [P in K]: V } {
  return { [key]: value } as { [P in K]: V };
}

export interface SyncRepository {
  /** 단일 행. 한 번도 로그인한 적 없으면 `undefined`(레포지토리는 기본값을 만들지 않는다 — settings 와 같은 규칙). */
  getState(): Promise<SyncState | undefined>;
  setState(state: SyncState): Promise<void>;

  /** `[tbl+id]` 기본 키 순으로 앞에서 `limit` 건. 순서는 진행 보장용이지 의미가 없다(§B-4). */
  listOutbox(limit: number): Promise<OutboxEntry[]>;
  countOutbox(): Promise<number>;
  /** 툼스톤 **포함** 기본 키 조회(bulkGet). 큐 항목의 로우 본문을 푸시용으로 읽는 유일한 통로. */
  readForPush(entries: readonly OutboxEntry[]): Promise<OutboxRow[]>;
  /** 한 트랜잭션. 각 항목을 **다시 읽어** `reconcileAck(queued, pushed) === 'remove'` 일 때만 지운다. */
  ackOutbox(pushed: readonly OutboxEntry[]): Promise<void>;
  /** rev 와 무관하게 제거(격리된 로우·물리 삭제된 로우). */
  dropOutbox(keys: readonly { tbl: SyncTable; id: string }[]): Promise<void>;
  /** 7테이블(툼스톤 포함) 전량을 큐에 넣는다 — 첫 로그인 "올리기"(R7) 한 번. 반환은 넣은 건수. */
  enqueueAll(): Promise<number>;

  /**
   * 풀 적용. **한 트랜잭션** 안에서 로우마다 `local`(툼스톤 포함 get)·`inOutbox`(아웃박스 get)를 읽고
   * `planClientMerge` 를 적용한다. 큐에 **넣지 않는다**(putRemote 경로). 검증(`readRemoteRow`)은 여기가
   * 아니라 호출부(엔진)의 몫이다 — memory 구현이 진입 청크에 있어 `wire.ts`·`server-rules.ts` 값을
   * 끌고 들어오면 안 되기 때문이다(§C-6).
   */
  applyRemote(rows: readonly RemoteWrite[]): Promise<ApplyRemoteResult>;

  /** `ids` 중 **존재하는**(살아 있든 툼스톤이든) id. 루틴 채우기의 슬롯 판정. */
  existingIds<K extends SyncTable>(tbl: K, ids: readonly string[]): Promise<ReadonlySet<string>>;

  /** 7테이블 + 아웃박스 물리 삭제, `syncState` 는 `deviceId` 만 남긴다(sync R1·§6). 앱의 둘째 물리 삭제 경로. */
  wipeLocal(): Promise<void>;
}
