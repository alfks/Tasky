// 읽기 조건: 빌드 산출물의 "오프라인·캐시 계약"이 깨졌다고 의심될 때, 또는 프리캐시 대상을 바꿀 때.
// `pnpm build` 의 마지막 단계다. 여기 없던 시절에는 serwist 설정이나 public/_headers 가 조용히 어긋나도
// 빌드가 초록불이었다 — 프리캐시 목록·헤더 규칙·문서 배선은 런타임에만 드러나기 때문이다(ADR-0013 규칙 5·6·7).
//
// 원칙: **규칙 문자열이 있는지**가 아니라 **실제 산출물이 그 규칙에 덮이는지**를 본다.
// 규칙 문자열만 보던 시절에는 `build.assetsDir` 를 'assets' 아닌 값으로 바꿔도 초록불이었고,
// 그 순간 해시 자산 전부가 1년 immutable 을 조용히 잃었다(리뷰 변이 M12).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = 'dist/client';
const errors = [];
const note = (m) => errors.push(m);
let summary = '진입 청크 미검사';

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
// --- 산출물 경로 ↔ 헤더 규칙 커버리지 -----------------------------------------
// _headers 는 글롭(`*`)으로 경로를 고른다. 규칙 줄이 존재하는지가 아니라, **dist 에 실제로 떨어진
// 파일 하나하나가** 그 글롭에 잡히는지를 본다. 이렇게 해야 assetsDir 변경(M12)과 규칙 경로 변경(M9)이
// 같은 검사 하나에 걸린다.
const parseRules = (text) => {
  const rules = [];
  let current = null;
  for (const raw of text.split('\n')) {
    if (raw.trim() === '' || raw.trimStart().startsWith('#')) continue;
    if (/^\s/.test(raw)) {
      if (current !== null) current.headers.push(raw.trim());
    } else {
      current = { path: raw.trim(), headers: [] };
      rules.push(current);
    }
  }
  return rules;
};
// Cloudflare 의 `_headers` 글롭에서 우리가 쓰는 것은 `*` 뿐이다(placeholder `:name` 은 쓰지 않는다).
const globToRe = (glob) =>
  new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
const rules = parseRules(headers);
const headersFor = (url) =>
  rules.filter((r) => globToRe(r.path).test(url)).flatMap((r) => r.headers);

const walk = (dir, base = '') => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const url = posix.join(base, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path, url));
    else out.push({ path, url: `/${url}` });
  }
  return out;
};
const distFiles = (() => {
  try {
    return walk(DIST);
  } catch {
    note(`${DIST} 를 읽지 못했습니다 — vite build 가 돌지 않았습니다.`);
    return [];
  }
})();

// 콘텐츠 해시가 붙은 것(번들 자산·폰트)은 전부 1년 immutable 이어야 한다(theme.md R14).
// sw.js 는 반대다 — 오래 캐시하면 새 버전을 영영 못 본다(pwa.md R4).
const SW_URL = '/sw.js';
const mustBeImmutable = distFiles.filter(
  (f) => f.url !== SW_URL && /\.(js|css|woff2)$/.test(f.url),
);
if (mustBeImmutable.length === 0) note(`${DIST} 에 해시 자산(js/css/woff2)이 하나도 없습니다.`);
for (const file of mustBeImmutable) {
  if (!headersFor(file.url).some((h) => /^cache-control:.*\bimmutable\b/i.test(h))) {
    note(
      `${file.url} 을 덮는 immutable 규칙이 _headers 에 없습니다 — ` +
        `vite.config.ts 의 build.assetsDir 과 public/_headers 의 경로가 갈라졌습니다(ADR-0013 규칙 5).`,
    );
  }
}
if (distFiles.some((f) => f.url === SW_URL)) {
  const sw_headers = headersFor(SW_URL);
  if (!sw_headers.some((h) => /^cache-control:.*\bno-cache\b/i.test(h)))
    note(
      `${SW_URL} 을 덮는 no-cache 규칙이 _headers 에 없습니다 (specs/pwa.md R4 — 새 버전 감지).`,
    );
  if (sw_headers.some((h) => /^cache-control:.*\bimmutable\b/i.test(h)))
    note(`${SW_URL} 이 immutable 규칙에 걸립니다 — 새 서비스워커가 영영 배포되지 않습니다.`);
}

