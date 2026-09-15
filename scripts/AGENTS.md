<!-- 읽기 조건: scripts/*.sh 가 실패했거나, 스크립트를 추가·수정할 때. 사용법만 필요하면 CLAUDE.md §5로 충분. -->

# scripts/ — AGENTS

## 목적
협업 규칙을 명령 한 줄로 만든다. 로컬 훅과 CI가 **같은 스크립트**를 호출하므로 로직은 여기에만 있다.

## 여기 있는 것
| 스크립트 | 역할 | 호출처 |
|---------|------|-------|
| `setup.sh` | author config, `core.hooksPath=.githooks`, `pnpm install`(있을 때) | 사람/에이전트 최초 1회 |
| `wt.sh new|rm|list` | 워크트리 생성/정리/목록 + BOARD.md 갱신 | 구현자·오케스트레이터 |
| `check-forbidden-words.sh [paths…]` | 금지어 검사(조각 조립 정규식) | pre-commit, CI, 수동 |
| `check-author.sh <base>` | `<base>..HEAD` 커밋 author/트레일러 검증 | CI, 수동 |
| `check-agents-md.sh` | 대상 디렉토리마다 `AGENTS.md` 존재·60줄 이하 검사 | CI, 수동 |

## 규칙
1. POSIX sh 호환 bash(`#!/usr/bin/env bash`, `set -euo pipefail`). macOS/Linux 둘 다 동작(GNU 전용 옵션 금지: `grep -P`, `sed -i ''` 차이 주의).
2. 성공 시 조용히(마지막 한 줄 OK), 실패 시 **원인 + 고치는 명령**을 출력하고 exit 1.
3. 금지어 패턴은 절대 리터럴로 쓰지 않는다. 조각 변수 조립 방식 유지.
4. 외부 도구 의존 최소화(`git`, `grep`, `awk`, `sed`만). `jq`, `yq` 필요하면 없을 때의 대체 경로 제공.
5. 스크립트 추가 시 이 표와 CLAUDE.md §5 갱신.

## 검증
```bash
bash -n scripts/*.sh
bash scripts/check-forbidden-words.sh && bash scripts/check-agents-md.sh && bash scripts/check-author.sh main
```

## 자주 하는 실수
- `wt.sh`를 워크트리 안에서 실행 → 경로가 중첩됨. 스크립트가 거부하지만 `cd /home/user/Tasky` 먼저.
