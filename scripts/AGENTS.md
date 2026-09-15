<!-- 읽기 조건: scripts/*.sh 가 실패했거나, 스크립트를 추가·수정할 때. 사용법만 필요하면 CLAUDE.md §5로 충분. -->

# scripts/ — AGENTS

## 목적

협업 규칙을 명령 한 줄로 만든다. 로컬 훅과 CI가 **같은 스크립트**를 호출하므로 로직은 여기에만 있다.

## 여기 있는 것

| 스크립트                                      | 역할                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 호출처                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `setup.sh`                                    | author config, `core.hooksPath=.githooks`, `pnpm install`(있을 때). 재실행 안전(idempotent), 워크트리 안에서 실행하면 BOARD 초기화만 건너뜀                                                                                                                                                                                                                                                                                                                         | 사람/에이전트 최초 1회, 훅이 안 돌 때 재실행  |
| `wt.sh new                                    | rm                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | list`                                         | 워크트리 생성/정리/목록 + BOARD.md 갱신(락으로 보호). `rm`은 git만으로 머지 여부(일반/squash) 판정 후 삭제, 판정 불가·모호하면 fail-closed(거부). 원격은 매 실행 `git ls-remote`로 직접 확인하고(로컬 `origin/<branch>` ref는 stale일 수 있어 신뢰하지 않음, fetch 후 그 값과 일치하는지도 검증), 조회·fetch 실패나 원격이 앞서 있으면 `--force`에서도 거부. 실제 삭제는 `--force-with-lease`로 보내 판정 이후 push된 커밋을 지우지 않는다 | 구현자·오케스트레이터 |
| `test-wt.sh`                                  | `wt.sh` 스모크 테스트. `/tmp` 샌드박스(가짜 bare origin + 제3의 클론)에서 new·new --existing(로컬/원격/미존재 3종)·rm(일반/스쿼시 머지, 미머지 거부, --force, 빈 커밋 거부, 되돌린 트리 거부, 원격 앞섬 거부, 미커밋 변경 거부, cherry 실패 fail-closed, 원격 조회 실패 거부, stale ref 거부, 원격 삭제 실패 보고)·flock 유무 양쪽 동시성을 왕복. 원본 레포는 건드리지 않고 항상 자동 정리(trap)                                                                    | `check.sh wt`, CI guard, `wt.sh` 수정 후 수동 |
| `check.sh [base]` \| `check.sh <step> [인자]` | **검사 목록의 단일 소스.** 인자 없이/`[base]`만 주면 전체를 순서대로 실행하고 요약 출력. `<step>`(forbidden-words\|agents-md\|author\|wt\|arch\|lint\|typecheck\|test) 하나만 주면 그 검사만 실행하고 그 exit code 그대로 반환 — CI(`ci.yml`)가 이 형태로 스텝별 호출해 실패 지점을 GitHub UI에 그대로 노출한다                                                                                                                                                     | 커밋/PR 전 수동, `wt.sh new` 안내, CI 전 스텝 |
| `check-forbidden-words.sh [paths…]`           | 금지어 검사(조각 조립 정규식)                                                                                                                                                                                                                                                                                                                                                                                                                                       | pre-commit, CI, 수동                          |
| `check-author.sh <base>`                      | `<base>..HEAD` 커밋 author/트레일러 검증. `--message-file`/`--body-file` 은 실제 커밋에 남는 원문(`#` 줄 포함 — git의 기본 cleanup은 `-m`/`-F` 에서 주석을 지우지 않는다) 그대로 검사                                                                                                                                                                                                                                                                               | CI, 수동                                      |
| `check-agents-md.sh`                          | 트래킹 파일이 있는 모든 디렉토리마다 `AGENTS.md` 존재(상위의 `관할:` 선언 시 면제)·60줄 이하 검사                                                                                                                                                                                                                                                                                                                                                                   | CI, 수동                                      |
| `check-arch.sh`                               | ① `src/**` 전수 분류(코드 파일 = 레이어 하나, `.md` 는 `AGENTS.md` 만) ② **아키텍처 2차 패스**(`arch_pass()` = `eslint --no-inline-config -c eslint.arch.config.mjs src`) + 커버리지(트래킹된 `src` 코드 파일이 전부 그 패스에 들어갔는지) ③ 경계 린트가 위반을 실제로 잡는지 임시 픽스처(`src/**/__arch__/`)로 검증 — 마지막 5건은 같은 `arch_pass()` 를 불러 인라인 지시자가 1차에서는 먹히고 2차에서는 무시되는지 대조한다(ADR-0008). `package.json` 없으면 SKIP | CI build, `check.sh`, `pnpm check:arch`       |
| `subset-font.sh <원본 ttf 경로>`              | Pretendard 원본 가변 폰트(TTF, 공식 배포 릴리스)에서 `docs/specs/theme.md` §3-F(R12) 범위(ASCII·Latin-1·구두점·₩·호환 자모·KS X 1001 한글 2,350자)만 남겨 `pyftsubset`으로 `src/app/fonts/PretendardVariable.subset.woff2` 생성. 범위를 바꿀 때 재실행                                                                                                                                                                                                              | 폰트 서브셋 갱신 시 수동                      |
| `arch-layers.mjs`                             | 레이어·허용 목록·`src/` 직속 파일·확장자 + **아키텍처 규칙 목록(`ARCH_RULES`)**의 단일 소스(데이터만, 로직 없음). `eslint.config.mjs`·`eslint.arch.config.mjs`·`check-arch.sh`가 import                                                                                                                                                                                                                                                                             | `pnpm lint`, `check-arch.sh`                  |

## 규칙

1. POSIX sh 호환 bash(`#!/usr/bin/env bash`, `set -euo pipefail`). macOS/Linux 둘 다 동작(GNU 전용 옵션 금지: `grep -P`, `sed -i ''` 차이 주의). `*.mjs`는 데이터 모듈만(로직은 셸).
2. 성공 시 조용히(마지막 한 줄 OK), 실패 시 **원인 + 고치는 명령**을 출력하고 exit 1.
3. 금지어 패턴은 절대 리터럴로 쓰지 않는다. 조각 변수 조립 방식 유지.
4. 외부 도구 의존 최소화(`git`, `grep`, `awk`, `sed`만). `jq`, `yq`, `flock` 필요하면 없을 때의 대체 경로 제공(`wt.sh`의 BOARD 락은 `flock` 없으면 `mkdir` 스핀락으로 대체).
5. 문자 수를 셀 때 `${#s}`(로케일 의존, C 로케일에서 바이트 수) 금지 — 로케일 비의존 방법(`check-author.sh`의 `cp_len`) 사용.
6. 입력 파일/경로가 없을 때 조용히 통과(false green) 금지 — 검사 대상이 없으면 실패시키거나 최소 WARN.
7. 스크립트 추가 시 이 표와 CLAUDE.md §5 갱신.
8. ESLint 의 문법(지시자·설정 주석)을 셸이나 정규식으로 다시 구현하지 않는다 — 세 라운드 연속 뚫렸다. 판정은 ESLint 를 한 번 더 돌려서 받는다(ADR-0008).

## 검증

```bash
bash -n scripts/*.sh
bash scripts/check.sh main        # 위 검사 전부(+ wt.sh 스모크 테스트)를 한 번에
bash scripts/check.sh <step>      # 하나만: forbidden-words|agents-md|author|wt|arch|lint|typecheck|test
```

## 자주 하는 실수

- `wt.sh`를 워크트리 안에서 실행 → 경로가 중첩됨. 스크립트가 거부하지만 `cd /home/user/Tasky` 먼저.
