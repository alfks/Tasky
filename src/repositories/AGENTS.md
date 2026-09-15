<!-- 읽기 조건: 저장소 인터페이스를 추가·변경하거나, memory 구현·컨테이너를 수정할 때. -->

# src/repositories/ — AGENTS

## 목적

저장소 **계약**(인터페이스)과 테스트용 memory 구현, 런타임 주입 컨테이너(`container.ts`: `getRepositories() / setRepositories()`).

## 규칙

1. 시그니처 변경 = ADR + memory·indexeddb 구현 동시 수정 + 계약 테스트(`*.contract.test.ts`)·`READS` 목록 갱신. 한 PR.
2. 계약 테스트는 구현 팩토리를 인자로 받아 memory/indexeddb 둘 다 실행한다.
3. memory 구현의 조회는 `memory/live.ts` 헬퍼만 거친다(툼스톤 필터 한 곳).
4. 컨테이너 기본값 없음: `getRepositories()`는 미설정 시 throw(조립 누락을 조기 발견).
5. `SettingsRepository.get()`은 행이 없으면 `id: 'default'` 기본 행을 만들어 반환(단일 행 보장).
6. 출처: `docs/conventions/code-style.md` §5·§11, ADR-0007.

## 관할: memory/

`src/repositories/memory/`에는 별도 `AGENTS.md`를 두지 않는다(이 문서가 관할, 특히 규칙 3).

## 검증

```bash
pnpm test -- src/repositories --reporter=dot 2>&1 | tail -20
```
