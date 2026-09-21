// 읽기 조건: PWA 아이콘(`public/icon-*.png`)을 바꿀 때. 실행: `node scripts/make-icons.mjs`
//
// **그림을 그리지 않는다.** 캐릭터는 `assets/seal-sheet.png` 의 확정본이고, 이 스크립트가 하는
// 일은 거기서 한 마리를 오려 배경 위에 얹는 것뿐이다. 선 하나도 다시 그리지 마라 — 요구사항은
// `docs/specs/pwa.md` R2·R2-a 에 있다. 축소만은 피할 수 없어서 면적 평균으로 줄인다(가장 충실한
// 방법 — 최근접 이웃으로 줄이면 윤곽선이 들쭉날쭉해진다).
//
// 브라우저를 쓰지 않는다. 이 환경에 이미지 라이브러리가 없어(sharp·PIL·ImageMagick 전부 없음)
// PNG 디코드·인코드와 리샘플링을 직접 한다. 예전 판은 SVG 를 Chromium 으로 구웠는데, 이제
// 그릴 것이 없으므로 그 의존이 사라졌다.
//
// 네 파일의 계약이 서로 다르다:
//  - 192·512  : 둥근 사각 + **모서리 투명**(알파 있음). manifest 의 `icons` 가 가리킨다.
//  - maskable : **꽉 찬 사각**. 안드로이드가 제 모양으로 잘라내므로 캐릭터를 더 작게 앉힌다.
//  - apple    : **꽉 찬 사각 + 알파 없음**(색 타입 2). iOS 는 투명 픽셀을 검정으로 합성한다(R1-a).
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

const SHEET = 'assets/seal-sheet.png';
const BG = [0x7c, 0xc6, 0xff]; // #7CC6FF — pwa.md R1 의 theme_color

/** `height` 는 캔버스 대비 캐릭터 높이 비율. maskable 만 안전 영역 때문에 작다. */
const TARGETS = [
  { file: 'icon-192.png', size: 192, radius: 0.2246, height: 0.78, alpha: true },
  { file: 'icon-512.png', size: 512, radius: 0.2246, height: 0.78, alpha: true },
  { file: 'icon-maskable-512.png', size: 512, radius: 0, height: 0.62, alpha: true },
  { file: 'icon-apple-touch-180.png', size: 180, radius: 0, height: 0.78, alpha: false },
];

// --- PNG 디코드(8bit, 색 타입 2·6) ---------------------------------------------
function decodePng(buf) {
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6))
    throw new Error(`지원하지 않는 PNG: 비트깊이 ${bitDepth}, 색 타입 ${colorType}`);
  const ch = colorType === 6 ? 4 : 3;
  const idat = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    if (buf.toString('ascii', off + 4, off + 8) === 'IDAT')
      idat.push(buf.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * ch;
  const out = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[pos];
    pos += 1;
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= ch ? cur[x - ch] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= ch ? prev[x - ch] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`알 수 없는 PNG 필터 ${filter}`);
      cur[x] = v & 0xff;
    }
  }
  return { width, height, ch, data: out };
}

// --- PNG 인코드 -----------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (b) => {
  let c = -1;
  for (const byte of b) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