// --- 실제로 나가는 문서(dist/client/index.html) --------------------------------
// 소스 index.html 은 theme-head.test.ts 가 본다. 여기서는 **빌드를 거쳐 나간 사본**을 본다 —
// 둘을 나눠야 HTML 변환 플러그인이 조용히 끼어드는 경우까지 잡힌다(리뷰 Minor 9).
let doc = '';
try {
  doc = readFileSync(`${DIST}/index.html`, 'utf-8');
} catch {
  note(`${DIST}/index.html 이 없습니다 — SPA 진입 문서가 통째로 빠졌습니다.`);
}
if (doc !== '') {
  // R1: 이 한 줄이 설치 가능성의 유일한 실질 배선이다. 파일이 있어도 문서가 안 가리키면 설치되지 않는다.
  if (!/<link[^>]+rel="manifest"[^>]+href="\/manifest\.webmanifest"/.test(doc))
    note(
      'index.html 에 <link rel="manifest" href="/manifest.webmanifest"> 가 없습니다 (pwa.md R1).',
    );
  // 이게 없으면 빌드·테스트는 전부 초록인데 사이트만 빈 화면이 된다(main.tsx 의 마운트 지점).
  if (!/<div id="root">/.test(doc))
    note('index.html 에 <div id="root"> 가 없습니다 — 앱이 마운트될 곳이 없습니다.');
  if (!/<title>Tasky<\/title>/.test(doc)) note('index.html 에 <title>Tasky</title> 가 없습니다.');
  // 동기 인라인 테마 스크립트가 빌드를 거쳐서도 살아 있는지(theme R6·R11). 본문 일치는 theme-head.test.ts.
  if (!/<script>\(function\(\)\{/.test(doc))
    note('index.html 에 동기 인라인 테마 스크립트가 없습니다 (theme.md R6·R11).');
  // ADR-0013 규칙 8: 동적 청크를 <head> 에서 미리 알린다. 없으면 왕복이 직렬로 쌓인다(+153 ms 실측).
  const preloaded = [...doc.matchAll(/rel="modulepreload"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  const dynamicChunks = distFiles
    .map((f) => f.url)
    .filter(
      (u) => /^\/assets\/.*\.js$/.test(u) && !preloaded.includes(u) && !doc.includes(`src="${u}"`),
    );
  if (preloaded.length === 0)
    note('index.html 에 동적 청크의 modulepreload 가 없습니다 (ADR-0013 규칙 8).');
  for (const url of dynamicChunks) note(`${url} 이 index.html 의 어디에서도 참조되지 않습니다.`);
}

// --- 진입 청크 예산(ADR-0013 규칙 7 · 재검토 트리거) ---------------------------
// Dexie 지연 로드는 "진입 청크에서 뺀다"가 전부다. 정적 import 로 되돌리면 lint·tsc·테스트·빌드가
// 전부 초록인 채로 진입 청크가 77 kB → 110 kB 로 는다(리뷰 변이 M16). 그래서 여기서 바이트로 잰다.
const ENTRY_BUDGET = 100_000; // gzip. 현재 77,429 B — Dexie 가 돌아오면 110 kB 대라 바로 걸린다.
const NETWORK_BUDGET = 120_000; // gzip. ADR-0013 재검토 트리거를 그대로 자동화한 값.
const entryUrl = /<script[^>]+type="module"[^>]+src="([^"]+)"/.exec(doc)?.[1];
const entryFile = distFiles.find((f) => f.url === entryUrl);
if (doc !== '' && entryFile === undefined) {
  note('index.html 이 가리키는 진입 스크립트를 dist 에서 찾지 못했습니다.');
} else if (entryFile !== undefined) {
  const gz = (file) => gzipSync(readFileSync(file.path), { level: 9 }).length;
  const entryGzip = gz(entryFile);
  if (/\bIDBKeyRange\b|\bDexie\b/.test(readFileSync(entryFile.path, 'utf-8')))
    note(
      `진입 청크(${entryFile.url})에 Dexie 가 들어 있습니다 — ` +
        'providers.tsx 의 infra import 가 동적이어야 합니다(ADR-0013 규칙 7).',
    );
  if (entryGzip > ENTRY_BUDGET)
    note(
      `진입 청크 gzip ${entryGzip} B 가 예산 ${ENTRY_BUDGET} B 를 넘었습니다 ` +
        '— 청크 분해를 다시 재고 무엇이 늘었는지부터 보세요(ADR-0013 재검토 트리거).',
    );
  const networkGzip = distFiles
    .filter((f) => /^\/assets\/.*\.js$/.test(f.url))
    .reduce((sum, f) => sum + gz(f), 0);
  if (networkGzip > NETWORK_BUDGET)
    note(
      `첫 로드 네트워크 JS gzip 합 ${networkGzip} B 가 예산 ${NETWORK_BUDGET} B 를 넘었습니다 ` +
        '— ADR-0013 재검토 트리거에 도달했습니다.',
    );
  summary = `진입 청크 gzip ${entryGzip} B / 예산 ${ENTRY_BUDGET} B`;
}

if (errors.length > 0) {
  for (const e of errors) console.error(`FAIL: ${e}`);
  console.error('FAIL: 빌드 산출물 계약 검사 실패 — 위 항목을 고치세요.');
  process.exit(1);
}
process.stdout.write(
  `PASS: 빌드 산출물 계약 — 프리캐시 ${urls.length} URL · manifest R1 필드 · ` +
    `immutable 커버리지 ${mustBeImmutable.length} 파일 · index.html 배선 · ${summary}\n`,
);
