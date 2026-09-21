<!-- 읽기 조건: 동기화 프로토콜·서버 판정·클라이언트 병합·아웃박스·루틴 슬롯 id 규칙을 만지기 전. 일반 도메인 규칙은 ../AGENTS.md. -->

# src/domain/sync/ — AGENTS

## 목적

동기화(docs/specs/sync.md, ADR-0015)의 **순수 함수와 프로토콜 타입**만 둔다. 저장소·네트워크·Worker
구현은 각각 `src/repositories/**`·`src/infra/sync/**`·`worker/**`(전부 이 디렉토리 밖, 다른 티켓).

## 여기 있는 것 / 없는 것

- 있음: `wire.ts`(프로토콜 타입, Worker 와 공유), `server-rules.ts`+`.vectors.ts`(서버 판정 — Worker·
  메모리 가짜 서버가 같은 벡터를 돈다), `client-merge.ts`+`.vectors.ts`(풀 병합 표), `remote-rows.ts`
  (원격 로우 검증 + `adopt()` 로 저장 직전 봉인, ADR-0018), `outbox.ts`(아웃박스 순수 로직),
  `risk-scenarios.test.ts`(ADR-0017 §재검토 트리거의 F1·F2·F3 이 **앱 경로에서 실제로 닫혔음을**
  고정한다 — T-92/ADR-0018 이후).
- 없음(다른 곳): `SyncRepository`/`SyncTransport` **인터페이스**는 `src/repositories/`, 실제
  IndexedDB·HTTP 왕복은 `src/infra/**`, D1·OAuth·세션은 `worker/**`, 로그인 화면·상태 UI는
  `src/features/sync/**`. 루틴 슬롯 id(`routineInstanceSlotId`)는 `src/domain/routine/slot-id.ts`
  (T-92 가 이 디렉토리에서 옮겼다 — 실제 쓰는 곳이 `planRoutineFill` 이라 그쪽이 맞다).
  `materializedThrough`→`fillFloor` 재정의·`watermark-merge.ts`(사용처가 없어져 삭제) 도 같은 이유로
  여기 없다.

## 고유 규칙 (일반 규칙은 [../AGENTS.md](../AGENTS.md))

1. **`server-rules.ts`·`server-rules.vectors.ts` 는 이 디렉토리가 유일한 소스다.** Worker(`worker/`)
   와 메모리 가짜 트랜스포트(`src/repositories/memory/`)는 이 파일들을 **import 해서 그대로** 쓴다 —
   같은 규칙을 다시 옮겨 적지 않는다(SYNC_DESIGN.md §0 결론 9 "거짓 초록불 구조 차단").
2. **`adopt()` 는 `remote-rows.ts` 에서만 부른다.** ADR-0009 규칙 1 이 "`plan-import.ts` +
   `sync/remote-rows.ts` 둘" 로 개정됐다(ADR-0018) — 이 파일 밖(다른 `domain/sync/**` 파일)에서
   부르면 여전히 리뷰 Blocker다. 린트 예외는 필요 없었다(`meta.ts` jsdoc — 호출처 제한은 도구가
   아니라 리뷰가 지킨다).
3. **`planMerge`(`src/domain/backup/plan-import.ts`)를 재사용하지 않는다.** 백업 병합은
   `updatedAt`(기기 시계) 축, 정상 상태 동기화는 서버 `seq`(아웃박스 존재로 대리) 축이라 판정
   기준이 다르다(SYNC_DESIGN.md §①-1). 로우 검증·`isTombstone` 같은 **공유 가능한 부분**은 그대로
   가져다 쓴다 — 갈라지는 것은 "누가 이기나" 한 줄뿐이다.
4. **모든 export 함수에 단위 테스트**(같은 디렉토리 `*.test.ts`), 판정 표·벡터는 `*.vectors.ts` 로
   분리해 여러 계층(도메인·저장소·Worker)이 같은 파일을 재사용할 수 있게 한다.

## 검증

```bash
pnpm test src/domain/sync --coverage --reporter=dot 2>&1 | tail -20
```

## 자주 하는 실수

- `Persistable<T>` 를 `remote-rows.ts` 밖에서 만들려고 `as Persistable<...>` 캐스팅을 시도하는 것 —
  브랜드는 `meta.ts`(+`remote-rows.ts` 의 `adopt()` 호출) 안에서만 만들어지고 다른 곳의 캐스팅은
  린트가 막는다(ADR-0007, 규칙 2).
- `fillFloor` 를 배경 채우기가 다시 옮기도록 배선하는 것 — ADR-0018 이 그 경로를 없앤 이유가
  "배경 채우기가 사용자 중지를 덮는다"(ADR-0017 §재검토 위험 2)이다. **2026-09-21 정정(PR #121 리뷰
  Blocker, ADR-0018 "## 정정" 절)으로 지금은 실제로 그렇게 배선돼 있다** — 소프트 삭제한 루틴
  인스턴스가 부활하는 더 급한 회귀를 막기 위한 임시 조치이고, 동기화 아웃박스 적재가 아직 어떤 쓰기
  경로에도 없어(T-92b 착수 전) 이 정정이 지금 당장 F2 를 재현하지는 않는다. **이 파일이 관할하는
  아웃박스 적재 코드(`outbox.ts` 사용처)를 앞으로 실제 쓰기 경로에 배선할 때는 반드시 ADR-0018 을
  먼저 읽고 이 전진을 되돌리는 작업을 함께 계획한다** — 안 그러면 F2 가 실제로 재현된다.