/** `alpha` false 면 색 타입 2 로 내보낸다 — apple-touch 의 요구사항(R1-a). */
function encodePng(size, rgba, alpha) {
  const ch = alpha ? 4 : 3;
  const stride = size * ch;
  const out = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y += 1) {
    out[y * (stride + 1)] = 0; // filter: none
    for (let x = 0; x < size; x += 1) {
      const src = (y * size + x) * 4;
      const dst = y * (stride + 1) + 1 + x * ch;
      out[dst] = rgba[src];
      out[dst + 1] = rgba[src + 1];
      out[dst + 2] = rgba[src + 2];
      if (alpha) out[dst + 3] = rgba[src + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(out, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- 시트에서 한 마리 오려 내기 -------------------------------------------------
/**
 * 배경은 "밝고 채도가 낮은" 픽셀이다 — 흰 종이와 연베이지 그림자가 여기 들어간다. 캐릭터의
 * 흰 몸도 같은 조건이지만 **갈색 윤곽선에 둘러싸여** 있어 테두리에서 들어오는 플러드 필이 닿지
 * 못한다. 그래서 색이 아니라 **연결성**으로 가른다 — 색만 보고 지우면 몸이 통째로 날아간다.
 *
 * 그 다음 전경 덩어리에 라벨을 붙여 bounding box 가 가장 큰 것을 고른다. 글씨·하트·반짝임은
 * 각자 다른 덩어리라 자동으로 빠지고, 자른 사각형 안에 걸쳐 있어도 알파 0 이 된다.
 */
function cutLargestFigure(img) {
  const { width, height, ch, data } = img;
  const n = width * height;
  const isLight = (i) => {
    const p = i * ch;
    const min = Math.min(data[p], data[p + 1], data[p + 2]);
    const max = Math.max(data[p], data[p + 1], data[p + 2]);
    return min > 198 && max - min < 44;
  };

  const bg = new Uint8Array(n);
  const stack = [];
  for (let x = 0; x < width; x += 1) stack.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y += 1) stack.push(y * width, y * width + width - 1);
  while (stack.length > 0) {
    const i = stack.pop();
    if (bg[i] === 1 || !isLight(i)) continue;
    bg[i] = 1;
    const x = i % width;
    const y = (i - x) / width;
    if (x > 0) stack.push(i - 1);
    if (x < width - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - width);
    if (y < height - 1) stack.push(i + width);
  }

  const label = new Int32Array(n).fill(-1);
  let best = null;
  let figures = 0;
  for (let start = 0; start < n; start += 1) {
    if (bg[start] === 1 || label[start] !== -1) continue;
    const id = figures;
    figures += 1;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    const queue = [start];
    label[start] = id;
    while (queue.length > 0) {
      const i = queue.pop();
      const x = i % width;
      const y = (i - x) / width;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const push = (j) => {
        if (j >= 0 && j < n && bg[j] === 0 && label[j] === -1) {
          label[j] = id;
          queue.push(j);
        }
      };
      if (x > 0) push(i - 1);
      if (x < width - 1) push(i + 1);
      if (y > 0) push(i - width);
      if (y < height - 1) push(i + width);
    }
    const area = (maxX - minX + 1) * (maxY - minY + 1);
    if (best === null || area > best.area) best = { id, area, minX, maxX, minY, maxY };
  }
  if (best === null) throw new Error(`${SHEET} 에서 캐릭터를 찾지 못했습니다.`);

  const cw = best.maxX - best.minX + 1;
  const chh = best.maxY - best.minY + 1;
  const rgba = Buffer.alloc(cw * chh * 4);
  for (let y = 0; y < chh; y += 1) {
    for (let x = 0; x < cw; x += 1) {
      const si = (y + best.minY) * width + (x + best.minX);
      const di = (y * cw + x) * 4;
      const sp = si * ch;
      rgba[di] = data[sp];
      rgba[di + 1] = data[sp + 1];
      rgba[di + 2] = data[sp + 2];
      rgba[di + 3] = label[si] === best.id ? 255 : 0;
    }
  }
  return { width: cw, height: chh, rgba, figures };
}

// --- 면적 평균 축소 -------------------------------------------------------------
// 알파를 **미리 곱해** 평균한다. 그냥 평균하면 투명한 가장자리의 색까지 섞여 흰 테가 생긴다.
function resize(src, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  const sx = src.width / dw;
  const sy = src.height / dh;
  for (let dy = 0; dy < dh; dy += 1) {
    const y0 = dy * sy;
    const y1 = y0 + sy;
    for (let dx = 0; dx < dw; dx += 1) {
      const x0 = dx * sx;
      const x1 = x0 + sx;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let weight = 0;
      for (let y = Math.floor(y0); y < Math.ceil(y1); y += 1) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        for (let x = Math.floor(x0); x < Math.ceil(x1); x += 1) {
          const wx = Math.min(x + 1, x1) - Math.max(x, x0);
          const k = wx * wy;
          const i = (y * src.width + x) * 4;
          const al = src.rgba[i + 3] / 255;
          r += src.rgba[i] * al * k;
          g += src.rgba[i + 1] * al * k;
          b += src.rgba[i + 2] * al * k;
          a += al * k;
          weight += k;
        }
      }
      const o = (dy * dw + dx) * 4;
      const alpha = a / weight;
      out[o] = alpha === 0 ? 0 : Math.round(r / weight / alpha);
      out[o + 1] = alpha === 0 ? 0 : Math.round(g / weight / alpha);
      out[o + 2] = alpha === 0 ? 0 : Math.round(b / weight / alpha);
      out[o + 3] = Math.round(alpha * 255);
    }
  }
  return { width: dw, height: dh, rgba: out };
}

// --- 둥근 사각 배경 + 합성 ------------------------------------------------------
/** 4×4 슈퍼샘플로 모서리를 부드럽게 딴다 — 계단이 보이면 그 즉시 아이콘 티가 난다. */
function roundedRectAlpha(size, radius) {
  const cov = new Float32Array(size * size);
  const inside = (x, y) => {
    if (radius <= 0) return true;
    const cx = x < radius ? radius : x > size - radius ? size - radius : x;
    const cy = y < radius ? radius : y > size - radius ? size - radius : y;
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= radius * radius;
  };
  const samples = 4;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let hit = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          if (inside(x + (sx + 0.5) / samples, y + (sy + 0.5) / samples)) hit += 1;
        }
      }
      cov[y * size + x] = hit / (samples * samples);
    }
  }
  return cov;
}

