<!-- 읽기 조건: src/features/profile/ 바로 아래(components/hooks/lib/store)에 파일을 추가하기 전, 관할만 확인하려고. 규칙 본문은 src/features/AGENTS.md. -->

# src/features/profile/ — AGENTS

관할 선언 전용 — 고유 규칙 없음. 규칙 본문: [src/features/AGENTS.md](../AGENTS.md).

지연 로드 경계(profile.md·ADR-0023): **진입** = `ProfileCard`·`ProfileAvatar`·스토어·미러·
`@/domain/profile/profile.rules`(표시 + 검증 — 진입에 두는 이유는 그 파일 머리주석의 번들 실측, 지연
청크로 옮기면 `Dialog` 분할로 +1.2 KB). **지연**(✎ 를 처음 누를 때) = `ProfileDialog`·
`ProfilePhotoField`·`hooks/useProfileForm`·`lib/avatar-*`. 이 feature 는 `@/features/sync`
를 import 하지 않는다(`src/features/sync/lazy-boundary.test.ts` 의 방향 규칙) — 반대로 `sync` 의
**진입** 파일(`sync-store.ts`)이 이 배럴을 import 해 `SyncRuntime` 으로 지연 청크에 넘긴다. 지연
청크가 이 배럴을 직접 끌면 `lazy(ProfileDialog)` 의 공유 모듈이 진입에서 갈라진다(그 주석의 실측).
로그인 이메일은 셸이 prop 으로 내린다. 카드 본문은 셸이 `onOpenFriends`(= `openSocial`)를 내려줄 때만
친구 화면 버튼이 된다(profile.md R11-a) — 이 feature 는 `social`·`shell` 을 import 하지 않는다. 카드 높이
하한 토큰 `--profile-card-min-h` 는 이 feature 안에서만 참조한다(담장, `src/test/tokens.test.ts`).

## 관할: components/

## 관할: hooks/

## 관할: lib/

## 관할: store/
