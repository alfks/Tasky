// 사용자 격리를 구조로 강제하는 유일한 진입점(SYNC_DESIGN.md §②-5 항목 1). 핸들러는 `sub` 를
// 문자열로 들고 다니지 않는다 — `forUser(db, sub)` 가 `sub` 를 클로저에 가두고, 반환하는 `UserDb`
// 의 모든 메서드가 내부에서 그 `sub` 를 첫 바인딩으로 쓴다(구현은 worker/db/entities.ts, 거기
// 문장은 전부 `sub = ?` 를 직접 바인딩한다 — 이 파일은 그 값을 감출 뿐 새 SQL 을 만들지 않는다).
import {
  deleteAllForUser,
  gcFloor,
  pull,
  pushOne,
  setDeviceLastSeq,
  touchDevice,
  type ApplyOutcome,
  type PulledRow,
  type PushInput,
} from './entities';

export type UserDb = {
  push(deviceId: string, input: PushInput, receivedAt: string): Promise<ApplyOutcome>;
  pull(
    cursor: number,
    deviceId: string,
    limit: number,
    includeOwnSettings?: boolean,
  ): Promise<PulledRow[]>;
  touchDevice(deviceId: string, now: string): Promise<void>;
  setDeviceLastSeq(deviceId: string, lastSeq: number): Promise<void>;
  gcFloor(): Promise<number>;
  deleteAll(): Promise<void>;
};

export function forUser(db: D1Database, sub: string): UserDb {
  return {
    push: (deviceId, input, receivedAt) => pushOne(db, sub, deviceId, input, receivedAt),
    pull: (cursor, deviceId, limit, includeOwnSettings) =>
      pull(db, sub, cursor, deviceId, limit, includeOwnSettings),
    touchDevice: (deviceId, now) => touchDevice(db, sub, deviceId, now),
    setDeviceLastSeq: (deviceId, lastSeq) => setDeviceLastSeq(db, sub, deviceId, lastSeq),
    gcFloor: () => gcFloor(db, sub),
    deleteAll: () => deleteAllForUser(db, sub),
  };
}
