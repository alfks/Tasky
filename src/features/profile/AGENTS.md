<!-- 읽기 조건: src/features/profile/ 바로 아래(components/hooks/lib/store)에 파일을 추가하기 전, 관할만 확인하려고. 규칙 본문은 src/features/AGENTS.md. -->

# src/features/profile/ — AGENTS

관할 선언 전용 — 고유 규칙 없음. 규칙 본문: [src/features/AGENTS.md](../AGENTS.md).

지연 로드 경계(profile.md·ADR-0023): 진입에 남는 것은 `ProfileCard`·`ProfileAvatar`·스토어·미러
뿐이고, `ProfileDialog`·`ProfilePhotoField`·`hooks/useProfileForm`·`lib/avatar-*`·
`@/domain/profile/profile.rules` 는 ✎ 를 처음 누를 때 받는 청크다. 이 feature 는 `@/features/sync`
를 import 하지 않는다(`src/features/sync/lazy-boundary.test.ts` 의 방향 규칙) — 반대로 `sync` 의
**진입** 파일(`sync-store.ts`)이 이 배럴을 import 해 `SyncRuntime` 으로 지연 청크에 넘긴다. 지연
청크가 이 배럴을 직접 끌면 `lazy(ProfileDialog)` 의 공유 모듈이 진입에서 갈라진다(그 주석의 실측).
로그인 이메일은 셸이 prop 으로 내린다.

## 관할: components/

## 관할: hooks/

## 관할: lib/

## 관할: store/
