<!-- 읽기 조건: 마이그레이션 파일을 추가하거나 스키마를 바꾸기 전. -->

# worker/db/migrations/ — AGENTS

## 목적

D1 스키마 마이그레이션. `0001_init.sql`은 개인 동기화 5테이블,
`0002_social.sql`은 별도 소셜 8테이블과 nullable 삭제 nonce를 더한다(ADR-0019·0022).

## 규칙 (이 디렉토리에만 적용)

1. **이미 나간 파일은 불가역이다 — 손으로 고치지 않는다.** 스키마를 바꾸려면 `NNNN_*.sql` 을 새로
   추가한다(번호 오름차순).
2. `sessions.sub` 에는 `REFERENCES`(FK)를 걸지 않는다(`0001_init.sql` 주석, ADR-0019 §계정 삭제
   타이밍) — 계정 삭제 시 다른 기기의 `sessions` 행을 즉시 지우지 않는 설계와 짝이다.
3. `devices`·`entities` 는 `users` 에 `ON DELETE CASCADE` 를 걸어 두되, `worker/account/delete.ts`
   는 `PRAGMA foreign_keys` 가 꺼져 있을 가능성에 대비해 항상 명시 DELETE 도 같이 실행한다 —
   CASCADE 에만 기대지 않는다.
4. 소셜 FK와 CHECK, 인덱스는 실제 Miniflare D1로 검증한다. `deleted_users.execution_nonce`
   추가가 기존 세션의 410 지연 정리 계약을 바꾸지 않는다.

## 검증

```bash
pnpm run deploy:dry-run   # 배포 전 마이그레이션 적용 여부를 확인한다
```
