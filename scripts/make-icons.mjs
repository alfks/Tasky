// 읽기 조건: PWA 아이콘(`public/icon-*.png`)을 바꿀 때. 실행: `node scripts/make-icons.mjs`
//
// **아이콘 그림의 단일 소스.** 네 파일(192·512·maskable 512·apple-touch 180)은 전부 아래
// `ART` 에서 나온다 — 손으로 고친 PNG 를 섞지 마라. 하나만 고치면 나머지 셋과 조용히 갈라진다.
//
// 도형(원·타원)을 겹쳐 만들지 않는다. 몸은 베지어 윤곽선 **하나**이고, 부피는 그라데이션이,
// 질감은 털결 몇 가닥이 만든다 — 그래야 "조립한 도형"이 아니라 그림으로 읽힌다.
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
const INK = '#2F3542'; // 눈 둘 + 코 — 하프물범의 검정

/**
 * 몸 + 꼬리를 **윤곽선 하나**로 뜬다. 좌우 곡률이 일부러 다르다 — 타원 두 개를 겹친 것이 아니라
 * 손으로 그린 선으로 읽히게 하는 것이 요점이다. 오른쪽 아래에서 꼬리 두 갈래가 자라 나온다.
 */
const SILHOUETTE = `M248 74
  C314 72 364 112 380 170
  C395 222 392 282 374 330
  C402 340 430 362 438 390
  C443 407 428 419 407 414
  C415 429 404 445 383 447
  C355 450 328 433 311 409
  C288 428 252 436 222 425
  C168 405 132 351 120 289
  C107 229 116 163 150 120
  C175 89 210 75 248 74 Z`;

/**
 * 부피는 평면 회색 덩어리가 아니라 그라데이션이 만든다 — 빛은 왼쪽 위, 그늘은 오른쪽 아래.
 * `objectBoundingBox` 기준이라 maskable 의 축소(scale)에도 그대로 따라간다.
 */
const DEFS = `
  <defs>
    <linearGradient id="fur" x1="0.22" y1="0.08" x2="0.82" y2="0.96">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.52" stop-color="#fbfcfe"/>
      <stop offset="1" stop-color="#d4dcea"/>
    </linearGradient>
    <radialGradient id="sheen" cx="0.33" cy="0.24" r="0.52">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="flipper" x1="0.2" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="#e6ecf6"/>
      <stop offset="1" stop-color="#c2cddf"/>
    </linearGradient>
    <radialGradient id="blush" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#b9c6da" stop-opacity="0.85"/>
      <stop offset="0.6" stop-color="#c6d1e1" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#c6d1e1" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="socket" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#cdd6e4" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#cdd6e4" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="body"><path d="${SILHOUETTE}"/></clipPath>
  </defs>`;

/**
 * 털결. 밖으로 솟는 가시가 아니라 윤곽을 따라 눕는 **초승달**이다 — 실루엣을 아주 조금
 * 흐트러뜨려 "잘라 낸 도형"이 아니라 "털 덮인 몸"으로 읽히게 한다. 솟게 그렸더니 뿔이 됐다.
 */
const FUR_EDGE = `
  <g fill="url(#fur)">
    <path d="M146 128 C162 102 190 80 220 70 C194 86 170 106 156 132 Z"/>
    <path d="M118 262 C113 238 114 212 121 188 C114 214 112 240 116 266 Z"/>
    <path d="M142 352 C130 332 122 310 119 290 C124 314 133 336 148 356 Z"/>
  </g>`;

/** 몸 안쪽의 짧은 결 몇 가닥. 아래쪽에 두면 입이나 수염으로 읽혀서 왼쪽 면에만 둔다. */
const FUR_TEXTURE = `
  <g stroke="#dfe6f2" stroke-width="4" stroke-linecap="round" fill="none" opacity="0.8">
    <path d="M168 168 C178 156 190 148 202 144"/>
    <path d="M150 210 C160 196 172 186 184 180"/>
    <path d="M152 300 C160 286 170 276 180 270"/>
    <path d="M196 342 C204 330 214 322 224 318"/>
  </g>`;

