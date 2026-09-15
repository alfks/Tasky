<!-- 읽기 조건: 레이어를 추가·삭제하거나 의존 방향·import 표기·배럴 규칙을 바꾸기 전. 규칙을 따르기만 할 때는 code-style.md §7 표로 충분. -->

# ADR-0006: 레이어 경계 강제 구조 — 허용 목록 · 전수 분류 · 절대 경로 표기 · 배럴 위치

- 상태: accepted
- 날짜: 2026-09-15
- 관련: docs/ARCHITECTURE.md §1, docs/conventions/code-style.md §2·§7, scripts/arch-layers.mjs, eslint.config.mjs, scripts/check-arch.sh

## 맥락
경계 강제가 두 번 뚫렸다. 1차: 문자열 패턴(`no-restricted-imports`)이 상대 경로·배럴에 우회됨 → 해석 경로 기준 `import/no-restricted-paths` 로 교체. 2차: **금지 목록(deny-list) 구조 자체의 구멍** — "A 에서 B 로 가면 안 된다" 를 열거하므로 어느 목록에도 없는 위치(`src/shared.ts`, `src/styles/*.ts`, `.tsx`·`.js` 파일)가 2홉 경유지가 됐다(실측 ALLOWED 7건). 같은 라운드에 import 표기 규칙의 dead-end(자기-alias 금지 ↔ 2단계 상대 경로 금지)와 배럴 위치 불일치(domain)도 확인됐다.

