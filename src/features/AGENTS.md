<!-- 읽기 조건: features/<f>/ 아래 컴포넌트·훅·스토어를 작성·수정할 때. feature별 하위 AGENTS.md는 없다 — 이 파일이 전부 다룬다. -->

# src/features/ — AGENTS

## 목적

기능 슬라이스. 각 feature = `index.ts` + 하위 디렉토리(보통 `components/` `hooks/` `store/`, 필요하면 더 — 아래 '하위 구조'). MVP: `todo`, `category`, `date-strip`, `stats`, `theme`. 화면 조립은 `todo/components/HomeScreen.tsx`.

## 규칙

1. `index.ts`는 `src/`에서 유일한 배럴 위치. 밖으로 보여줄 것만 명시 export(`HomeScreen`, 스토어 훅). 새 feature 디렉토리는 `eslint.config.mjs`가 자동 인식하지만 `index.ts`가 없으면 `check-arch.sh`가 실패한다.
2. feature 간 통신은 상대 feature 의 `index.ts`가 export 한 스토어 훅 구독으로. 이벤트 버스 금지.
3. `src/features/` 직속 파일 금지 — 공용 코드는 `components` 또는 `lib`로.
4. 출처: `docs/ARCHITECTURE.md` §1, `docs/conventions/code-style.md` §2·§4·§7(같은 feature 안도 `@/features/<f>/…`).

## 하위 구조

각 feature 는 `index.ts` + 필요한 만큼의 하위 디렉토리를 갖는다. 기본은 `components/` `hooks/` `store/` 셋이고, **여기서 끝나야 한다는 규칙은 없다** — `code-style.md` §2("넘으면 하위 폴더로 분할, feature 안이면 index 에 재export 하지 않아도 된다")가 분할을 명문으로 허용하므로 순수 헬퍼를 모으는 `lib/` 같은 디렉토리를 더 둘 수 있다(예: `date-strip/lib/`). 새 하위 디렉토리에도 `AGENTS.md`가 필요하다(루트 헌법 §1-4) — 아래 관할 선언이 그 부담을 없앤다.

`관할:`은 직계 자식만 면제하므로 여기서 `todo/`를 선언해도 그 아래 `components/`는 면제되지 않는다 — 그래서 `src/features/<f>/AGENTS.md`(5개)를 관할 선언 전용 최소 파일로 둔다. 규칙 본문은 이 문서가 전담(중복 금지).

## 검증

```bash
pnpm test src/features/<f> --reporter=dot 2>&1 | tail -20 && pnpm lint
```

## 자주 하는 실수

- 스토어 전체 구독(`useTodoStore()`) → 리렌더 폭증, selector 사용.
- `repo.upsert({ ...todo, done: true })` → 컴파일 에러. 도메인 함수(`toggleDone`)의 반환값을 저장한다.
