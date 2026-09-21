<!-- 읽기 조건: worker/** 의 어떤 파일이든 읽거나 고치기 전. -->

# worker/ — AGENTS

## 목적

Cloudflare Worker(구글 OAuth·세션 쿠키·`/api/sync`·D1·계정 삭제, docs/specs/sync.md §4·§6,
ADR-0019). `src/` 밖의 **두 번째 진입점**이다 — `src/` 레이어 체계(ADR-0006)에 속하지 않는다.
`docs/DIRECTORY_MAP.md`·`docs/ARCHITECTURE.md` §1 표의 `worker` 행이 단일 소스.

## 관할: auth/, sync/, account/, db/

이 디렉토리들에는 별도 `AGENTS.md` 를 두지 않는다(이 문서가 관할). 파일 배치:

- `auth/`: `cookies.ts`·`hmac.ts`·`pkce.ts`(원시함수) · `provider.ts`(인터페이스) · `google.ts`·
  `stub.ts`(구현) · `session.ts`(발급·검증 — **`sessions` 테이블 조회는 이 파일에만** 있다, 아래
  규칙 3) · `handlers.ts`(`/auth/login`·`/auth/callback`·`/auth/logout`·`/api/me`).
- `sync/`: `handler.ts`(`/api/sync` 본체 — 푸시 검증·응답 조립. SQL 은 `db/entities.ts` 로 위임).
- `account/`: `delete.ts`(`/api/account/delete`).
- `db/`: `sql.ts`(태그 함수, 표기 장치뿐) · `entities.ts`(`entities`·`devices` SQL, **전부 `sub = ?`
  바인딩**) · `user-db.ts`(`forUser(db, sub): UserDb` — 사용자 격리의 유일한 진입점) ·
  `migrations/0001_init.sql`(불가역 — 스키마를 고치려면 `NNNN_*.sql` 을 새로 추가한다, 이미 나간
  파일을 고치지 않는다).

## 고유 규칙

1. **`src/domain/sync/**` 를 그대로 import 한다** — 복사하지 않는다(SYNC_DESIGN.md §0 결론 9). 특히
   `server-rules.ts#applyServerRules`·`remote-rows.ts#readRemoteRow`·`wire.ts` 의 타입은 이 디렉토리
   와 `src/repositories/memory/**`·클라이언트 셋이 같은 파일을 돈다 — 판정 로직을 여기서 다시
   적으면 그 순간부터 "거짓 초록불"이 구조적으로 가능해진다.
2. **`worker/db/**` 밖에서는 `@/domain/**` 외 `src/` 를 import 할 수 없다**(`@/infra`·`@/features`
   금지, eslint.config.mjs `worker/**` 블록). `worker/**` 안에서는 상대 경로(`./`·`../`)를 쓴다 —
   `@/*` 는 `src/*` 전용 별칭이라 `worker/` 자기 참조에는 쓰지 않는다(표기 규칙을 두 벌 만들지
   않는다).
3. **`worker/db/**` 의 모든 SQL 문은 `sub = ?` 를 직접 바인딩한다**(`scripts/check-worker-sql.sh` 가
   강제). 예외는 `sessions` 테이블 조회뿐이고, 그래서 그 조회는 이 디렉토리가 아니라
   `auth/session.ts` 에 있다(위 배치 설명) — "sub 없이 시작하는 조회가 존재한다"는 사실을 검사
   대상 밖에 정직하게 드러낸다.
4. **핸들러는 `sub` 를 문자열로 들고 다니지 않는다.** `db/user-db.ts#forUser(db, sub)` 가 유일한
   진입점 — 새 쿼리가 필요하면 `db/entities.ts` 에 함수를 추가하고 `UserDb` 에 메서드를 더한다.
5. **`AUTH_STUB` 스텁 로그인은 2중 가드**(`env.AUTH_STUB === '1'` **그리고** 호스트가
   localhost/127.0.0.1) — 하나만 참이어도 404(`auth/stub.ts#isStubAllowed`). 가드를 바꾸면
   `auth/stub.test.ts` 의 부정 테스트 2건을 반드시 같이 본다.
6. **계정 삭제는 순서가 정확성이다** — `deleted_users` 먼저, `entities`/`devices` 명시 DELETE,
   `users` 마지막, 다른 기기의 `sessions` 행은 건드리지 않는다(`account/delete.ts` jsdoc, ADR-0019).
7. **`worker/index.ts` 만 `export default` 를 쓴다**(Worker 모듈 엔트리 계약) — 그 밖의 모든 파일은
   named export.

## 검증

```bash
pnpm typecheck            # tsc -p tsconfig.worker.json 포함
pnpm test                 # vitest projects 의 'worker' 프로젝트(worker/**/*.test.ts)
bash scripts/check-worker-sql.sh
bash scripts/check-arch.sh   # 2차 패스가 worker 도 검사한다
pnpm run deploy:dry-run
```

## 자주 하는 실수

- `worker/db/**` 밖(`sync/handler.ts` 등)에서 `env.DB.prepare(...)` 를 직접 부르는 것 — SQL 은
  항상 `db/entities.ts` 를 거친다(규칙 3의 검사 대상이 `worker/db/**` 뿐이라, 밖에서 직접 쿼리하면
  `sub = ?` 검사를 조용히 우회한다).
- 세션 서명 검증(`hmac.ts#verifySignedValue`)보다 D1 조회를 먼저 하는 것 — 위조 쿠키로 D1 을
  두드리게 된다(`auth/session.ts` 주석).
