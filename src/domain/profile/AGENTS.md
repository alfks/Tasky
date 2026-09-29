<!-- 읽기 조건: 프로필(이름·한 줄 소개·사진) 규칙·상한을 고치기 전. 화면 규칙은 docs/specs/profile.md, 저장 위치 결정은 ADR-0023. -->

# src/domain/profile/ — AGENTS

## 목적

`Settings` 행의 프로필 세 필드(`profileName`·`profileBio`·`profileAvatar`, ADR-0023)의 다듬기·검증·
쓰기 규칙. 별도 엔티티가 아니다 — 부모 `src/domain/AGENTS.md`가 이 디렉토리를 관할 선언하지
않으므로 따로 둔다.

## 여기 있는 것 / 없는 것

- 있음: `profile.rules.ts` 하나 — 상한 상수 **단일 소스**·검증·읽기 경로 관용 판정 `isAcceptable*`·
  `setProfile`, 그리고 표시용 다듬기·코드 포인트 셈·첫 그래핌·폴백(R9·R10). 한 파일인 이유는 그 머리주석
  (번들 실측 — 둘로 가르면 진입 폐포가 오히려 커진다).
- 없음(다른 곳): `Settings` 타입은 `src/domain/theme/settings.ts`. 백업 복원·동기화 풀·Worker 푸시의
  필드 단위 폐기는 `src/domain/backup/validate-rows.ts#readSettings`(여기 상수를 import 한다).
  사진 파이프라인(EXIF·크롭·인코딩)은 브라우저 API 라 `src/features/profile/lib/`.

## 규칙 (이 디렉토리에만 적용)

1. 상한(이름 20·소개 60·사진 16,384자·허용 MIME 접두)은 `profile.rules.ts` 에만 리터럴로 둔다
   (ADR-0023 규칙 2). 다른 계층은 import 한다 — 복제하면 세 검증 지점이 조용히 갈린다.
2. 값을 **다듬어 저장**하는 자리는 `setProfile` 하나(profile.md R7). `isAcceptable*` 는 다듬은 값으로
   **판정만** 하고 값을 바꾸지 않는다(R8 — 왕복 동일성).
3. 표시 함수를 다른 파일로 가르지 않는다(머리주석의 번들 실측) — 검증 0.55 KB 가 진입에 실리는 것이
   `Dialog` 분할보다 싸다.

## 의존 방향

- import 가능: `@/domain/errors`, `@/domain/meta`, `@/domain/theme/settings`(타입).
- import 금지: react·zustand·dexie·`@/repositories/**`·`@/features/**`·브라우저 전역.

## 검증

```bash
pnpm test src/domain/profile src/domain/backup src/domain/sync/remote-rows --reporter=dot
```

## 자주 하는 실수

- 편집 대화상자에 `maxLength` 를 두는 것 — UTF-16 단위라 이모지에서 코드 포인트 셈(R1)과 어긋난다.
- 읽기 경로에서 `validateProfileName` 을 그대로 부르는 것 — 그 함수는 던지므로 행 전체가 거부된다.
  `isAcceptable*` 로 필드만 버려야 한다.
