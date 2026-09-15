#!/usr/bin/env bash
# 읽기 조건: Pretendard 서브셋 woff2 를 다시 뽑아야 할 때(범위 변경, 원본 버전 갱신).
#
# Pretendard 가변 폰트(woff2, R14) 서브셋 생성 스크립트. docs/specs/theme.md §3-F(R12) 의
# 서브셋 범위를 원본 가변 폰트(PretendardVariable.ttf)에 적용해
# src/app/fonts/PretendardVariable.subset.woff2 를 만든다.
#
# 서브셋 범위(R12):
#   - ASCII                    U+0020-007E
#   - Latin-1 보충              U+00A0-00FF
#   - 일반 구두점                U+2000-206F
#   - 원화 기호 ₩                U+20A9
#   - 한글 호환 자모              U+3131-318E
#   - KS X 1001 완성형 한글 2,350자 (EUC-KR 0xB0A1-0xC8FE 범위에서 계산, 이 스크립트가 매번 재계산한다)
#
# 필요 도구:
#   - Python 3 + fonttools(pyftsubset), woff2 인코딩용 brotli 바인딩
#       pip install fonttools brotli
#     (fonttools 4.x 는 brotli 파이썬 패키지가 있으면 --flavor=woff2 를 자체 지원한다.
#      별도 google/woff2 CLI 빌드가 필요 없다.)
#
# 사용법(재현 가능 — 범위를 바꿔 다시 뽑을 때도 이 스크립트만 다시 실행하면 된다):
#   bash scripts/subset-font.sh <원본 PretendardVariable.ttf 경로>
#   PRETENDARD_SRC=/path/to/PretendardVariable.ttf bash scripts/subset-font.sh
#
# 원본 출처(공식 배포 릴리스, R16): https://github.com/orioncactus/pretendard
#   packages/pretendard/dist/public/variable/PretendardVariable.ttf
#   이 스크립트는 원본을 내려받지 않는다 — 네트워크 정책상 막힐 수 있어 경로를 인자로 받는다.
#   같은 저장소의 LICENSE(SIL OFL 1.1)를 src/app/fonts/OFL.txt 로 그대로 동봉해야 한다(R16).

set -euo pipefail

SRC="${1:-${PRETENDARD_SRC:-}}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/src/app/fonts"
OUT_FILE="$OUT_DIR/PretendardVariable.subset.woff2"

if [ -z "$SRC" ]; then
  echo "사용법: bash scripts/subset-font.sh <PretendardVariable.ttf 경로>" >&2
  echo "  또는 PRETENDARD_SRC=<경로> bash scripts/subset-font.sh" >&2
  echo "원본(공식 배포 릴리스): https://github.com/orioncactus/pretendard" >&2
  echo "  packages/pretendard/dist/public/variable/PretendardVariable.ttf" >&2
  exit 1
fi

if [ ! -f "$SRC" ]; then
  echo "원본 폰트를 찾을 수 없습니다: $SRC" >&2
  exit 1
fi

if ! python3 -c "import fontTools" >/dev/null 2>&1; then
  echo "fonttools 가 없습니다: pip install fonttools brotli" >&2
  exit 1
fi

if ! python3 -c "import brotli" >/dev/null 2>&1; then
  echo "brotli 파이썬 패키지가 없습니다(woff2 인코딩에 필요): pip install brotli" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

UNICODES_FILE="$WORK_DIR/unicodes.txt"

# KS X 1001 완성형 한글 2,350자를 EUC-KR 코드표(0xB0A1-0xC8FE)에서 계산해 codepoint 목록으로 쓴다.
# 하드코딩된 문자 목록을 두지 않고 매번 표준에서 다시 계산하므로 범위를 바꿔도(R12 개정 시) 그대로 재사용 가능.
python3 - "$UNICODES_FILE" <<'PY'
import sys

out_path = sys.argv[1]
chars = []
for hi in range(0xB0, 0xC9):
    for lo in range(0xA1, 0xFF):
        b = bytes([hi, lo])
        try:
            ch = b.decode("euc-kr")
        except UnicodeDecodeError:
            continue
        if len(ch) == 1 and 0xAC00 <= ord(ch) <= 0xD7A3:
            chars.append(ch)

assert len(chars) == 2350, f"KS X 1001 한글은 2350자여야 하는데 {len(chars)}자 계산됨"

with open(out_path, "w", encoding="utf-8") as f:
    f.write("# ASCII\n")
    f.write("U+0020-007E\n")
    f.write("# Latin-1 보충\n")
    f.write("U+00A0-00FF\n")
    f.write("# 일반 구두점\n")
    f.write("U+2000-206F\n")
    f.write("# 원화 기호\n")
    f.write("U+20A9\n")
    f.write("# 한글 호환 자모\n")
    f.write("U+3131-318E\n")
    f.write("# KS X 1001 완성형 한글 2350자\n")
    f.write(",".join(f"U+{ord(c):04X}" for c in chars))
    f.write("\n")
PY

pyftsubset "$SRC" \
  --output-file="$OUT_FILE" \
  --flavor=woff2 \
  --unicodes-file="$UNICODES_FILE" \
  --glyph-names \
  --symbol-cmap \
  --legacy-cmap \
  --notdef-glyph \
  --notdef-outline \
  --recommended-glyphs \
  --name-IDs='*' \
  --name-legacy \
  --drop-tables+=DSIG

SIZE_BYTES="$(wc -c < "$OUT_FILE" | tr -d ' ')"
echo "생성됨: $OUT_FILE (${SIZE_BYTES} bytes)"

python3 - "$OUT_FILE" <<'PY'
import sys
from fontTools.ttLib import TTFont

path = sys.argv[1]
font = TTFont(path)
print("glyf 글리프 수:", font["maxp"].numGlyphs)
if "fvar" in font:
    axes = ", ".join(f"{a.axisTag} {a.minValue}-{a.maxValue} (기본 {a.defaultValue})" for a in font["fvar"].axes)
    print("가변 축:", axes)
else:
    print("경고: fvar 테이블이 없습니다(가변 폰트가 아님)")
PY
