<!-- 읽기 조건: 토큰·팔레트·라운드·타이포·간격·모션 수치가 필요할 때(모든 UI 티켓), 테마 토글·강조색 티켓을 시작할 때. 이 문서의 수치가 단일 소스다. -->

# 테마·컬러 시스템 스펙

- 상태: approved · 관련 ADR: ADR-0003 · 리서치 참조: reference-app-research.md §6 전체(추정치를 아래 확정값으로 대체), §9 과제 2

## 1. 목표

레퍼런스 앱의 감성(파스텔·화이트 베이스, 큰 라운드, 넉넉한 여백, 카테고리 색으로 꾸미는 재미)을 **수치로 고정**해 어떤 에이전트가 만들어도 같은 룩이 나오게 한다. 라이트/다크와 강조색은 사용자가 고르고, 나머지는 토큰이 정한다.

## 2. 화면과 인터랙션

```
 사이드바 하단:  [☾ 다크]  [⚙]           ⚙ 팝오버(240px):
                                          ┌ 테마 ───────────────────┐
                                          │ (●) 시스템 ( ) 라이트 ( ) 다크 │
                                          │ 강조색                    │
                                          │  ●  ●  ●  ●  ●  ●         │  ← 12색(§3-C와 동일), 28px, 선택 시 체크
                                          │  ●  ◉  ●  ●  ●  ●         │
                                          └───────────────────────────┘
```
- `☾` 버튼: 라이트 ↔ 다크 즉시 토글(시스템 모드였다면 명시 모드로 전환). 팝오버: 3모드 + 강조색.
- 강조색 변경은 즉시 전체 반영(선택 날짜 셀, 링, 버튼, 포커스 외곽 제외). 좁은 화면: 동일 팝오버(드로어 안).
- 상태: 로딩 없음(첫 페인트 전에 적용, R6). 에러: 저장 실패 시 화면은 바뀐 채 토스트, 새로고침 시 이전 값.

## 3. 규칙 (수치 = 토큰 값)

### 3-A. 의미 토큰
| 토큰 | 라이트 | 다크 | 용도 |
|------|--------|------|------|
| `--color-bg` | `#FAFAFC` | `#141418` | 페이지 배경 |
| `--color-surface` | `#FFFFFF` | `#1C1C22` | 카드·사이드바·패널 |
| `--color-surface-2` | `#F3F3F7` | `#26262E` | hover, 트랙, 스켈레톤 |
| `--color-text` | `#2B2B33` | `#EDEDF2` | 본문(대비 ≥ 12:1) |
| `--color-muted` | `#6F6F7A` | `#A0A0AA` | 보조 텍스트·완료 제목(대비 ≥ 4.5:1) |
| `--color-faint` | `#B8B8C0` | `#5A5A66` | 비활성 아이콘·구분선(정보 전달 금지) |
| `--color-border` | `#E6E6EC` | `#2E2E38` | 테두리 |
| `--color-accent` | 사용자 선택(기본 `#7CC6FF`) | 동일 프리셋의 다크 값 | 선택·링·주 버튼 |
| `--color-on-accent` | `#1F1F26` | `#1F1F26` | 강조색 위 글자(모든 프리셋에서 대비 ≥ 4.5:1) |
| `--color-focus` | `#4A7BD0` | `#8FB6FF` | 포커스 링(강조색과 무관, 대비 ≥ 3:1) |
| `--color-danger` | `#E05A6B` | `#F0808E` | 삭제·에러 |
| `--color-saturday` / `--color-sunday` | `#5B8DEF` / `#E06B7D` | `#8FB6FF` / `#F08A9A` | 요일 |
- R1. 컴포넌트는 위 토큰과 `--cat-color`만 쓴다. HEX 직접 사용은 리뷰 Blocker(ADR-0003).
- R2. 카테고리 색 배경 틴트는 `color-mix(in srgb, var(--cat-color) 18%, var(--color-surface))`(라이트) / `24%`(다크). 글자는 항상 `--color-text`.

### 3-B. 강조색
- R3. 강조색 선택지는 §3-C의 12색과 동일 집합. 기본값 `sky`. 저장은 라이트 HEX, 다크 모드는 같은 프리셋의 다크 값을 자동 사용.

