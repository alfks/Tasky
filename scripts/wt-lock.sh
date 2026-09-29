#!/usr/bin/env bash
# 읽기 조건: wt.sh BOARD 락의 획득·반납 경로나 mkdir 호환성 검사를 바꿀 때.
# wt.sh가 ROOT/WT_DIR/BOARD를 정한 뒤 source한다. 단독 실행하지 않는다.

_board_lock_dir="$WT_DIR/.board.lock.d"
_board_lock_fd=""
_board_lock_held=""
_board_lock_mkdir=""

board_lock_prepare() {
  # flock이 없을 때만 실제 외부 GNU mkdir의 실패 코드를 락의 배타성 근거로 사용한다.
  command -v flock >/dev/null 2>&1 && return 0
  [ -n "$_board_lock_mkdir" ] && return 0
  local tool candidate version
  for tool in gnumkdir mkdir; do
    candidate="$(type -P "$tool" 2>/dev/null || true)"
    [ -n "$candidate" ] || continue
    version="$(LC_ALL=C "$candidate" --version 2>/dev/null)" || continue
    version="${version%%$'\n'*}"
    case "$version" in
      'mkdir (GNU coreutils) '*) _board_lock_mkdir="$candidate"; return 0 ;;
    esac
  done
  echo "ERROR: BOARD mkdir 락에는 GNU coreutils mkdir가 필요합니다; flock 또는 GNU mkdir를 제공하세요" >&2
  return 1
}

board_lock_acquire() {
  board_lock_prepare || return 1
  mkdir -p "$WT_DIR"
  if command -v flock >/dev/null 2>&1; then
    exec 9>"$WT_DIR/.board.flock"
    flock -w 20 9 || { echo "ERROR: BOARD 락 획득 실패(20초 대기, flock)"; exit 1; }
    _board_lock_fd=9
    _board_lock_held=flock
  else
    local tries=0
    until "$_board_lock_mkdir" "$_board_lock_dir" 2>/dev/null; do
      tries=$((tries + 1))
      [ "$tries" -le 200 ] || {
        echo "ERROR: BOARD 락 획득 실패(20초 대기, mkdir 락, 보유자 PID $(cat "$_board_lock_dir/pid" 2>/dev/null || echo '알 수 없음'))" >&2
        echo "  stale 여부와 보유자 종료를 수동 확인하세요: $_board_lock_dir/pid" >&2
        exit 1
      }
      sleep 0.1
    done
    printf '%s\n' "$$" > "$_board_lock_dir/pid" || { echo "ERROR: BOARD 락 PID 기록 실패; 락 상태를 수동 확인하세요" >&2; exit 1; }
    _board_lock_held=mkdir
  fi
}

board_lock_release() {
  # 이 프로세스가 실제로 획득한 락만 반납한다 — 획득에 실패했거나 아직 시도하지 않은 경우는 no-op.
  local held="$_board_lock_held" fd="$_board_lock_fd" owner=''
  _board_lock_held=""
  _board_lock_fd=""
  [ -n "$held" ] || return 0
  if [ "$held" = flock ]; then
    flock -u "$fd" 2>/dev/null || true
    exec 9>&- 2>/dev/null || true
  else
    # bash 5.2는 set -e 아래 `$(< 없는파일)`이 `if !` 안에서도 셸을 끝내므로, 일반 builtin 리다이렉션으로 먼저 열어 본다.
    if ! true < "$_board_lock_dir/pid" || ! owner="$(< "$_board_lock_dir/pid")" || [ "$owner" != "$$" ]; then
      echo "ERROR: BOARD 락 PID 읽기 실패 또는 소유자 불일치; 락을 보존합니다" >&2
      return 1
    fi
    if ! rm "$_board_lock_dir/pid" || ! rmdir "$_board_lock_dir"; then
      echo "ERROR: BOARD 락 해제 실패; 남은 락을 수동 확인하세요" >&2
      return 1
    fi
  fi
}

# 정상 종료·에러 종료 어느 쪽이든 락을 반드시 반납한다(들고 있지 않으면 조용히 no-op).
trap board_lock_release EXIT
