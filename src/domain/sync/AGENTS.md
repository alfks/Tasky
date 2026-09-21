<!-- 읽기 조건: 동기화 프로토콜·서버 판정·클라이언트 병합·아웃박스·루틴 슬롯 id 규칙을 만지기 전. 일반 도메인 규칙은 ../AGENTS.md. -->

# src/domain/sync/ — AGENTS

## 목적

동기화(docs/specs/sync.md, ADR-0015)의 **순수 함수와 프로토콜 타입**만 둔다. 저장소·네트워크·Worker
구현은 각각 `src/repositories/**`·`src/infra/sync/**`·`worker/**`(전부 이 디렉토리 밖, 다른 티켓).

## 여기 있는 것 / 없는 것

- 있음: `wire.ts`(프로토콜 타입, Worker 와 공유), `server-rules.ts`+`.vectors.ts`(서버 판정 — Worker·
  메모리 가짜 서버가 같은 벡터를 돈다), `client-merge.ts`+`.vectors.ts`(풀 병합 표), `remote-rows.ts`
  (원격 로우 검증), `outbox.ts`(아웃박스 순수 로직), `routine-slot.ts`(루틴 인스턴스 결정적 id — **함수
  수준**, `src/domain/routine/` 에서 참조 0건이라 앱 채우기 경로는 아직 안 쓴다), `watermark-merge.ts`
  (워터마크 단조 병합 — 역시 **함수 수준**, `Routine` 병합 경로에 배선되지 않았다),
  `risk-scenarios.test.ts`(ADR-0017 위험 중 F1·F3 을 **함수 수준**에서 시험 — 앱 경로 배선은 아니다.
  F2 는 시험이 아니라 실제 코드가 그 전제를 깨고 있음을 `it.fails` 로 드러내는 것이다. 셋 다 실제
  배선은 T-92).
- 없음(다른 곳): `SyncRepository`/`SyncTransport` **인터페이스**는 `src/repositories/`, 실제
  IndexedDB·HTTP 왕복은 `src/infra/**`, D1·OAuth·세션은 `worker/**`, 로그인 화면·상태 UI는
  `src/features/sync/**`. `Routine.materializedThrough` 를 "사용자 조작으로만 바뀌는 하한"으로
  재정의하는 것과 `planRoutineFill` 이 `routine-slot.ts` 를 실제로 쓰게 배선하는 것은
  `src/domain/routine/**`(여기 없음, 후속 티켓).

## 고유 규칙 (일반 규칙은 [../AGENTS.md](../AGENTS.md))

1. **`server-rules.ts`·`server-rules.vectors.ts` 는 이 디렉토리가 유일한 소스다.** Worker(`worker/`)
   와 메모리 가짜 트랜스포트(`src/repositories/memory/`)는 이 파일들을 **import 해서 그대로** 쓴다 —
   같은 규칙을 다시 옮겨 적지 않는다(SYNC_DESIGN.md §0 결론 9 "거짓 초록불 구조 차단").
2. **`adopt()` 를 여기서 부르지 않는다.** `src/domain/backup/AGENTS.md` 가 아직 "호출처는
   `plan-import.ts` 하나로 모으고 늘리지 않는다"를 규정한다 — 이를 넓히려면 ADR-0009 개정(설계상
   ADR-0018)과 `eslint.config.mjs` 예외가 먼저 있어야 하고 둘 다 이 디렉토리 owns 밖이다.
   `remote-rows.ts` 는 `validate-rows.ts` reader 의 내부 `assertMeta` 검증까지만 쓰고 브랜딩은
   하지 않는다 — 저장 직전 브랜딩은 `SyncRepository.applyRemote` 구현(T-92 상당)의 몫이다.
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

- `Persistable<T>` 를 여기서 만들려고 `as Persistable<...>` 캐스팅을 시도하는 것 — 브랜드는
  `meta.ts` 안에서만 만들어지고 다른 곳의 캐스팅은 린트가 막는다(ADR-0007). 이 디렉토리는 검증까지만
  하고 브랜딩하지 않는다(규칙 2).
- 워터마크(`materializedThrough`)를 일반 로우 LWW 에 같이 실어 병합하는 것 — `watermark-merge.ts`
  로 **따로** 합쳐야 후퇴(ADR-0017 §재검토 위험 3)가 안 생긴다.