## 결정
**금지 목록을 허용 목록(allow-list)으로 뒤집고 `src/**` 를 전수 분류한다. 추가 의존성 없음.**
1. 허용 목록: 레이어마다 "import 해도 되는 src/ 하위 경로"만 적는다(`scripts/arch-layers.mjs` 의 `ALLOW` = ARCHITECTURE.md §1 표). ESLint 표현은 `import/no-restricted-paths` 의 `from: './src'` + `except: 허용 목록` — 그 외 `src/**` 는 열거하지 않아도 금지된다.
2. 전수 분류: `src/**` 의 모든 파일은 `LAYERS` 중 정확히 하나에 속한다. 밖의 파일(`src/` 직속, 미등록 디렉토리, `src/features/` 직속, `src/styles/*.ts`)은 **파일 자체가 린트 에러**(`no-restricted-syntax` `Program` 셀렉터). `scripts/check-arch.sh` 가 트래킹 파일 전체를 셸에서 한 번 더 검사한다. 예외는 Next.js 가 위치를 강제하는 `src/middleware.ts`·`src/instrumentation.ts`(`lib` 만 import).
3. 확장자: 레이어 블록은 확장자를 열거하지 않는다(`src/<layer>/**`). 린트 대상 확장자는 `LINTED` 한 곳, `src/` 에 존재 가능한 확장자는 `SRC_EXT`(`ts tsx css md`) 한 곳 — 그 밖의 파일(`.js`·`.jsx`·`.mts`)은 파일 자체가 에러이고 레이어 규칙도 그대로 받는다.
4. 표기: `src/` 안 import 는 **항상 `@/…` 절대 경로**, 상대 경로(`./`, `../`) 전부 금지. 어떤 출발·대상 조합에도 합법 표기가 정확히 하나(code-style.md §7 표) — 그 "하나" 를 문자열 수준에서 강제하는 것이 결정 9다.
5. 배럴: `index.ts` 는 `src/features/<f>/index.ts` 에만(다른 곳의 `index.*` 는 에러). 밖에서는 그 파일만 import 가능, 안에서는 자기 배럴 import 금지, `export *` 금지. `domain` 은 배럴 없음(파일 직접 import), `repositories/index.ts` 는 `container.ts` 로 개명.
6. 2홉 이상 간접 경로: (2) 로 경유지 파일도 반드시 어떤 레이어에 속하고, 허용 목록의 이행적 폐포가 `infra`·`test` 에 닿는 레이어를 늘리지 않는다. **예외는 조립 지점 하나뿐이고 그것만 따로 막는다** — `@/app/providers` 를 import 할 수 있는 파일은 `src/app/layout.tsx` 하나(`no-restricted-imports` + 결정 9·10 의 정규형·거울이 전제다: 그것 없이는 `@/app/./providers`(라운드 3)·`typeof import('@/app/providers')`(라운드 4) 한 줄로 우회된다 — 둘 다 실측), `providers.tsx` 안의 재export(`export … from`)는 금지(`ExportNamedDeclaration[source]`). 비테스트 파일의 `*.test.*` import 도 금지(테스트 예외를 경유지로 못 쓴다).
7. **한계를 명시한다**: 위는 전부 *import 간선* 규칙이므로 `providers.tsx` 가 직접 래퍼(`export const getDb = () => db`)로 infra 값을 내보내는 것은 잡지 못한다(실측 ALLOWED). 도구로 닫지 않고 그 한 파일의 리뷰로 받는다 — ARCHITECTURE.md §1 에 "보장되는 것/보장되지 않는 것" 으로 적는다.
8. 설정 드리프트 가드: `LAYERS` 에 이름만 추가하면 무제약 영역이 생기므로, `ALLOW` 항목도 규칙 블록(`files: 'src/<layer>/**'`)도 없는 레이어가 있으면 **설정 로드 시점에 throw** 한다(`arch-layers.mjs` + `eslint.config.mjs`) — `pnpm lint` 가 즉시 실패한다.
9. 문자열 규칙의 전제 — **표기 정규형 + 구문 거울**: 해석 경로로 판정할 수 없는 규칙(조립 지점·`lib/date`·`db.ts`·자기 배럴·패키지 허용 목록)은 쓰인 문자열만 보므로 ①`@/…` 표기를 정규형 하나로 고정하고(`'.'`/`'..'` 세그먼트·중복/후행 슬래시·백슬래시·`%` 인코딩·허용 밖 문자·코드 확장자·`/index` 는 그 자체가 에러), ②`no-restricted-imports` 가 보지 않는 구문에 같은 패턴을 셀렉터로 복제한다(거울). 대소문자 변형은 패턴의 기본 대소문자 무시 매칭과 `import/no-unresolved`(`caseSensitive`)가 잡는다. 전제: 경로 별칭은 `@/*` 하나 — 별칭을 늘리면 이 결정을 다시 본다.
10. **모듈 경로 구문 전수 분담**(라운드 4 실측 — 빠진 구문이 곧 다음 우회로다. 구문을 추가하면 `check-arch.sh` 픽스처도 같이): `import`·`export … from`·`import type`·`export type … from` → `no-restricted-imports` + `import/no-restricted-paths` / 동적 `import()`·`typeof import()`·`import('…').Q`(TSImportType)·`vi`·`jest` 모킹 → 거울 셀렉터(`MIRROR_NODES`) / `require()`·`require.resolve()`·`createRequire()`·`import.meta.resolve`·`import x = require()` → 구문 자체가 에러 / 리터럴 아닌 `import()` → 구문 자체가 에러 / `/// <reference path|types>` → 주석이라 셀렉터가 닿지 않아 `@typescript-eslint/triple-slash-reference` + `check-arch.sh` 의 grep / 앰비언트 `declare module` → import 간선을 만들지 않아 대상 아님.
11. 허용 목록의 **두 표현과 세 가드**: `import/no-restricted-paths` 는 해석 경로만 보므로 `typeof import()`·모킹에는 걸리지 않는다(라운드 4 에 이것으로 레이어 경계가 뚫렸다). 그래서 같은 `except` 배열에서 문자열 패턴(`allowPattern`)도 만들어 함께 걸고, 둘은 `layerRules()` 한 곳에서만 나온다. 설정 로드 시점에 throw 하는 가드 — 0: 거울 노드 종류가 목록에서 빠짐 · 2: 블록의 문자열 패턴에 거울이 없거나 공통 문법 규칙이 빠짐 · 3: zone 은 있는데 대응하는 문자열 패턴이 없음.

## 대안과 기각 이유
| 대안 | 기각 이유 |
|------|----------|
| 금지 목록 유지 + 누락 위치 보강(`.tsx`, `styles`, `src/*`) | 세 번째 누락이 없다는 보장이 없다. 라운드 2 의 원인은 위치 하나가 아니라 열거 구조 |
| `eslint-plugin-boundaries` | 허용 목록·미분류 에러를 더 깔끔한 어휘로 주지만 devDependency +1 과 두 번째 규칙 언어. 같은 것을 위 1·2 로 표현할 수 있음을 실측(`check-arch.sh` 픽스처가 부정·긍정 전부 기대대로 판정)으로 확인했으므로 지금은 불필요 |
| `dependency-cruiser`(`reachable` 로 간접 경로 검사) | 간접 경로가 새로 열릴 수 있는 지점은 조립 지점 하나뿐이고 결정 6 이 그것만 직접 막는다. 이 도구도 import 간선만 보므로 결정 7 의 한계(값 래퍼)는 똑같이 남는다 — 의존성 +1 로 얻는 추가 보장이 0 |
| 표기: 같은 디렉토리 `./`, 그 외 `@/` | "같은 디렉토리" 의 범위(폴더? feature?)를 린트가 파일별로 판정할 수 없어 dead-end 가 재발한다. 유일 표기가 우선 |

