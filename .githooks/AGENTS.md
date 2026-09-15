<!-- 읽기 조건: 커밋이 훅에 막혔을 때, 훅을 수정할 때. -->

# .githooks/ — AGENTS

## 목적

CI 전에 로컬에서 규칙 위반을 차단한다. `git config core.hooksPath .githooks`(`scripts/setup.sh`)로 활성화되며, 레포 config는 모든 워크트리가 공유하므로 한 번이면 된다.

## 여기 있는 것

- `pre-commit`: 스테이징된 파일에 대해 `scripts/check-forbidden-words.sh`, author가 `alfks <millie020524@gmail.com>`인지 검사
- `commit-msg`: 메시지에 AI 트레일러/서명(`Co-Authored-By: Claude…`, `Generated with Claude Code`, `Claude-Session:`), 금지어가 있으면 거부. Conventional Commits 형식(`type(scope): 제목`) 검사

## 규칙

1. 훅은 `scripts/check-*.sh`를 호출만 한다(로직 중복 금지).
2. `--no-verify`로 우회 금지. 우회가 필요하면 규칙이 잘못된 것이므로 규칙 티켓을 낸다.
3. 훅 실행 시간 < 2초 유지(스테이징 파일만 검사).
4. 훅 수정 후 `chmod +x` 유지 확인(`git update-index --chmod=+x .githooks/*`).

## 검증

```bash
git config core.hooksPath                     # .githooks
ls -l .githooks                               # 실행 권한 x
echo "test" | .githooks/commit-msg /dev/stdin # 형식 오류로 거부되어야 정상
```

## 자주 하는 실수

- 훅이 안 돌면 `core.hooksPath` 미설정. `bash scripts/setup.sh`.
- 워크트리마다 setup을 다시 할 필요 없음(공유 config).
