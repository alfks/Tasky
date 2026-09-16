// 백업 파일의 버전 변환 체인 (backup.md R3, TECH_PLAN §5 규칙 6). 순수 함수이고 **검증 전에** 돈다 —
// 옛 버전 파일은 현재 버전의 형식 검사를 그대로 통과할 수 없기 때문이다(v1 에는 `focusSessions` 가 없다).
//
// 그래서 이 파일의 입력은 아직 검증되지 않은 `Record<string, unknown>` 이다. 어떤 필드도 "있다고 믿지"
// 않고, 모양이 이상하면 **고치지 않고 그대로 통과시킨다** — 판정은 뒤의 검증이 한다(여기서 조용히
// 보정하면 손상된 파일이 검증을 통과해 버린다).
import { BACKUP_SCHEMA_VERSION } from '@/domain/backup/backup-document';
import { failAt } from '@/domain/backup/shape';

/** 버전 v 를 v+1 로 올린다. 값을 지우거나 덮어쓰지 않고 **없는 것만 더한다**. */
type MigrationStep = (body: Record<string, unknown>) => Record<string, unknown>;

/**
 * v1 → v2 (ADR-0011): `focusSessions` 테이블 신설. 그 밖의 변경은 **인덱스 추가뿐이라 로우 값이
 * 바뀌지 않았고**(ADR-0011 결정 2), 따라서 파일에서 달라지는 것은 이 배열의 유무 하나다.
 */
const migrateV1ToV2: MigrationStep = (body) => {
  if (Array.isArray(body['focusSessions'])) {
    return body;
  }
  return { ...body, focusSessions: [] };
};

/** 시작 버전 → 그 버전을 하나 올리는 단계. 빠진 번호가 있으면 변환할 수 없다는 뜻이다. */
const STEPS = new Map<number, MigrationStep>([[1, migrateV1ToV2]]);

/**
 * `from` 버전 문서를 현재 버전(`BACKUP_SCHEMA_VERSION`)까지 **순차** 변환한다.
 * `from` 이 현재 버전이면 그대로 돌려준다. 중간 단계가 없으면 `schemaVersion` 경로의 형식 오류다.
 * `from > BACKUP_SCHEMA_VERSION`(미래 버전)은 호출 전에 걸러야 한다 — 여기서는 루프가 돌지 않아
 * 원본을 그대로 돌려주므로 거부 책임이 사라진다.
 */
export function migrateBackup(
  body: Record<string, unknown>,
  from: number,
): Record<string, unknown> {
  let current = body;
  for (let version = from; version < BACKUP_SCHEMA_VERSION; version += 1) {
    const step = STEPS.get(version);
    if (step === undefined) {
      failAt('schemaVersion');
    }
    current = step(current);
  }
  return current;
}