### 3-C. 카테고리 팔레트 (12색, 저장값 = 라이트 HEX)
| id | 이름 | 라이트 | 다크 | id | 이름 | 라이트 | 다크 |
|----|------|--------|------|----|------|--------|------|
| `coral` | 코랄 | `#FF8FA3` | `#E27A8E` | `teal` | 틸 | `#8FDCD0` | `#76C1B6` |
| `peach` | 피치 | `#FFB38A` | `#E39A73` | `sky` | 스카이 | `#7CC6FF` | `#6AAEE3` |
| `orange` | 오렌지 | `#FFC978` | `#E3AE63` | `blue` | 블루 | `#9DB8F5` | `#829ED9` |
| `yellow` | 옐로 | `#FFEB99` | `#E0CD7E` | `lavender` | 라벤더 | `#B5A8F0` | `#9B8ED6` |
| `lime` | 라임 | `#CFEB8F` | `#B3CF76` | `lilac` | 라일락 | `#D8B8E8` | `#BC9ECC` |
| `mint` | 민트 | `#A8E6B0` | `#8CCB95` | `gray` | 그레이 | `#C9CCD6` | `#9EA1AB` |
- R4. 프리셋 밖 HEX가 저장돼 있으면(가져오기 등) 두 모드에서 그대로 사용한다(오류 아님).

### 3-D. 형태·타이포·간격·모션
| 종류 | 토큰 → 값 |
|------|----------|
| 라운드 | `--radius-sm` 8 · `--radius-md` 12 · `--radius-lg` 16 · `--radius-xl` 20(카드·다이얼로그) · `--radius-full` 9999 |
| 간격 | `--space-1..8` = 4 · 8 · 12 · 16 · 20 · 24 · 32 · 48 px |
| 글자 크기 | `--text-xs` 12 · `--text-sm` 13 · `--text-base` 14 · `--text-md` 15 · `--text-lg` 17 · `--text-xl` 20 · `--text-2xl` 24 · `--text-3xl` 30 px, 행간 1.5 |
| 굵기 | §3-F: `--font-weight-regular` 400 · `--font-weight-semibold` 600 · `--font-weight-bold` 700 |
| 폰트 | `--font-sans` — 스택·서브셋·로딩 규칙은 §3-F |
| 그림자 | `--shadow-sm` `0 1px 2px rgb(0 0 0 / .06)` · `--shadow-md` `0 6px 20px rgb(0 0 0 / .08)`(다크: `.30`/`.45`) |
| 모션 | `--motion-fast` 150ms · `--motion-base` 200ms · `--motion-slow` 300ms · 이징 `cubic-bezier(.2,.8,.2,1)` |
| z-index | `--z-base` 0 · `--z-sticky` 10 · `--z-popover` 20 · `--z-modal` 30 · `--z-toast` 40 |
| 컨트롤 | 체크박스 22px 원형·테두리 2px `--color-border`(hover: 카테고리 색) · 버튼 높이 36px · 입력 높이 36px · 최소 클릭 영역 32×32 |
- R5. `prefers-reduced-motion: reduce`에서 모든 `--motion-*`는 0ms.

### 3-E. 모드·저장·적용
- R6. 테마 모드 ∈ `system | light | dark`, 기본 `system`. 적용은 `<html data-theme="light|dark">`. 첫 페인트 전에 적용되어 깜빡임이 없어야 한다(저장소가 비동기이므로 localStorage 미러 `tasky.theme.v1`을 첫 페인트 전 스크립트가 읽는다).
- R7. `system` 모드는 OS 변경(`prefers-color-scheme`)을 실시간 따른다.
- R8. 테마·강조색은 저장소 `Settings`에 저장되며 백업에 포함된다. localStorage 미러는 캐시일 뿐이며, 저장소 값이 우선한다.
- R9. 텍스트 대비: 본문·보조 텍스트 ≥ 4.5:1, 아이콘·테두리·포커스 링 ≥ 3:1(배경 `--color-bg`/`--color-surface` 기준). 카테고리 색은 배경·점·막대에만 쓰고 글자색으로 쓰지 않는다.

