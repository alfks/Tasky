<!-- 읽기 조건: 동기화 트랜스포트(HTTP 왕복)를 수정할 때. -->

# src/infra/sync/ — AGENTS

## 목적

`SyncTransport`(`@/repositories/sync-transport`)의 **실제** 구현 — Worker(`worker/**`, T-93)와
`fetch` 로 왕복한다. 테스트·개발용 가짜 구현(`memory/sync-server.ts`·`memory/sync-transport.ts`)은
`src/repositories/memory/` 에 있다(§C-6, 앱 번들에 새지 않아야 하는 경계가 이 둘을 가른다).

## 여기 있는 것 / 없는 것

- 있음: `http-transport.ts`(`createHttpSyncTransport()`) + 테스트.
- 없음(다른 곳): `SyncTransport` 인터페이스는 `src/repositories/sync-transport.ts`. 메모리 가짜
  서버·트랜스포트는 `src/repositories/memory/`. Worker 쪽 엔드포인트 구현은 `worker/`(T-93).

## 규칙 (이 디렉토리에만 적용)

1. 세션은 쿠키(`HttpOnly`)로 나른다 — `fetch` 호출마다 `credentials: 'include'`. 토큰을 헤더·로컬
   스토리지에 싣지 않는다.
2. POST 요청은 `X-Tasky: 1` 헤더를 반드시 싣는다(Worker 의 CSRF 방어 조건, T-93). 빠뜨리면 403 이다.
3. `fetch` 가 던지면(네트워크 단절) `TransportError('offline')` 로 감싼다 — raw `TypeError` 를
   그대로 올리지 않는다. 401 은 `TransportError('unauthorized')`, 그 밖의 실패는 `'server'`.
4. `me()` 의 401 은 예외가 아니라 `null` 반환이다(로그인 전은 정상 분기, ADR-0018).
5. **모든 요청에 시한이 있다**(`REQUEST_TIMEOUT_MS`, fetch + 본문 읽기를 한 시한으로 덮는다) — 시한이
   지나면 `TransportError('offline')`. 시한 없는 `fetch` 는 응답이 영영 안 올 때(절전·백그라운드 중단·
   죽은 연결) 끝나지 않고, 엔진은 사이클 하나가 끝나야 다음을 돌리므로(`running` 가드) 그 기기의 동기화가
   앱을 다시 열 때까지 통째로 멈춘다. 새 엔드포인트도 반드시 `safeFetch` 를 거친다.

## 의존 방향

- import 가능: `@/domain`, `@/repositories`(인터페이스), 전역 `fetch`.
- import 금지: `@/infra/indexeddb`(무관한 구현), `@/features`, `@/app`, `dexie`.

## 검증

```bash
pnpm test src/infra/sync --reporter=dot 2>&1 | tail -20
```

## 자주 하는 실수

- `fetch` 를 `safeFetch` 밖에서 직접 불러 시한을 잃는다 — 평소엔 멀쩡하다가 절전 복귀 뒤 동기화만 조용히 멈춘다.
- `X-Tasky` 헤더를 빼먹고 배포 환경에서만 403 을 겪는다(로컬 프록시는 CSRF 검사가 없을 수 있다) —
  Worker 완성 전에는 `http-transport.test.ts` 의 모킹으로만 검증된다는 것을 기억한다.
