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
4. 표기: `src/` 안 import 는 **항상 `@/…` 절대 경로**, 상대 경로(`./`, `../`) 전부 금지. 어떤 출발·대상 조합에도 합법 표기가 정확히 하나(code-style.md §7 표).
5. 배럴: `index.ts` 는 `src/features/<f>/index.ts` 에만(다른 곳의 `index.*` 는 에러). 밖에서는 그 파일만 import 가능, 안에서는 자기 배럴 import 금지, `export *` 금지. `domain` 은 배럴 없음(파일 직접 import), `repositories/index.ts` 는 `container.ts` 로 개명.
6. 2홉 이상 간접 경로: 별도 도구 없이 구조로 막는다 — (2) 로 경유지 파일도 반드시 어떤 레이어에 속하고, 허용 목록의 이행적 폐포가 `infra`·`test` 에 닿는 레이어를 늘리지 않는다(결과 참조). 비테스트 파일의 `*.test.*` import 는 별도 금지(테스트 예외를 경유지로 못 쓴다).

## 대안과 기각 이유
| 대안 | 기각 이유 |
|------|----------|
| 금지 목록 유지 + 누락 위치 보강(`.tsx`, `styles`, `src/*`) | 세 번째 누락이 없다는 보장이 없다. 라운드 2 의 원인은 위치 하나가 아니라 열거 구조 |
| `eslint-plugin-boundaries` | 허용 목록·미분류 에러를 더 깔끔한 어휘로 주지만 devDependency +1 과 두 번째 규칙 언어. 같은 것을 위 1·2 로 표현할 수 있음을 실측(우회 시도 60건 전부 차단)으로 확인했으므로 지금은 불필요 |
| `dependency-cruiser`(`reachable` 로 간접 경로 검사) | 허용 목록의 이행적 폐포를 계산하면 간접 경로가 새로 열리지 않는다. 의존성 +1 과 별도 실행 단계가 주는 추가 보장이 0 — 과설계 |
| 표기: 같은 디렉토리 `./`, 그 외 `@/` | "같은 디렉토리" 의 범위(폴더? feature?)를 린트가 파일별로 판정할 수 없어 dead-end 가 재발한다. 유일 표기가 우선 |

## 결과
- 좋은 점: 새 디렉토리·파일·확장자가 **기본 금지**. 이행적 도달: `domain→{domain,lib}`, `repositories→+domain`, `infra→+repositories`, `components→{components,lib,styles}`, `features→{features(자기+index),domain,repositories,components,lib,styles}` — 전부 폐포. `infra`·`test` 에 닿는 비테스트 파일은 `app/providers.tsx` 뿐. `app→features(index)→domain` 만 2홉으로 열리는데 이것이 "훅 경유" 의 의도다.
- 감수하는 점: 같은 디렉토리도 `@/…` 로 써 import 가 길다. 새 레이어·확장자는 ADR + `arch-layers.mjs` 수정이 필요하다(의도된 마찰). 의존성 결정의 근거: 도구를 바꾸는 비용(+1 dep, 규칙 언어 2개)보다 설정 형태를 바꾸는 비용이 작았고 실측으로 충분함이 확인됐다.

## 지켜야 할 규칙 (검증 가능한 문장 — 리뷰 판정 근거)
1. `scripts/arch-layers.mjs` 의 `LAYERS`/`ALLOW` 와 ARCHITECTURE.md §1 표는 같은 PR 에서만 바뀐다(둘 다 ADR 필요).
2. `bash scripts/check-arch.sh` 가 매 CI 에서 픽스처 전부 PASS(부정 케이스 + 긍정 케이스). 경계·표기 규칙을 바꾸면 케이스도 같은 PR.
3. `src/` 에 상대 경로 import, `features/*/index.ts` 외의 `index.*`, `.js/.jsx`, 직속 파일(`middleware.ts`·`instrumentation.ts` 외)이 없다 — `pnpm lint` 와 `check-arch.sh` 가 잡는다.
4. `noInlineConfig` 는 쓰지 않는다. disable 정책의 단일 소스는 `scripts/check-eslint-disable.sh`.

## 재검토 트리거
- 허용 목록 구조에서 세 번째 우회가 실측되고 그 원인이 설정 형태가 아니라 `eslint-plugin-import` 의 한계이면 `dependency-cruiser` 도입 ADR.
- 레이어가 12개를 넘거나 feature 간 의존이 `index.ts` 하나로 표현되지 않으면 `eslint-plugin-boundaries` 재검토.