### 3-F. 타이포그래피 — Pretendard 셀프 호스팅(확정)
- R10. `--font-sans` = `"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", system-ui, sans-serif`. Pretendard는 **앱과 같은 출처에서 셀프 호스팅**(가변 폰트 woff2 서브셋 1파일). 외부 폰트 요청(Google Fonts·CDN) 0건.
- R11. 굵기는 3단계만: 400(본문·입력·메모), 600(카테고리명·날짜·버튼·다이얼로그 제목), 700(달성률 숫자·오늘 날짜). 가변 폰트라 굵기 수는 용량과 무관하지만, 단계가 늘면 감성 톤이 흐트러지므로 토큰 밖 `font-weight` 사용은 리뷰 Major.
- R12. 서브셋 범위: ASCII(U+0020–007E) · Latin-1 보충(U+00A0–00FF) · 일반 구두점(U+2000–206F) · ₩(U+20A9) · 한글 호환 자모(U+3131–318E) · KS X 1001 한글 2,350자. 범위 밖 글자(희귀 음절·한자·이모지)는 폴백 폰트로 렌더되며 **오류가 아니다**. 이모지는 OS 이모지 폰트에 맡긴다.
- R13. 로딩: `font-display: swap` + 문서 `<head>`에 preload 1건. 폰트 도착 전에는 폴백 스택으로 즉시 텍스트를 그린다(보이지 않는 텍스트 FOIT 금지). 로드 실패(404·차단)여도 앱은 폴백으로 정상 동작하고 콘솔 오류 외 사용자 알림 없음. 교체로 인한 레이아웃 이동은 페이지 CLS 예산(≤ 0.05) 안이어야 한다.
- R14. 파일: 가변 폰트 woff2 1개, ≤ 600KB(예상 450KB), 해시 파일명 + 1년 immutable 캐시. woff/ttf/otf는 제공하지 않는다.
- R15. 폰트는 서비스워커 프리캐시 대상(pwa.md R3)이다 — 오프라인 첫 실행에서도 R10 스택의 첫 항목으로 렌더된다.
- R16. 라이선스: SIL OFL 1.1. `OFL.txt`를 폰트 파일과 같은 디렉토리에 두고, `README.md` "서드파티 고지"에 폰트 이름·라이선스·출처(공식 배포 릴리스)를 1줄 기재. 폰트 자체를 수정하지 않는다(서브셋은 OFL이 허용하는 재배포 형태).

## 4. 데이터

- domain `Settings = Meta & { id: 'default', theme, accentColor, seededAt?, lastBackupAt? }` — `Meta`(`createdAt`·`updatedAt`·`rev`·`deletedAt?`)를 공통으로 갖는다(ADR-0005. 단일 행이라 `deletedAt`은 설정되지 않는다). 팔레트 프리셋(§3-C)은 도메인 상수 + 조회 함수(HEX → 프리셋, 프리셋 → 다크 값).
- 레포지토리: `SettingsRepository.get()`(없으면 `undefined` — 기본값은 도메인 `createSettings(deps)`가 만들고 `upsert` 한다), `upsert(Persistable<Settings>)`. 레포지토리는 시각·`rev`를 만들지 않는다(ADR-0005·0007).

## 5. 접근성

- `☾` 버튼 `aria-label="다크 모드로 전환"`/`"라이트 모드로 전환"` + `aria-pressed`.
- 팝오버: 모드는 `radiogroup`, 강조색은 `radiogroup`(이름 = 색 이름). `Esc` 닫기, 포커스 복귀.
- 포커스 링은 `--color-focus` 2px + 오프셋 2px, 절대 제거하지 않는다.

## 6. 범위 밖

- 커스텀 HEX(1.5), 폰트 선택, 고대비 테마, 배경 이미지·스티커·마스코트, 카테고리별 아이콘 세트.

## 7. 완료 조건

- [ ] 토큰 파일이 §3-A·§3-C·§3-D 값과 1:1 일치한다(테스트: 토큰 파일 파싱 후 표 값 비교).
- [ ] 12색 × 2모드에서 `--color-on-accent` 대비 ≥ 4.5:1, `--color-muted` 대비 ≥ 4.5:1을 계산하는 테스트 통과(R9).
- [ ] 새로고침 시 테마 깜빡임 없음(R6, E2E: 다크 설정 후 리로드 첫 프레임 배경색 확인).
- [ ] 시스템 모드가 OS 변경을 따른다(R7, `matchMedia` 모킹 테스트).
- [ ] 폰트: 외부 폰트 요청 0건, 프리캐시 목록에 woff2 1개 ≤ 600KB, 오프라인 새로고침에서도 Pretendard 렌더(R10·R14·R15, E2E는 pwa.md와 공유). `font-weight` 사용값이 400/600/700뿐(R11, Grep 테스트).
- [ ] 라이트/다크 전체 화면 스크린샷 각 1장.
