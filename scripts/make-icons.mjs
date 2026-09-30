// 읽기 조건: PWA 아이콘(`public/icon-*.png`)을 바꿀 때. 실행: `node scripts/make-icons.mjs`
// 현재 배포 마스코트의 크기별 원본 픽셀을 보존하고, 흰 배경 연결 영역만 교체한다.
// 원본 3종은 assets/에 있으므로 public 프리캐시 크기가 늘지 않는다.
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

const BACKGROUND = [247, 247, 247]; // #F7F7F7 — docs/specs/pwa.md R2-b
const EDGE_FLOOR = 130; // 갈색 외곽선 안쪽으로 플러드 필이 넘어가지 않게 한다.
const TARGETS = [
  { master: 'assets/seal-icon-master-192.png', output: 'public/icon-192.png', size: 192 },
  { master: 'assets/seal-icon-master-512.png', output: 'public/icon-512.png', size: 512 },
  { master: 'assets/seal-icon-master-512.png', output: 'public/icon-maskable-512.png', size: 512 },
  {
    master: 'assets/seal-icon-master-180.png',
    output: 'public/icon-apple-touch-180.png',
    size: 180,
  },
];

function decodePng(buf) {
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];
  if (bitDepth !== 8 || colorType !== 2 || width !== height)
    throw new Error(
      `RGB 정사각 PNG가 아닙니다: ${width}×${height}, ${bitDepth}bit type ${colorType}`,
    );
  const idat = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    if (buf.toString('ascii', off + 4, off + 8) === 'IDAT')
      idat.push(buf.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 3;
  const data = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = data.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? data.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= 3 ? cur[x - 3] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= 3 ? prev[x - 3] : 0;
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
      } else if (filter !== 0) throw new Error(`지원하지 않는 PNG 필터 ${filter}`);
      cur[x] = v & 255;
    }
  }
  return { width, data };
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();
function chunk(type, data) {
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  let crc = -1;
  for (const byte of body) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  const trailer = Buffer.alloc(4);
  trailer.writeUInt32BE((crc ^ -1) >>> 0);
  return Buffer.concat([header, body, trailer]);
}
function encodePng(size, data) {
  const stride = size * 3;
  const raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB 불투명 — iOS 홈 화면에서도 검은 모서리가 생기지 않는다.
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function recolorBackground({ width, data }) {
  for (const i of [0, width - 1, width * (width - 1), width * width - 1]) {
    const p = i * 3;
    if (data[p] !== 255 || data[p + 1] !== 255 || data[p + 2] !== 255)
      throw new Error('원본 아이콘 모서리가 순백이 아닙니다. 중복 배경 변경을 중단합니다.');
  }
  const n = width * width;
  const outside = new Uint8Array(n);
  const stack = [];
  for (let x = 0; x < width; x += 1) stack.push(x, (width - 1) * width + x);
  for (let y = 0; y < width; y += 1) stack.push(y * width, y * width + width - 1);
  let count = 0;
  while (stack.length > 0) {
    const i = stack.pop();
    if (outside[i]) continue;
    const p = i * 3;
    const minimum = Math.min(data[p], data[p + 1], data[p + 2]);
    if (minimum < EDGE_FLOOR) continue;
    outside[i] = 1;
    count += 1;
    // 경계의 혼합 픽셀만 비례해 바꾸고, 외곽선 안쪽의 원본 픽셀은 그대로 둔다.
    const weight = (minimum - EDGE_FLOOR) / (255 - EDGE_FLOOR);
    for (let channel = 0; channel < 3; channel += 1)
      data[p + channel] -= Math.round((255 - BACKGROUND[channel]) * weight);
    const x = i % width;
    const y = (i - x) / width;
    if (x > 0) stack.push(i - 1);
    if (x < width - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - width);
    if (y < width - 1) stack.push(i + width);
  }
  if (outside[(width >> 1) * width + (width >> 1)] || count < n / 2 || count > (n * 4) / 5)
    throw new Error(`배경 영역 판정 실패: ${width}×${width}, ${count}픽셀`);
  return count;
}

const rendered = TARGETS.map((target) => {
  const master = decodePng(readFileSync(target.master));
  if (master.width !== target.size) throw new Error(`${target.master}: 크기 불일치`);
  const count = recolorBackground(master);
  const png = encodePng(target.size, master.data);
  return { target, count, png };
});
for (const { target, count, png } of rendered) {
  writeFileSync(target.output, png);
  process.stdout.write(
    `${target.output}: ${target.size}×${target.size}, 배경 ${count}픽셀, ${png.length} B\n`,
  );
}
