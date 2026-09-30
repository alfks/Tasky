<!-- 읽기 조건: Phase 3 로컬 검증과 운영 활성화/철회 여부를 판정할 때. -->

# Phase 3 릴리스 판정

개인 카테고리/할 일/메모와 온라인 공개 projection은 별개다. 공개범위는 나만 보기·친구만·모두 공개이며, 카테고리 이름과 사용자가 직접 승인한 immutable 사본만 공개한다. 원본 전체 공개·복원 후 자동 재공개는 없다. 모두 공개는 로그인하지 않은 방문자의 읽기를 포함한다.

## 구현 추적

| 계획  | 구현/계약                                                                                                | 주요 검증                                                                                                |
| ----- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| P3-01 | `domain/category/visibility.ts`, `domain/social/category-input.ts`, `category-access.ts`, 공개 읽기 포트 | 공통 15권한 벡터, source/owner/control 입력 거절, category/version 쌍, 기존 카테고리 private 기본        |
| P3-02 | D1 `0003_category_visibility.sql`, category/public membership·조건부 batch                               | additive migration, FK/인덱스, 실 D1 계약, 실패 원자성·CAS·receipt replay                                |
| P3-03 | category owner command·projection 철회, 기존 관계/초대/차단·계정 삭제                                    | 변조 소유권·sid/allowlist·비활성 actor·쿠키/origin·삭제 즉시 철회                                        |
| P3-04 | public 읽기/검증·친구 피드·현재 ACL 응원·GC                                                              | 익명/친구/stranger/양방향 block, stale preview, visibility downgrade, opaque cursor·한도                 |
| P3-05 | HTTP/memory adapters, public provider 분리, session ownership/lease, category reconciliation             | malformed DTO·invalid cookie 무재시도, memory/Worker 동등성, 계정/오프라인/hidden·늦은 응답, backup 필드 |
| P3-06 | 친구 화면·관계/초대·공유 선택/미리보기·공개 진입, category audience controller                           | 명시적 선택/동의·IME·키보드/초점·실패/재시도·초안 폐기·범위 변경/삭제 전 서버 확인                       |
| P3-07 | E2E/PWA·SQL/아키텍처·비용 가드·개인 회귀·privacy 안내                                                    | 전체 `pnpm check`, production build, 영향 E2E, 실제 cold network·개인 offline 회귀                       |
| P3-08 | 기본 off, 아래 운영 게이트·활성화/rollback 절차                                                          | 실제 운영 증거가 없으면 활성화 차단 유지                                                                 |

## 로컬 검증 기록

최종 snapshot의 명령/결과와 세 번의 구현 완료 후 검토 루프를 이 절에 기록한다. 설계 검토와 구현 중 조기 검토는 세 루프에 포함하지 않는다. 현재 기록은 최종 검사 전이며 릴리스 통과로 해석하지 않는다.

- 최종 `pnpm check`/`pnpm build`: 최종 검증 예정.
- 영향 E2E·cold network·PWA offline: 최종 검증 예정.
- 로컬 D1 비용: 50친구 × 각 1,000 private/tombstone 글 fixture에서 기존 200,830 rows_read를 friend membership hint로 첫/최대/다음 페이지 1,313/1,789/1,146으로 줄였다(각 5,000 이하). 최종 canonical ACL을 다시 검사하므로 hint만으로 권한을 부여하지 않는다. 이는 원격 p95/월 비용 증거를 대체하지 않는다.
- 완료 후 검토 → 반영 → 재검증 1/2/3: 최종 검증 예정.

## 운영 활성화 차단 항목

| 항목                                               | 판정       | 필요한 실제 증거                                      |
| -------------------------------------------------- | ---------- | ----------------------------------------------------- |
| 배포와 산출물 일치·구버전 SW 갱신                  | UNVERIFIED | 배포 commit/자산 대응과 갱신 후 같은 동작             |
| 실제 Google 왕복·두 기기 개인 sync·로그아웃/재가입 | UNVERIFIED | 동일 배포에서 실제 서로 다른 브라우저/기기 세션       |
| 독립 두 사람 사용성                                | UNVERIFIED | 초대→상호 수락→선택 공유→응원→철회 흐름의 독립 실사용 |
| 원격 p95·D1 읽기/쓰기·비용                         | UNVERIFIED | 계획의 계정 규모/호출 패턴에 대한 배포 환경 측정      |
| public edge rate limit·신고/중재/운영 담당         | UNVERIFIED | 배포 측 읽기 요청 제한과 공개 운영 담당/정책 확인     |

UNVERIFIED는 통과가 아니다. 운영 `SOCIAL_MODE`는 **off**를 유지한다. localhost AUTH_STUB E2E에서 enabled를 지정하는 것은 운영 활성화 증거가 아니다. CI 예외를 쓰는 경우 해당 PR의 runner 미배정/0 steps와 정확한 로컬 검사 결과를 함께 적는다.

## 활성화와 rollback

1. 개인 실제 운영 게이트와 위 표의 증거를 확보하고 같은 배포 commit을 기록한다.
2. 기능 off 상태에서 migration·개인 화면/동기화 회귀·구버전 클라이언트 호환을 확인한다.
3. 제한한 허용 계정으로 read-only 확인 후 enabled 시범 운영을 단계적으로 진행한다. 익명 public 읽기는 공개 category가 있으면 시작되므로 모두 공개 동의를 별도로 확인한다.
4. 오류/권한/비용 게이트가 깨지면 즉시 read-only 또는 off로 축소하고 현재 공개 ACL을 재검증한다. off에서는 타인/익명 읽기·새 게시/응원을 막고 owner의 내 공유 삭제/범위 철회·응원 취소/관계 정리를 유지한다.
5. 기능을 꺼도 개인 저장/동기화는 계속한다. 데이터를 되살리는 복원/자동 재공개나 기존 개인 테이블 역변환을 rollback 수단으로 사용하지 않는다.

범위 축소/삭제 요청이 진행 중이거나 결과가 불확실하면 마지막 확인 범위를 구별해서 표시한다. 응답을 잃은 요청이 서버에서 완료됐을 수 있으므로 현재 범위가 그대로라고 단정하지 않는다. 일시적 실패는 같은 command key로 명시적으로 재시도하며, 확정된 stale version은 canonical 범위를 다시 확인하고 새 사용자 동의와 새 key를 받는다. 공개 사본을 이미 내려받거나 촬영한 외부 자료는 회수할 수 없다. 로그인 사용자의 block은 상호 읽기/응원을 차단하지만 public 자료는 로그아웃하면 읽을 수 있다.

사본이 남은 category tombstone은 유지한다. 사본 없는 철회 projection은 receipt 재시도 보존 48시간 후 기존 GC 500행 예산 안에서 정리한다. 누락된 로컬 binding은 나만 보기로 조정하며 자동 재공개하지 않는다.

온라인 소셜 그래프는 명시한 소스 진입점으로 지연 로드한다(ADR-0025). 기존 개인 preload·offline 자산은 유지하며 entry 167500 B/첫 로드 JS 221000 B 예산을 늘리지 않는다. 전체 JS와 선택 화면 활성화 byte도 별도로 보고한다. API 응답/토큰/초안/피드 본문은 service worker/localStorage/개인 outbox에 저장하지 않는다.
