<!-- 읽기 조건: scripts/*.sh 가 실패했거나, 스크립트를 추가·수정할 때. 사용법만 필요하면 CLAUDE.md §5로 충분. -->

# scripts/ — AGENTS

## 목적
협업 규칙을 명령 한 줄로 만든다. 로컬 훅과 CI가 **같은 스크립트**를 호출하므로 로직은 여기에만 있다.

## 여기 있는 것
| 스크립트 | 역할 | 호출처 |
|---------|------|-------|
| `setup.sh` | author config, `core.hooksPath=.githooks`, `pnpm install`(있을 때) | 사람/에이전트 최초 1회 |
| `wt.sh new|rm|list` | 워크트리 생성/정리/목록 + BOARD.md 갱신(락으로 보호) | 구현자·오케스트레이터 |
| `check.sh [base]` | 아래 3개 가드(+ 있으면 `pnpm lint/typecheck/test`)를 한 번에 실행, 결과 요약 | 커밋/PR 전 수동, `wt.sh new` 안내 |
| `check-forbidden-words.sh [paths…]` | 금지어 검사(조각 조립 정규식) | pre-commit, CI, 수동 |
| `check-author.sh <base>` | `<base>..HEAD` 커밋 author/트레일러 검증 | CI, 수동 |
| `check-agents-md.sh` | 트래킹 파일이 있는 모든 디렉토리마다 `AGENTS.md` 존재(상위의 `관할:` 선언 시 면제)·60줄 이하 검사 | CI, 수동 |
| `check-eslint-disable.sh [file…]` | `src/` 의 `eslint-disable` 정책(규칙명 없음·아키텍처 규칙·사유 없음·인라인 설정 금지). 규칙 목록의 단일 소스 | pre-commit 아님, CI guard, `check.sh`, `check-arch.sh` |
| `check-arch.sh` | 레이어 경계 린트가 위반을 실제로 잡는지 임시 픽스처(`src/**/__arch__/`)로 검증. `package.json` 없으면 SKIP | CI build, `check.sh`, `pnpm check:arch` |

## 규칙
1. POSIX sh 호환 bash(`#!/usr/bin/env bash`, `set -euo pipefail`). macOS/Linux 둘 다 동작(GNU 전용 옵션 금지: `grep -P`, `sed -i ''` 차이 주의).
2. 성공 시 조용히(마지막 한 줄 OK), 실패 시 **원인 + 고치는 명령**을 출력하고 exit 1.
3. 금지어 패턴은 절대 리터럴로 쓰지 않는다. 조각 변수 조립 방식 유지.
4. 외부 도구 의존 최소화(`git`, `grep`, `awk`, `sed`만). `jq`, `yq`, `flock` 필요하면 없을 때의 대체 경로 제공(`wt.sh`의 BOARD 락은 `flock` 없으면 `mkdir` 스핀락으로 대체).
5. 문자 수를 셀 때 `${#s}`(로케일 의존, C 로케일에서 바이트 수) 금지 — 로케일 비의존 방법(`check-author.sh`의 `cp_len`) 사용.
6. 입력 파일/경로가 없을 때 조용히 통과(false green) 금지 — 검사 대상이 없으면 실패시키거나 최소 WARN.
7. 스크립트 추가 시 이 표와 CLAUDE.md §5 갱신.

## 검증
```bash
bash -n scripts/*.sh
bash scripts/check.sh main   # 위 3개 가드를 한 번에
```

## 자주 하는 실수
- `wt.sh`를 워크트리 안에서 실행 → 경로가 중첩됨. 스크립트가 거부하지만 `cd /home/user/Tasky` 먼저.