/** 앞지느러미 — 밑동이 굵고 끝이 뾰족한 물방울. 밑동에 그림자를 깔아 몸에서 살짝 떠 보이게. */
const FLIPPERS = `
  <g clip-path="url(#body)">
    <path d="M338 250 C362 276 368 326 348 354 C332 376 310 364 308 336
             C306 302 320 270 338 250 Z" fill="#b9c4d6" opacity="0.35"
          transform="translate(4 8)"/>
    <path d="M338 250 C362 276 368 326 348 354 C332 376 310 364 308 336
             C306 302 320 270 338 250 Z" fill="url(#flipper)"/>
    <path d="M188 296 C210 322 214 368 194 392 C180 408 160 398 158 372
             C156 342 172 312 188 296 Z" fill="#b9c4d6" opacity="0.3"
          transform="translate(3 7)"/>
    <path d="M188 296 C210 322 214 368 194 392 C180 408 160 398 158 372
             C156 342 172 312 188 296 Z" fill="url(#flipper)"/>
  </g>`;

/** 주둥이 — 두 혹을 한 곡선으로 잇고 가운데를 옅은 선 하나로 가른다. */
const MUZZLE = `
  <path d="M228 256 C239 247 252 249 256 260 C260 249 273 247 284 256
           C295 265 290 281 274 283 C264 284 258 279 256 272
           C254 279 248 284 238 283 C222 281 217 265 228 256 Z"
        fill="#e9eef7"/>
  <path d="M256 260 C256 268 256 275 256 280" stroke="#c3cdde" stroke-width="3.5"
        stroke-linecap="round" fill="none"/>`;

/** 눈 — 정원이 아니라 세로로 살짝 긴 계란형. 하이라이트 둘 + 옅은 눈두덩 음영. */
const eye = (cx, cy, tilt) => `
  <g transform="rotate(${tilt} ${cx} ${cy})">
    <ellipse cx="${cx}" cy="${cy}" rx="34" ry="32" fill="url(#socket)"/>
    <path d="M${cx} ${cy - 22} C${cx + 14} ${cy - 22} ${cx + 21} ${cy - 9} ${cx + 21} ${cy + 3}
             C${cx + 21} ${cy + 16} ${cx + 12} ${cy + 23} ${cx} ${cy + 23}
             C${cx - 12} ${cy + 23} ${cx - 21} ${cy + 16} ${cx - 21} ${cy + 3}
             C${cx - 21} ${cy - 9} ${cx - 14} ${cy - 22} ${cx} ${cy - 22} Z" fill="${INK}"/>
    <path d="M${cx - 10} ${cy - 13} C${cx - 3} ${cy - 17} ${cx + 3} ${cy - 11} ${cx} ${cy - 4}
             C${cx - 4} ${cy + 2} ${cx - 13} ${cy - 3} ${cx - 10} ${cy - 13} Z" fill="#fff"/>
    <circle cx="${cx + 9}" cy="${cy + 11}" r="4" fill="#fff" opacity="0.8"/>
  </g>`;

/** 코 — 곡선이 있는 둥근 역삼각형. 위쪽에 작은 반사광. */
const NOSE = `
  <path d="M236 222 C236 213 245 208 256 208 C267 208 276 213 276 222
           C276 233 265 244 256 249 C247 244 236 233 236 222 Z" fill="${INK}"/>
  <path d="M246 217 C250 214 255 214 258 216 C254 219 249 220 246 217 Z"
        fill="#fff" opacity="0.5"/>`;

/** 하프물범 새끼 한 마리(pwa.md R2). 512 좌표계에서 그린다. */
const ART = `${DEFS}
  ${FUR_EDGE}
  <path d="${SILHOUETTE}" fill="url(#fur)"/>
  <g clip-path="url(#body)">
    <ellipse cx="216" cy="196" rx="190" ry="190" fill="url(#sheen)"/>
    ${FUR_TEXTURE}
  </g>
  ${FLIPPERS}
  <ellipse cx="172" cy="250" rx="28" ry="19" fill="url(#blush)"/>
  <ellipse cx="322" cy="252" rx="28" ry="19" fill="url(#blush)"/>
  ${MUZZLE}
  ${eye(208, 188, -4)}
  ${eye(304, 184, 4)}
  ${NOSE}`;

/** `radius` 0 = 꽉 찬 사각, `scale` < 1 = maskable 안전 영역용 축소. */
const svg = ({ radius, scale = 1 }) => {
  const fit = `translate(${256 * (1 - scale)} ${256 * (1 - scale)}) scale(${scale})`;
  return `
  <svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <rect width="512" height="512" rx="${radius}" fill="${BG}"/>
    <g transform="${fit} translate(2 -6) rotate(-9 256 256)">${ART}</g>
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
