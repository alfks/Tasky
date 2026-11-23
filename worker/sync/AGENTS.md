<!-- 읽기 조건: worker/sync/** 의 어떤 파일이든 읽거나 고치기 전. -->

# worker/sync/ — AGENTS

## 목적

`handler.ts` — `/api/sync` 본체(SYNC_DESIGN.md §②-3). 한 왕복 = 푸시 → 풀. 요청 로우 검증은
`@/domain/sync/remote-rows.ts#readRemoteRow` 를 그대로 쓴다. SQL 은 `db/entities.ts` 로 위임한다
(이 디렉토리는 SQL 을 직접 짜지 않는다).

## 규칙 (이 디렉토리에만 적용)

1. **`changes` 배열 원소는 `unknown` 취급**(`isSyncRequest` 는 배열 여부만 보고 원소 형식은
   검증하지 않는다) — `null` 원소를 그대로 프로퍼티 접근하면 요청 전체가 500 이 된다. 루프
   앞에서 object 검사를 하고, 형식이 어긋난 원소만 `rejected: 'invalid'` 로 거절한 뒤 나머지는
   계속 처리한다(§②-3 "그 로우만 invalid").
2. **저장되는 body(JSON)와 컬럼(`entities.updated_at`)은 같은 클램프된 `updatedAt` 을 가져야
   한다.** `db/entities.ts#pushOne` 이 컬럼을 클램프하므로, 여기서도 `clampFutureUpdatedAt` 로
   같은 값을 만들어 body 를 직렬화한다(`clampFutureUpdatedAt` 은 멱등이라 두 번 불러도 안전).
   따로 클램프하지 않으면 컬럼과 body 가 서로 다른 값을 갖고, 풀로 돌아오는 값(body 쪽)이 그
   어긋남을 클라이언트에 그대로 넘긴다.

3. **요청 하나의 D1 쿼리 수는 변경 수에 비례해도 `MAX_PUSH_CHANGES` 로 막혀 있어야 한다**
   (`@/domain/sync/wire.ts`). Workers 는 호출당 D1 쿼리를 무료 50·유료 1,000 으로 제한하고, 넘으면
   Worker 가 던져 응답이 통째로 500 이다 — 그러면 클라이언트는 ack 를 못 해 같은 앞부분을 영원히 다시
   보내고 그 기기는 보내기도 받기도 못 한다(조용히). 그래서 ① 변경 한 건은 D1 쿼리 **한 번**이다
   (`pushOne` 은 미리 SELECT 하지 않는다 — 있음/없음·LWW 는 SQL 이 원자적으로 판정한다), ② 요청당
   `MAX_PUSH_CHANGES` 건만 처리하고 뒷부분은 **응답에 싣지 않는다**(클라이언트 아웃박스에 남아 다음
   왕복에서 처리된다). 이 디렉토리에서 D1 호출을 더하면 `push-budget.test.ts` 의 예산이 먼저 빨개진다.
   메모리 가짜 서버(`src/repositories/memory/sync-server.ts`)도 같은 상수를 쓴다.

## 검증

```bash
pnpm vitest run --project=worker worker/sync worker/router.test.ts
```
