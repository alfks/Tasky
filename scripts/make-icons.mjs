// 읽기 조건: PWA 아이콘(`public/icon-*.png`)을 바꿀 때. 실행: `node scripts/make-icons.mjs`
//
// **아이콘 그림의 단일 소스.** 네 파일(192·512·maskable 512·apple-touch 180)은 전부 아래
// `BODY_ART` + `FACE_ART` 에서 나온다 — 손으로 고친 PNG 를 섞지 마라. 하나만 고치면 나머지
// 셋과 조용히 갈라진다.
// 그림 자체의 요구사항은 `docs/specs/pwa.md` R1·R1-a·R2 에 있다.
//
// 왜 SVG 를 브라우저로 굽는가: 이 환경에 이미지 라이브러리가 없다(sharp·PIL·ImageMagick 전부 없음).
// E2E 용 Chromium 은 이미 있으므로 그걸로 래스터한다(`PLAYWRIGHT_BROWSERS_PATH`).
//
// 네 파일의 계약이 서로 다르다:
//  - 192·512  : 둥근 사각 + **모서리 투명**(알파 있음). manifest 의 `icons` 가 가리킨다.
//  - maskable : **꽉 찬 사각**. 안드로이드가 제 모양으로 잘라내므로 캐릭터를 안전 영역(≈72%)까지 줄인다.
//  - apple    : **꽉 찬 사각 + 알파 없음**(색 타입 2). iOS 는 투명 픽셀을 검정으로 합성한다(R1-a).
//               Chromium 이 색 타입 6 으로 내보내면 `stripAlpha` 가 알파를 떼고 다시 인코딩한다.
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

import { chromium } from '@playwright/test';

const BG = '#7CC6FF'; // pwa.md R1 의 theme_color
const INK = '#2E3440'; // 눈 둘 + 코 — 하프물범의 검정
const BUMP = '#D2DAE6'; // 흰 몸 **위에** 얹힌 흰 부분(지느러미·주둥이)의 경계
const BLUSH = '#CBD3E0'; // 볼터치

/**
 * 하프물범 새끼(pwa.md R2). 통통한 달걀 몸이 살짝 기울어 머리는 왼쪽 위·꼬리는 오른쪽 아래로 간다.
 * 512 좌표계에서 그린다.
 */
const BODY_ART = `
  <g fill="#fff">
    <ellipse cx="330" cy="436" rx="56" ry="31" transform="rotate(26 330 436)"/>
    <ellipse cx="376" cy="394" rx="42" ry="28" transform="rotate(56 376 394)"/>
  </g>
  <path d="M256 96 C338 96 384 158 384 238 C384 330 344 404 300 424
           C278 436 234 436 212 424 C168 404 128 330 128 238
           C128 158 174 96 256 96 Z" fill="#fff"/>
  <g fill="${BUMP}">
    <path d="M332 270 C350 290 352 330 332 352 C314 372 298 358 302 330 C306 302 316 278 332 270 Z"/>
    <path d="M186 288 C204 306 208 346 190 368 C172 388 156 374 158 346 C160 318 170 296 186 288 Z"/>
  </g>`;

/**
 * 얼굴은 같은 크기의 점 셋(눈 둘 + 코)이 전부다 — 입선도 수염도 없다.
 *
 * **몸과 달리 기울이지 않는다.** 사진(입체)에서는 비스듬한 눈이 자연스럽지만, 납작한 아이콘에서
 * 눈높이가 어긋나면 그냥 삐뚤어져 보인다. 그래서 실루엣만 기울이고 얼굴은 수평으로 얹는다.
 * 볼터치도 여기 있다 — 몸과 같이 돌리면 오른쪽 볼이 앞지느러미와 겹쳐 얼룩이 된다.
 */
const FACE_ART = `
  <g fill="${BLUSH}">
    <ellipse cx="186" cy="252" rx="17" ry="11"/>
    <ellipse cx="320" cy="256" rx="17" ry="11"/>
  </g>
  <g fill="${BUMP}">
    <ellipse cx="240" cy="266" rx="16" ry="12"/>
    <ellipse cx="274" cy="266" rx="16" ry="12"/>
  </g>
  <g fill="${INK}">
    <circle cx="208" cy="200" r="18"/>
    <circle cx="304" cy="200" r="18"/>
    <circle cx="256" cy="238" r="17"/>
  </g>`;