function compose(figure, { size, radius, height, alpha }) {
  const fh = Math.round(size * height);
  const fw = Math.round((figure.width / figure.height) * fh);
  const seal = resize(figure, fw, fh);
  const ox = Math.round((size - fw) / 2);
  const oy = Math.round((size - fh) / 2);
  const cov = roundedRectAlpha(size, radius * size);

  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const o = (y * size + x) * 4;
      const bgAlpha = alpha ? cov[y * size + x] : 1;
      let r = BG[0];
      let g = BG[1];
      let b = BG[2];
      let a = bgAlpha;
      const fx = x - ox;
      const fy = y - oy;
      if (fx >= 0 && fx < fw && fy >= 0 && fy < fh) {
        // 캐릭터도 배경 알파로 한 번 곱한다 — 둥근 모서리 밖으로 삐져나가지 않게.
        const sa = (seal.rgba[(fy * fw + fx) * 4 + 3] / 255) * bgAlpha;
        const outA = sa + a * (1 - sa); // source-over
        if (outA > 0) {
          const i = (fy * fw + fx) * 4;
          r = (seal.rgba[i] * sa + BG[0] * a * (1 - sa)) / outA;
          g = (seal.rgba[i + 1] * sa + BG[1] * a * (1 - sa)) / outA;
          b = (seal.rgba[i + 2] * sa + BG[2] * a * (1 - sa)) / outA;
        }
        a = outA;
      }
      out[o] = Math.round(r);
      out[o + 1] = Math.round(g);
      out[o + 2] = Math.round(b);
      out[o + 3] = Math.round(a * 255);
    }
  }
  return out;
}

const sheet = decodePng(readFileSync(SHEET));
const figure = cutLargestFigure(sheet);
process.stdout.write(
  `${SHEET} ${sheet.width}×${sheet.height} → 덩어리 ${figure.figures}개 중 가장 큰 ` +
    `${figure.width}×${figure.height} 을 오렸습니다.\n`,
);
for (const target of TARGETS) {
  const png = encodePng(target.size, compose(figure, target), target.alpha);
  writeFileSync(`public/${target.file}`, png);
  process.stdout.write(
    `  ${target.file.padEnd(26)} ${target.size}×${target.size}  ${png.length} B  ` +
      `${target.alpha ? '알파 있음' : '알파 없음'}\n`,
  );
}
process.stdout.write('OK: 아이콘 4종 생성 — 확인은 `pnpm build`(scripts/check-dist.mjs)\n');
