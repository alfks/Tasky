<!-- 읽기 조건: 저장소 인터페이스를 추가·변경하거나, memory 구현·계약 스위트·컨테이너를 수정할 때. -->

# src/repositories/ — AGENTS

## 목적

저장소 **계약**(인터페이스 5종), 테스트·개발용 memory 구현, 두 구현에 공통으로 돌리는 **계약 스위트**,
런타임 주입 컨테이너(`container.ts`: `getRepositories() / setRepositories()`).

## 파일 지도

| 파일                          | 무엇                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| `*-repository.ts`             | 엔티티 계약 4종(`Todo`·`Category`·`Settings`·`FocusSession`) + `dataset-repository.ts` |
| `container.ts`                | 조립 지점(배럴이 아니다 — ADR-0006). 구현을 import 하지 않는다                         |
| `ordering.ts`                 | 계약이 고정하는 정렬 중 도메인에 자리가 없는 것(집중 세션·검색 결과)                   |
| `repository-error.ts`         | `RepositoryError` — 도메인 규칙 위반(`DomainError`)과 구분되는 저장소 실패             |
| `contract.ts`                 | `ContractTarget` 과 계약 전용 엔티티 팩토리                                            |
| `write-plan.ts`               | `DatasetRepository.write` 1단계(해석·검증). memory·indexeddb 두 구현이 **같이 쓴다**   |
| `*.contract.ts`               | 계약 스위트 본문(`run<X>Contract(target)`). **테스트 파일이 아니다**                   |
| `dataset-removal.contract.ts` | `planCategoryRemoval` → `write` 절(TECH_PLAN §6). 데이터셋 러너가 부른다               |
| `memory.contract.test.ts`     | memory 대상으로 스위트 다섯을 실행                                                     |
| `memory/`                     | memory 구현(아래 규칙 3)                                                               |

## 규칙

1. 시그니처 변경 = ADR + memory·indexeddb 구현 동시 수정 + 계약 스위트·`READS` 매핑 갱신. 한 PR.
   확정 시그니처의 단일 소스는 `docs/TECH_PLAN.md` §6 이다.
2. **쓰기는 `upsert(Persistable<T>)` 하나뿐**이고 조회는 툼스톤을 반환하지 않는다(ADR-0007).
   교차 테이블·전량·툼스톤 읽기는 `DatasetRepository` 셋(`readAll`/`write`/`restore`)에만 있다(ADR-0009).
   레포지토리는 시각도 `rev` 도 만들지 않는다 — `at: string` 인자를 받는 메서드를 두면 그 자체가 위반이다.
3. memory 구현의 조회는 `memory/live.ts` 헬퍼만 거친다(툼스톤 필터 한 곳).
   `allRows`·`replaceRows` 는 `DatasetRepository` 구현 **전용** 통로다.
4. 컨테이너 기본값 없음: `getRepositories()` 는 미설정 시 throw(조립 누락을 조기 발견).
   런타임 조립은 `src/app/providers.tsx`, 테스트 조립은 `src/test/setup.ts`.
5. `SettingsRepository.get()` 은 행이 없으면 `undefined` 다 — **레포지토리는 기본값을 만들지 않는다**.
   기본 행은 도메인 `createSettings(deps)` 로 만들어 호출처가 `upsert` 한다(ADR-0005, TECH_PLAN §6).
6. 계약 스위트는 `*.contract.ts`(테스트 파일이 아님)에 두고 구현별 `*.contract.test.ts` 가 부른다.
   스위트를 테스트 파일로 두면 다른 구현이 import 할 때 memory 실행분이 딸려온다.
   그래서 스위트는 `src/test/fixtures` 를 쓸 수 없고(레이어 허용 목록 밖) `contract.ts` 의 팩토리를 쓴다.
   스위트는 `describe`/`it`/`expect` 를 전역(`vitest/globals`)으로 쓰므로 **테스트 러너 안에서만**
   import 한다 — 앱 코드가 부르면 런타임에 `describe is not defined` 다.
7. 출처: `docs/conventions/code-style.md` §5·§11, ADR-0005 · ADR-0007 · ADR-0009.

## 관할: memory/

`src/repositories/memory/` 에는 별도 `AGENTS.md` 를 두지 않는다(이 문서가 관할, 특히 규칙 3).

## 검증

```bash
pnpm test src/repositories --reporter=dot 2>&1 | tail -20
```
