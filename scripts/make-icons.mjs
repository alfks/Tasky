// 읽기 조건: PWA 아이콘(`public/icon-*.png`)을 바꿀 때. 실행: `node scripts/make-icons.mjs`
//
// **아이콘 그림의 단일 소스.** 네 파일(192·512·maskable 512·apple-touch 180)은 전부 아래
// `ART` 에서 나온다 — 손으로 고친 PNG 를 섞지 마라. 하나만 고치면 나머지 셋과 조용히 갈라진다.
//
// 화법은 스티커 일러스트다(pwa.md R2-a): **따뜻한 갈색 윤곽선** + 갈색 눈·코 + 분홍 볼터치 +
// 그라데이션 부피 + 아주 옅은 종이 질감. 윤곽선을 검정으로 바꾸거나 빼면 화법이 통째로 무너진다.
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
const LINE = '#93755F'; // 윤곽선 — 검정이 아니라 **따뜻한 갈색**인 것이 이 화법의 핵심이다
const FACE = '#6B4A34'; // 눈·코
const PINK = '#F4A6A4'; // 볼터치

const DEFS = `
  <defs>
    <linearGradient id="fur" x1="0.3" y1="0.05" x2="0.7" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.62" stop-color="#fdfdfb"/>
      <stop offset="1" stop-color="#eceae4"/>
    </linearGradient>
    <radialGradient id="blush" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${PINK}" stop-opacity="0.85"/>
      <stop offset="0.65" stop-color="${PINK}" stop-opacity="0.45"/>
      <stop offset="1" stop-color="${PINK}" stop-opacity="0"/>
    </radialGradient>
    <!--
      종이 질감. 아주 옅게(알파 0.10) 깔아야 한다 — 올리면 그림이 더러워 보인다.
      Chromium 이 래스터할 때만 계산되므로 결과 PNG 에는 노이즈가 구워져 들어간다.
    -->
    <filter id="grain" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" result="n"/>
      <feColorMatrix in="n" type="saturate" values="0" result="g"/>
      <feComponentTransfer in="g" result="g2">
        <feFuncA type="linear" slope="0.10" intercept="0"/>
      </feComponentTransfer>
      <feComposite in="g2" in2="SourceGraphic" operator="in" result="grainOnly"/>
      <feBlend in="SourceGraphic" in2="grainOnly" mode="multiply"/>
    </filter>
  </defs>`;

/** 몸 — 오동통한 배 모양. 좌우 곡률을 일부러 다르게 둬 손그림처럼 보이게 한다. */
const BODY = `M252 56
  C338 54 398 124 404 212
  C410 302 350 394 254 394
  C158 394 102 300 108 210
  C114 122 170 58 252 56 Z`;

/** 꼬리 두 갈래 — 몸 **뒤**에 깔려 오른쪽 아래로만 보인다. */
const TAIL = `
  <path d="M306 340 C346 334 390 352 408 378 C421 397 406 416 376 413
           C340 409 310 382 306 340 Z" fill="url(#fur)" stroke="${LINE}"
        stroke-width="8" stroke-linejoin="round"/>
  <path d="M300 378 C336 376 372 392 384 414 C392 430 376 443 351 438
           C322 432 302 410 300 378 Z" fill="url(#fur)" stroke="${LINE}"
        stroke-width="8" stroke-linejoin="round"/>`;

/** 앞지느러미 — 몸 위에 얹힌 동글한 손. 제 윤곽선을 갖는다(겹친 자리에 선이 보인다). */
const FLIPPERS = `
  <path d="M182 300 C206 300 221 326 216 352 C211 378 189 391 168 384
           C147 377 140 350 148 328 C155 310 167 300 182 300 Z"
        fill="url(#fur)" stroke="${LINE}" stroke-width="8" stroke-linejoin="round"/>
  <path d="M330 300 C306 300 291 326 296 352 C301 378 323 391 344 384
           C365 377 372 350 364 328 C357 310 345 300 330 300 Z"
        fill="url(#fur)" stroke="${LINE}" stroke-width="8" stroke-linejoin="round"/>`;

/** 주둥이 — 두 혹을 한 윤곽으로 잇고 가운데에 옅은 주름 하나. */
const MUZZLE = `
  <path d="M256 254 C266 246 287 250 293 266 C299 284 285 297 270 295
           C261 294 257 288 256 282 C255 288 251 294 242 295
           C227 297 213 284 219 266 C225 250 246 246 256 254 Z"
        fill="url(#fur)" stroke="${LINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="M256 259 C256 268 256 275 256 280" stroke="${LINE}" stroke-width="4"
        stroke-linecap="round" fill="none" opacity="0.55"/>`;

/** 눈 — 갈색 계란형 + 작은 반사광. */
const eye = (cx, cy, tilt) => `
  <g transform="rotate(${tilt} ${cx} ${cy})">
    <path d="M${cx} ${cy - 20} C${cx + 12} ${cy - 20} ${cx + 18} ${cy - 9} ${cx + 18} ${cy + 2}
             C${cx + 18} ${cy + 14} ${cx + 11} ${cy + 21} ${cx} ${cy + 21}
             C${cx - 11} ${cy + 21} ${cx - 18} ${cy + 14} ${cx - 18} ${cy + 2}
             C${cx - 18} ${cy - 9} ${cx - 12} ${cy - 20} ${cx} ${cy - 20} Z" fill="${FACE}"/>
    <path d="M${cx - 8} ${cy - 13} C${cx - 2} ${cy - 16} ${cx + 3} ${cy - 10} ${cx} ${cy - 4}
             C${cx - 3} ${cy + 1} ${cx - 11} ${cy - 3} ${cx - 8} ${cy - 13} Z"
          fill="#fff" opacity="0.9"/>
  </g>`;

/** 코 — 눈 사이 조금 아래. 눈과 함께 삼각형으로 모여야 한다(벌어지면 곰이 된다). */
const NOSE = `
  <path d="M240 232 C240 224 247 219 256 219 C265 219 272 224 272 232
           C272 242 263 252 256 256 C249 252 240 242 240 232 Z" fill="${FACE}"/>`;

/** 하프물범 새끼 한 마리(pwa.md R2·R2-a). 512 좌표계에서 그린다. */
const ART = `${DEFS}
  <ellipse cx="258" cy="408" rx="126" ry="19" fill="#5EB4F2" opacity="0.32"/>
  ${TAIL}
  <path d="${BODY}" fill="url(#fur)" stroke="${LINE}" stroke-width="9" stroke-linejoin="round"/>
  <ellipse cx="170" cy="256" rx="30" ry="18" fill="url(#blush)"/>
  <ellipse cx="342" cy="256" rx="30" ry="18" fill="url(#blush)"/>
  ${FLIPPERS}
  ${MUZZLE}
  ${eye(214, 222, -4)}
  ${eye(298, 222, 4)}
  ${NOSE}`;

/** `radius` 0 = 꽉 찬 사각, `scale` < 1 = maskable 안전 영역용 축소. */
const svg = ({ radius, scale = 1 }) => {
  const fit = `translate(${256 * (1 - scale)} ${256 * (1 - scale)}) scale(${scale})`;
  return `
  <svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <rect width="512" height="512" rx="${radius}" fill="${BG}"/>
    <g transform="${fit}" filter="url(#grain)">${ART}</g>
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
