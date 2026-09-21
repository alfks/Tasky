<!-- 읽기 조건: 백업 파일 형식·검증·병합 규칙을 만지기 전. 일반 도메인 규칙은 src/domain/AGENTS.md. -->

# src/domain/backup/ — AGENTS

## 목적

백업 파일의 형식·검증·버전 변환·가져오기 계획 (docs/specs/backup.md). 저장소를 모르는 순수 함수만 둔다.

## 고유 규칙 (일반 규칙은 [../AGENTS.md](../AGENTS.md))

1. **`adopt()` 를 부를 수 있는 곳은 둘뿐이다(ADR-0009 규칙 1, ADR-0018 이 개정)**: 이 디렉토리의
   `plan-import.ts`(백업 가져오기), 그리고 `src/domain/sync/remote-rows.ts`(원격 풀 로우 봉인).
   `shape.ts` 는 `assertMeta` 에서 **검증 목적으로만** 부르고 반환값(브랜드)을 버린다. 더 늘리지 않는다.
2. **파일에서 온 값은 바꾸지 않고 복사한다.** `createdAt`·`updatedAt`·`rev`·`deletedAt` 에 새 값을 넣는
   순간 병합 비교 기준(R6)과 왕복 동일성(R2)이 무너진다. `touch()`·`markDeleted()` 를 부르지 않는다.
   `shape.ts` 의 `pickFields` 가 키 목록대로 **한 번씩만 읽어** 옮기는 것이 그 통로다.
3. **에러에 사용자 데이터를 싣지 않는다.** `BackupShapeError.path` 는 고정 필드명 + 배열 인덱스로만
   조립한다. 제목·메모·이름이 문구에 들어가면 로그·리포팅으로 새고 회수할 수 없다.
4. 검증 실패는 **첫 오류 하나**만 보고하고(R8) 그 즉시 중단한다 — 부분 적용이 생길 자리를 만들지 않는다.
5. `BACKUP_SCHEMA_VERSION` 은 `infra` 의 `DB_VERSION` 과 같아야 한다(레이어상 import 불가 —
   `backup-document.test.ts` 가 대조한다). 스키마 버전을 올리면 `migrate-backup.ts` 에 단계를 더한다.

## 검증

```bash
pnpm test src/domain/backup --reporter=dot 2>&1 | tail -20
```