## 결과
- 좋은 점: 새 디렉토리·파일·확장자가 **기본 금지**. 이행적 도달: `domain→{domain,lib}`, `repositories→+domain`, `infra→+repositories`, `components→{components,lib,styles}`, `features→{features(자기+index),domain,repositories,components,lib,styles}` — 전부 폐포. 테스트 계층(`src/test/**`·`*.test.*` — 경계 면제)과 자기 레이어를 빼면 `infra`·`test` 를 **import** 하는 파일은 `app/providers.tsx` 뿐이고, 그 파일을 import 하는 파일은 `layout.tsx` 뿐이다(경로 표기 변형과 결정 10 의 구문 전수 — `check-arch.sh` 픽스처가 고정). `app→features(index)→domain` 만 2홉으로 열리는데 이것이 "훅 경유" 의 의도다.
- 감수하는 점: 같은 디렉토리도 `@/…` 로 써 import 가 길다. 새 레이어·확장자는 ADR + `arch-layers.mjs` 수정이 필요하다(의도된 마찰). 의존성 결정의 근거: 도구를 바꾸는 비용(+1 dep, 규칙 언어 2개)보다 설정 형태를 바꾸는 비용이 작았고 실측으로 충분함이 확인됐다.

## 지켜야 할 규칙 (검증 가능한 문장 — 리뷰 판정 근거)
1. `scripts/arch-layers.mjs` 의 `LAYERS`/`ALLOW` 와 ARCHITECTURE.md §1 표는 같은 PR 에서만 바뀐다(둘 다 ADR 필요).
2. `bash scripts/check-arch.sh` 가 매 CI 에서 픽스처 전부 PASS(부정 + 긍정). 픽스처는 손으로 고른 목록이지 `ALLOW` 전수 생성이 아니다 — 경계·표기 규칙을 바꾸면 케이스도 같은 PR.
3. `src/` 에 상대 경로 import, `features/*/index.ts` 외의 `index.*`, `.js/.jsx`, 직속 파일(`middleware.ts`·`instrumentation.ts` 외)이 없다 — `pnpm lint` 와 `check-arch.sh` 가 잡는다.
4. `noInlineConfig` 는 쓰지 않는다. disable 정책의 단일 소스는 `scripts/check-eslint-disable.sh`.
5. 경로 표기 변형(`@/app/./providers`, `@/lib/date.ts`, `@/features/<f>/index`, 중복 슬래시…)과 결정 10 의 모든 구문(동적 `import()`·`typeof import()`·모킹·`require` 계열)은 정상 표기의 정적 import 와 같은 판정을 받는다 — `check-arch.sh` 의 표기·구문 픽스처가 고정한다(라운드 3·4 우회 재발 방지).
6. 예외 블록(`meta.ts`, `app/providers.tsx`, `layout.tsx`)은 `files` 에 `src/<layer>/__arch__/<이름>.ts` 픽스처 경로를 함께 적는다. 예외가 **무엇을 지우고 무엇을 남기는지** check-arch.sh 가 실제로 판정하게 하기 위해서다(`__arch__` 는 레포에 존재하지 않는다).

## 재검토 트리거
(레포에서 읽히는 수치나 실제로 일어나는 사건만 적는다 — "문제가 생기면" 은 트리거가 아니다)
- `eslint.config.mjs` 의 레이어·예외 블록이 feature 블록을 빼고 14개를 넘거나(현재 12), `layerRules()` 의 `exact` 에 feature 배럴이 아닌 파일이 들어가면(= 허용 목록이 파일 단위 예외로 무너지는 신호) `eslint-plugin-boundaries`/`dependency-cruiser` 재검토 ADR. feature 마다 블록·`exact` 항목이 하나씩 느는 것은 설계대로이므로 신호가 아니다.
- `LAYERS.length > 12`(현재 9) 이면 `eslint-plugin-boundaries` 재검토.
- `src/app/providers.tsx` 가 50줄을 넘거나 레포지토리 주입 외의 값을 export 하면 결정 7 의 한계를 다시 본다(도구가 아니라 구조로 줄일 수 있는지).
