<!-- 읽기 조건: 이 레포에서 개발을 시작할 때, 또는 명령어·문서 위치가 기억나지 않을 때. 제품 소개와 배포는 루트 README.md. -->

# 개발 안내

**이 문서는 원래 루트 `README.md` 였다.** 루트 README 가 제품 소개·배포 안내로 바뀌면서
개발자용 내용을 여기로 옮겼다(내용은 그대로 두고 아래 "명령어"·"문서" 절만 최신으로 채웠다).

제품이 무엇인지와 배포 방법은 [README.md](../README.md) 를 본다.
프로젝트 규칙의 단일 소스는 [CLAUDE.md](../CLAUDE.md) 이고, 이 문서는 그것을 대신하지 않는다.

## 시작하기

```bash
bash scripts/setup.sh   # 최초 1회: git author 설정 + 훅 + 의존성
pnpm dev                # 개발 서버
pnpm check              # PR 전 필수 게이트 (10개 검사)
```

## 명령어

| 명령                      | 하는 일                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm dev`                | 개발 서버                                                                                        |
| `pnpm build`              | 프로덕션 빌드 + 서비스워커 + 산출물 계약 검사                                                    |
| `pnpm start`              | 빌드 산출물을 `wrangler dev` 로 서빙(서비스워커 확인용)                                          |
| `pnpm check`              | `scripts/check.sh` — 금지어·`.env`·AGENTS.md·author·워크트리·아키텍처·lint·typecheck·format·test |
| `pnpm test`               | 단위 테스트(vitest). `tests/**` 는 포함하지 않는다                                               |
| `pnpm test:e2e`           | E2E(Playwright, 프로덕션 빌드를 띄워서 실행)                                                     |
| `pnpm run deploy:dry-run` | 배포 배선 확인(자격증명 불필요)                                                                  |

`pnpm deploy` 는 **pnpm 내장 명령**이라 이 레포의 스크립트가 돌지 않는다 — 반드시 `pnpm run deploy`.

E2E 브라우저는 설치돼 있다(`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`). `playwright install` 은 쓰지 않는다.

## 문서

- **프로젝트 규칙(단일 소스)**: [CLAUDE.md](../CLAUDE.md) · 협업 프로토콜: [AGENTS.md](../AGENTS.md)
- 아키텍처: [ARCHITECTURE.md](./ARCHITECTURE.md) · 디렉토리 맵: [DIRECTORY_MAP.md](./DIRECTORY_MAP.md)
- 결정 기록(ADR): [DECISIONS.md](./DECISIONS.md) · 기능 스펙: [specs/](./specs/)
- 코드 컨벤션: [conventions/code-style.md](./conventions/code-style.md) · git: [conventions/git-workflow.md](./conventions/git-workflow.md)
- 사용감 실측 기록: [FEEL_REPORT.md](./FEEL_REPORT.md)

## 로드맵

- Phase 1 (MVP): 날짜 스트립, 카테고리별 할 일 CRUD, 체크·달성률, 테마/색상 — **구현됨**
- Phase 2: 클라우드 동기화, 친구·피드·반응

서드파티 고지는 [README.md](../README.md) 에 있다.