/** `radius` 0 = 꽉 찬 사각, `scale` < 1 = maskable 안전 영역용 축소. */
const svg = ({ radius, scale = 1 }) => {
  const fit = `translate(${256 * (1 - scale)} ${256 * (1 - scale)}) scale(${scale})`;
  return `
  <svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <rect width="512" height="512" rx="${radius}" fill="${BG}"/>
    <g transform="${fit} translate(12 -8)">
      <g transform="rotate(-12 256 256)">${BODY_ART}</g>
      ${FACE_ART}
    </g>
  </svg>`;
};

const TARGETS = [
  { file: 'icon-192.png', size: 192, radius: 115, alpha: true },
  { file: 'icon-512.png', size: 512, radius: 115, alpha: true },
  { file: 'icon-maskable-512.png', size: 512, radius: 0, scale: 0.72, alpha: true },
  { file: 'icon-apple-touch-180.png', size: 180, radius: 0, alpha: false },
];

// --- PNG 알파 제거(색 타입 6 → 2) ---------------------------------------------
// apple-touch 만 필요하다. 배경이 이미 불투명하므로 알파 채널을 버리기만 하면 된다.
function stripAlpha(buf) {
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  // Chromium 은 스크린샷에 투명 픽셀이 하나도 없으면 이미 색 타입 2 로 내보낸다(실측). 그때는 그대로 쓴다.
  // 이 분기를 "그러니 변환은 필요 없다" 로 읽지 마라 — 그 판단은 Chromium 의 인코더 사정이고,
  // R1-a 가 요구하는 것은 **결과 파일에 알파가 없다**는 것이다. 색 타입 6 으로 나오면 아래가 떼어 낸다.
  if (buf[24] === 8 && buf[25] === 2) return buf;
  if (buf[24] !== 8 || buf[25] !== 6) throw new Error(`예상 밖 PNG: ${buf[24]}/${buf[25]}`);
  const idat = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    if (buf.toString('ascii', off + 4, off + 8) === 'IDAT')
      idat.push(buf.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const srcStride = width * 4;
  const rgba = Buffer.alloc(height * srcStride);
  let pos = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[pos];
    pos += 1;
    const line = raw.subarray(pos, pos + srcStride);
    pos += srcStride;
    const cur = rgba.subarray(y * srcStride, (y + 1) * srcStride);
    const prev = y > 0 ? rgba.subarray((y - 1) * srcStride, y * srcStride) : null;
    for (let x = 0; x < srcStride; x += 1) {
      const a = x >= 4 ? cur[x - 4] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= 4 ? prev[x - 4] : 0;
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
  const dstStride = width * 3;
  const out = Buffer.alloc(height * (dstStride + 1));
  for (let y = 0; y < height; y += 1) {
    out[y * (dstStride + 1)] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      const src = y * srcStride + x * 4;
      const dst = y * (dstStride + 1) + 1 + x * 3;
      out[dst] = rgba[src];
      out[dst + 1] = rgba[src + 1];
      out[dst + 2] = rgba[src + 2];
    }
  }
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  const crc32 = (b) => {
    let c = -1;
    for (const byte of b) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
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
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // truecolor, 알파 없음
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(out, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- 래스터 --------------------------------------------------------------------
// 이 환경의 Chromium 은 `playwright install` 이 막혀 있어 경로를 직접 찾는다(playwright.config.ts 와 같은 이유).
function installedChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (root === undefined || root === '' || !existsSync(root)) return undefined;
  return readdirSync(root)
    .filter((d) => d.startsWith('chromium'))
    .sort((a, b) => Number(b.includes('headless')) - Number(a.includes('headless')))
    .flatMap((d) => [
      join(root, d, 'chrome-linux', 'headless_shell'),
      join(root, d, 'chrome-linux', 'chrome'),
    ])
    .find((p) => existsSync(p));
}

const browser = await chromium.launch({ executablePath: installedChromium() });
try {
  for (const { file, size, radius, scale, alpha } of TARGETS) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<!doctype html><meta charset="utf-8">
       <style>html,body{margin:0;padding:0;background:transparent}
       svg{display:block;width:${size}px;height:${size}px}</style>
       ${svg({ radius, scale })}`,
    );
    const shot = await page.screenshot({ omitBackground: true });
    await page.close();
    const png = alpha ? shot : stripAlpha(shot);
    writeFileSync(`public/${file}`, png);
    process.stdout.write(
      `  ${file.padEnd(26)} ${size}×${size}  ${png.length} B  ${alpha ? '알파 있음' : '알파 없음'}\n`,
    );
  }
} finally {
  await browser.close();
}
process.stdout.write('OK: 아이콘 4종 생성 — 확인은 `pnpm build`(scripts/check-dist.mjs)\n');
