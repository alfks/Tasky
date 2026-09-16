// 읽기 조건: 빌드 산출물의 "오프라인·캐시 계약"이 깨졌다고 의심될 때, 또는 프리캐시 대상을 바꿀 때.
// `pnpm build` 의 마지막 단계다. 여기 없던 시절에는 serwist 설정이나 public/_headers 가 조용히 어긋나도
// 빌드가 초록불이었다 — 프리캐시 목록과 헤더 규칙은 런타임에만 드러나기 때문이다(ADR-0013 규칙 5·6).
import { readFileSync } from 'node:fs';

const DIST = 'dist/client';
const errors = [];
const note = (m) => errors.push(m);

// --- 프리캐시 목록(specs/pwa.md R3·R10) ---------------------------------------
// serwist 가 만든 sw.js 안의 매니페스트를 그대로 읽는다(빌드 로그 파싱이 아니다).
let sw = '';
try {
  sw = readFileSync(`${DIST}/sw.js`, 'utf-8');
} catch {
  note(`${DIST}/sw.js 가 없습니다 — serwist build 가 돌지 않았습니다.`);
}
// serwist 는 `{revision:…,url:"index.html"}` 형태로 **스코프 상대 경로**를 심는다. 앞에 / 를 붙여 비교한다.
const urls = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => `/${m[1].replace(/^\//, '')}`);
if (urls.length === 0 && sw !== '') note('sw.js 에 프리캐시 항목이 없습니다.');

// R3: 오프라인 새로고침은 프리캐시된 index.html 의 directoryIndex 매칭으로 성립한다.
// R1: manifest 와 아이콘, theme R14: 폰트 — 오프라인에서도 있어야 한다.
const required = [
  ['/index.html', 'specs/pwa.md R3 — 이게 없으면 오프라인 새로고침이 깨진다'],
  ['/manifest.webmanifest', 'specs/pwa.md R1 — 설치 정보'],
  ['/icon-192.png', 'specs/pwa.md R1'],
  ['/icon-512.png', 'specs/pwa.md R1'],
  ['/icon-maskable-512.png', 'specs/pwa.md R1'],
];
for (const [url, why] of required) {
  if (!urls.includes(url)) note(`프리캐시 목록에 ${url} 이 없습니다 (${why}).`);
}
if (!urls.some((u) => u.endsWith('.woff2')))
  note('프리캐시 목록에 woff2 폰트가 없습니다 (theme.md R15).');
if (!urls.some((u) => u.endsWith('.css'))) note('프리캐시 목록에 CSS 가 없습니다 (앱 셸).');

// --- manifest 내용(specs/pwa.md R1) -------------------------------------------
// 존재만 보면 값이 조용히 어긋난 채로 나간다(start_url·display 하나만 틀려도 Installable 이 깨진다).
// MIME 은 여기서 볼 수 없다 — 서버가 확장자로 정한다(실측: Workers Static Assets → application/manifest+json).
try {
  const manifest = JSON.parse(readFileSync(`${DIST}/manifest.webmanifest`, 'utf-8'));
  const expected = {
    name: 'Tasky',
    short_name: 'Tasky',
    display: 'standalone',
    start_url: '/',
    scope: '/',
    theme_color: '#7CC6FF',
    background_color: '#FAFAFC',
    lang: 'ko',
  };
  for (const [key, value] of Object.entries(expected)) {
    if (manifest[key] !== value) {
      note(`manifest 의 ${key} 가 "${manifest[key]}" 입니다 — specs/pwa.md R1 은 "${value}".`);
    }
  }
  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  const has = (sizes, purpose) => icons.some((i) => i.sizes === sizes && i.purpose === purpose);
  if (!has('192x192', 'any')) note('manifest 에 192x192 any 아이콘이 없습니다 (R1).');
  if (!has('512x512', 'any')) note('manifest 에 512x512 any 아이콘이 없습니다 (R1).');
  if (!has('512x512', 'maskable')) note('manifest 에 512x512 maskable 아이콘이 없습니다 (R1).');
} catch (error) {
  note(`${DIST}/manifest.webmanifest 를 읽지 못했습니다: ${String(error)}`);
}

// --- 정적 자산 헤더(public/_headers) ------------------------------------------
// Cloudflare Workers Static Assets 가 읽는 파일이다. Vite 가 public/ 을 그대로 복사하므로
// 산출물에 실려 있는지까지 본다 — 복사가 빠지면 폰트 immutable(theme R14)과 sw.js no-cache(pwa R4)가 사라진다.
let headers = '';
try {
  headers = readFileSync(`${DIST}/_headers`, 'utf-8');
} catch {
  note(`${DIST}/_headers 가 없습니다 — 캐시 규칙이 통째로 빠졌습니다.`);
}
// _headers 는 "경로 줄 + 들여쓴 헤더 줄들" 블록 형식이다. 정규식 대신 그대로 훑는다.
const headerBlock = (path) => {
  const lines = headers.split('\n');
  const at = lines.findIndex((l) => l.trim() === path);
  if (at === -1) return null;
  const body = [];
  for (let i = at + 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '' || !/^\s/.test(lines[i])) break;
    body.push(lines[i].trim());
  }
  return body.join('\n');
};
const rule = (path, expected, why) => {
  const body = headerBlock(path);
  if (body === null) return note(`_headers 에 ${path} 규칙이 없습니다 (${why}).`);
  if (!body.includes(expected))
    note(`_headers 의 ${path} 규칙에 "${expected}" 가 없습니다 (${why}).`);
};
rule('/fonts/*', 'max-age=31536000, immutable', 'theme.md R14 — 해시 파일명과 한 쌍');
rule('/sw.js', 'no-cache', 'specs/pwa.md R4 — 새 버전 감지');
rule('/assets/*', 'max-age=31536000, immutable', '콘텐츠 해시가 붙은 번들 자산');

if (errors.length > 0) {
  for (const e of errors) console.error(`FAIL: ${e}`);
  console.error('FAIL: 빌드 산출물 계약 검사 실패 — 위 항목을 고치세요.');
  process.exit(1);
}
process.stdout.write(
  `PASS: 빌드 산출물 계약 — 프리캐시 ${urls.length} URL · manifest R1 필드 · _headers 규칙 3종\n`,
);
