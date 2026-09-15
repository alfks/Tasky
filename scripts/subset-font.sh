#!/usr/bin/env bash
# 읽기 조건: Pretendard 서브셋 woff2 를 다시 뽑아야 할 때(범위 변경, 원본 버전 갱신).
#
# Pretendard 가변 폰트(woff2, R14) 서브셋 생성 스크립트. docs/specs/theme.md §3-F(R12) 의
# 서브셋 범위를 원본 가변 폰트(PretendardVariable.ttf)에 적용해
# public/fonts/PretendardVariable.subset-<내용해시>.woff2 를 만든다.
#
# 파일명에 내용 해시가 들어가는 이유(R14): public/ 자산은 번들러를 거치지 않아 해시가 자동으로
# 붙지 않는데, public/_headers 의 `/fonts/*` 가 1년 immutable 캐시를 건다. 해시가 없으면 폰트를
# 바꿔도 1년 동안 낡은 파일이 나간다 — 해시와 immutable 은 한 쌍이다. 이 스크립트가 해시를 붙이고,
# 낡은 해시 파일을 지우고, src/styles/fonts.css 의 url() 까지 함께 갱신한다(손으로 고치지 않는다).
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
#   같은 저장소의 LICENSE(SIL OFL 1.1)를 public/fonts/OFL.txt 로 그대로 동봉해야 한다(R16).

set -euo pipefail

SRC="${1:-${PRETENDARD_SRC:-}}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/public/fonts"
BASENAME="PretendardVariable.subset"
FONTS_CSS="$ROOT_DIR/src/styles/fonts.css"

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

TMP_OUT="$WORK_DIR/subset.woff2"

pyftsubset "$SRC" \
  --output-file="$TMP_OUT" \
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

# 내용 해시(sha256 앞 8자리)를 파일명에 넣는다. python3 는 위에서 이미 필수 의존이라
# sha256sum/shasum 의 플랫폼 차이를 피해 hashlib 로 계산한다(scripts/AGENTS.md 규칙 1·4).
HASH="$(python3 -c "import hashlib,sys;print(hashlib.sha256(open(sys.argv[1],'rb').read()).hexdigest()[:8])" "$TMP_OUT")"
OUT_FILE="$OUT_DIR/${BASENAME}-${HASH}.woff2"

# 산출물 검증(R12·R14). 하나라도 어긋나면 낡은 파일을 남긴 채 실패한다 — 조용한 성공 금지.
python3 - "$TMP_OUT" "$SRC" <<'VERIFY'
import hashlib
import sys

from fontTools.ttLib import TTFont

out_path, src_path = sys.argv[1], sys.argv[2]
font = TTFont(out_path)
cmap = set(font.getBestCmap())

ks = set()
for hi in range(0xB0, 0xC9):
    for lo in range(0xA1, 0xFF):
        try:
            ch = bytes([hi, lo]).decode("euc-kr")
        except UnicodeDecodeError:
            continue
        if len(ch) == 1 and 0xAC00 <= ord(ch) <= 0xD7A3:
            ks.add(ord(ch))
assert len(ks) == 2350, f"KS X 1001 한글은 2350자여야 하는데 {len(ks)}자 계산됨"

missing = sorted(ks - cmap)
assert not missing, f"KS X 1001 한글 {len(missing)}자가 서브셋에 없습니다: {[hex(c) for c in missing[:5]]}"

assert "fvar" in font, "fvar 테이블이 없습니다 — 가변 폰트가 아닙니다(R10)"
axes = {a.axisTag: (a.minValue, a.maxValue) for a in font["fvar"].axes}
assert "wght" in axes, f"wght 축이 없습니다: {sorted(axes)}"

with open(out_path, "rb") as f:
    size = len(f.read())
limit = 600 * 1024
assert size <= limit, f"{size}B > {limit}B — R14 용량 상한 초과"

with open(src_path, "rb") as f:
    src_md5 = hashlib.md5(f.read()).hexdigest()
src_ver = TTFont(src_path)["name"].getDebugName(5)
print(f"원본: {src_path}")
print(f"  md5 {src_md5} · 버전 {src_ver}")
print(f"글리프 {font['maxp'].numGlyphs}개 · cmap {len(cmap)}자 · KS X 1001 2350/2350")
print("가변 축: " + ", ".join(f"{t} {lo}-{hi}" for t, (lo, hi) in sorted(axes.items())))
print(f"용량 {size}B <= {limit}B")
VERIFY

# 낡은 해시본(과 해시 이전 이름)을 지운다 — 남겨 두면 1년 immutable 캐시에 유령 파일이 쌓인다.
for old in "$OUT_DIR/$BASENAME".woff2 "$OUT_DIR/$BASENAME"-*.woff2; do
  if [ -f "$old" ] && [ "$old" != "$OUT_FILE" ]; then
    rm -f "$old"
    echo "낡은 산출물 삭제: $old"
  fi
done

mv "$TMP_OUT" "$OUT_FILE"
echo "생성됨: $OUT_FILE"

# @font-face 의 url() 을 새 파일명으로 맞춘다. 둘이 어긋나면 폰트가 404 로 조용히 폴백된다.
if [ ! -f "$FONTS_CSS" ]; then
  echo "$FONTS_CSS 가 없습니다 — @font-face 선언이 있어야 폰트가 적용됩니다." >&2
  exit 1
fi

python3 - "$FONTS_CSS" "$HASH" "$BASENAME" <<'SYNC'
import re
import sys

path, new_hash, basename = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path, encoding="utf-8") as f:
    css = f.read()
pattern = re.compile(re.escape(basename) + r"(?:-[0-9a-f]{8})?\.woff2")
assert pattern.search(css), f"{path} 에서 {basename}*.woff2 url 을 찾지 못했습니다"
with open(path, "w", encoding="utf-8") as f:
    f.write(pattern.sub(f"{basename}-{new_hash}.woff2", css))
print(f"갱신됨: {path} -> {basename}-{new_hash}.woff2")
SYNC
