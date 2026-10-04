<!-- 읽기 조건: worker/** 의 어떤 파일이든 읽거나 고치기 전. -->

# worker/ — AGENTS

## 목적

Cloudflare Worker(구글 OAuth·세션 쿠키·`/api/sync`·D1·계정 삭제·소셜 D1/관계·피드 API,
docs/specs/sync.md §4·§6, ADR-0019·0022). `src/` 밖의 **두 번째 진입점**이다 — `src/`
레이어 체계(ADR-0006)에 속하지 않는다.
`docs/DIRECTORY_MAP.md`·`docs/ARCHITECTURE.md` §1 표의 `worker` 행이 단일 소스.

## 관할: auth/

## 관할: sync/

## 관할: account/

## 관할: db/

## 관할: social/

파일 배치·규칙은 각 하위 디렉토리 자신의 `AGENTS.md` 가 전담한다(중복 금지) — `db/migrations/`·
`test/` 는 그 아래 또 자기 `AGENTS.md` 를 갖는다(`관할:`은 직계 자식만 면제한다).

`version.ts` 는 `GET /api/version`(`{sha, protocol}`) 응답을 만든다 — `BUILD_SHA` 는 `scripts/deploy.sh` 가 주입한다.

## 고유 규칙 (worker/ 전체 — 하위 디렉토리 규칙은 각자 AGENTS.md)

1. **`src/domain/sync/**` 를 그대로 import 한다** — 복사하지 않는다(SYNC_DESIGN.md §0 결론 9). 특히
   `server-rules.ts#applyServerRules`·`remote-rows.ts#readRemoteRow`·`wire.ts` 의 타입은 이 디렉토리
   와 `src/repositories/memory/**`·클라이언트 셋이 같은 파일을 돈다 — 판정 로직을 여기서 다시
   적으면 그 순간부터 "거짓 초록불"이 구조적으로 가능해진다.
2. **`worker/db/**` 밖에서는 `@/domain/**` 외 `src/` 를 import 할 수 없다**(`@/infra`·`@/features`
   금지, eslint.config.mjs `worker/**` 블록). `worker/**` 안에서는 상대 경로(`./`·`../`)를 쓴다 —
   `@/*` 는 `src/*` 전용 별칭이라 `worker/` 자기 참조에는 쓰지 않는다(표기 규칙을 두 벌 만들지
   않는다).
3. **`worker/index.ts` 만 `export default` 를 쓴다**(Worker 모듈 엔트리 계약) — 그 밖의 모든 파일은
   named export.
4. `worker/index.ts`의 hourly scheduled 진입점은 기존 `collectSocialGarbage`를 이벤트당
   한 번 호출하고 `ctx.waitUntil`로 수명을 보장한다. cron은 운영 초안이며 실배포하지 않는다.

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
  항상 `db/entities.ts` 를 거친다(`db/AGENTS.md` 규칙, 밖에서 직접 쿼리하면
  `scripts/check-worker-sql.sh` 의 `sub = ?` 검사를 조용히 우회한다).
- 세션 서명 검증(`hmac.ts#verifySignedValue`)보다 D1 조회를 먼저 하는 것 — 위조 쿠키로 D1 을
  두드리게 된다(`auth/session.ts` 주석, `auth/AGENTS.md`).
