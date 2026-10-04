<!-- 읽기 조건: src/features/shell/ 바로 아래(components/hooks/store/lib)에 파일을 추가하기 전, 관할만 확인하려고. 규칙 본문은 src/features/AGENTS.md. -->

# src/features/shell/ — AGENTS

관할 선언 전용 — 고유 규칙 없음. 규칙 본문: [src/features/AGENTS.md](../AGENTS.md).

이 feature 는 화면을 **조립**한다. 다른 feature 의 컴포넌트를 배럴(`@/features/<f>`)에서 꺼내
슬롯에 넣고, 슬롯끼리의 배선(포커스·토스트·문서 제목·붕괴 순서)만 스스로 갖는다.
기능 로직을 여기에 새로 쓰면 그 feature 로 옮길 것. 프로필 카드는 `ShellHeader` 의 `profile` 슬롯
(상단 줄과 `DateStrip` 사이) 한 곳에만 꽂는다 — 2영역·1열이 같은 헤더를 쓰므로 마운트 지점이 하나다
(profile.md §2); `ShellMain` 은 프로필을 따로 받지 않는다.

## 관할: components/

## 관할: hooks/

## 관할: lib/

## 관할: store/
