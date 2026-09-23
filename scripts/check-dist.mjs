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

import {
  BASELINE_PATH,
  currentBranch,
  deltaReport,
  parsePrArg,
  readBaseline,
  writeBaseline,
} from './bundle-baseline.mjs';

const DIST = 'dist/client';
const errors = [];
const note = (m) => errors.push(m);
let summary = '진입 청크 미검사';
const UPDATE_BASELINE = process.argv.includes('--update-baseline');
const PR_NUMBER = parsePrArg(process.argv);

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
  ['/icon-apple-touch-180.png', 'specs/pwa.md R1-a — iOS 홈 화면 아이콘'],
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

// --- iOS 홈 화면 아이콘(specs/pwa.md R1-a) -------------------------------------
// 이 파일이 따로 있는 이유는 크기가 아니라 **알파**다 — iOS 는 apple-touch-icon 의 투명 픽셀을
// 검정으로 합성하므로, 알파가 있는 사본으로 교체되면 둥근 모서리 자리에 검은 삼각형이 남는다.
// 화면에서만 드러나는 회귀라 여기서 PNG 헤더(IHDR 의 색 타입)를 직접 본다. 4·6 = 알파 있음.
try {
  const icon = readFileSync(`${DIST}/icon-apple-touch-180.png`);
  const size = { width: icon.readUInt32BE(16), height: icon.readUInt32BE(20) };
  const colorType = icon[25];
  if (colorType === 4 || colorType === 6)
    note(
      'icon-apple-touch-180.png 에 알파 채널이 있습니다 (pwa.md R1-a) — ' +
        'iOS 가 투명 픽셀을 검정으로 합성해 모서리가 검게 남습니다. 배경색 위에 합성해 다시 만드세요(public/AGENTS.md).',
    );
  if (size.width !== 180 || size.height !== 180)
    note(
      `icon-apple-touch-180.png 이 ${size.width}×${size.height} 입니다 — 180×180 이어야 합니다.`,
    );
} catch (error) {
  note(`${DIST}/icon-apple-touch-180.png 를 읽지 못했습니다: ${String(error)}`);
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
  // R1-a: iOS 는 manifest 의 아이콘보다 이 링크를 먼저 본다. 없으면 홈 화면 아이콘이
  // **페이지 스크린샷**이 된다 — 설치는 되는데 아이콘만 조용히 망가지는 경로라 여기서 잡는다.
  if (!/<link[^>]+rel="apple-touch-icon"[^>]+href="\/icon-apple-touch-180\.png"/.test(doc))
    note(
      'index.html 에 <link rel="apple-touch-icon" href="/icon-apple-touch-180.png"> 가 없습니다 (pwa.md R1-a).',
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

  // Cloudflare Web Analytics 비콘(ADR-0021): 정확히 한 번, 지정된 src·token 그대로 나가야 하고,
  // defer 스크립트와 모듈 스크립트는 실행 큐를 공유하므로 진입 모듈 스크립트보다 뒤에 있어야
  // 부팅(AuthGate/LoginScreen)을 지연시키지 않는다(async 라면 큐를 안 타므로 순서 무관하게 안전).
  const beaconMatches = [
    ...doc.matchAll(
      /<script[^>]*src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js"[^>]*>/g,
    ),
  ];
  if (beaconMatches.length !== 1) {
    note(
      `index.html 에 Cloudflare Web Analytics 비콘 스크립트가 정확히 1개가 아닙니다(발견 ${beaconMatches.length}개, ADR-0021).`,
    );
  } else {
    const tag = beaconMatches[0][0];
    if (!/"token":\s*"d5be062eb83c46b9b9f5eb621f7a1342"/.test(tag))
      note('index.html 의 Cloudflare Web Analytics 비콘 태그에 예상 token 이 없습니다.');
    // data-cf-beacon 의 속성값(JSON 문자열) 안에는 defer·async 라는 단어가 나오지 않지만, 속성
    // 이름만으로 판정하려면 값을 먼저 떼어내야 혼동이 없다.
    const tagWithoutBeaconAttr = tag.replace(/data-cf-beacon='[^']*'/, '');
    const isAsync = /\basync\b/.test(tagWithoutBeaconAttr);
    const isDefer = /\bdefer\b/.test(tagWithoutBeaconAttr);
    if (!isAsync && !isDefer)
      note('index.html 의 Cloudflare Web Analytics 비콘 태그가 async 도 defer 도 아닙니다.');
    if (!isAsync) {
      const entryAt = doc.search(/<script[^>]+type="module"[^>]+src="[^"]+"/);
      const beaconAt = doc.indexOf(tag);
      if (entryAt === -1) note('index.html 에서 진입 모듈 스크립트를 찾지 못했습니다.');
      else if (beaconAt < entryAt)
        note(
          'Cloudflare Web Analytics 비콘(defer)이 진입 모듈 스크립트보다 앞에 있습니다 — 부팅이 비콘 요청에 막힐 수 있습니다.',
        );
    }
  }
  // theme-head.test.ts 가 "첫 스크립트는 동기 테마 스크립트"를 지킨다 — 여기서는 비콘이
  // 그 자리를 뺏지 않았는지만 겹쳐 확인한다.
  const headStart = doc.search(/<head[\s>]/);
  const head = doc.slice(headStart === -1 ? 0 : headStart, doc.indexOf('</head>'));
  const firstHeadScript = /<script[^>]*>/.exec(head)?.[0] ?? '';
  if (firstHeadScript.includes('cloudflareinsights'))
    note(
      'Cloudflare Web Analytics 비콘이 <head> 의 첫 스크립트입니다 — 동기 테마 스크립트가 밀렸습니다.',
    );
}

// --- 진입 청크 예산(ADR-0013 규칙 7 · 재검토 트리거) ---------------------------
// Dexie 지연 로드는 "진입 청크에서 뺀다"가 전부다. 정적 import 로 되돌리면 lint·tsc·테스트·빌드가
// 전부 초록인 채로 진입 청크가 77 kB → 110 kB 로 는다(리뷰 변이 M16). 그래서 여기서 바이트로 잰다.
// 예산 숫자는 **워터마크**이지 보장이 아니다. Dexie 가 진입 청크로 돌아오는 것을 실제로 막는 건
// 아래 198행의 `IDBKeyRange|Dexie` 검사이고, 그건 바이트 수와 무관하게 문다(음성 대조로 확인).
// 그래서 기능이 화면에 붙으면서 숫자를 올려도 그 보장은 그대로 산다.
//
// 120 kB 는 SPA 전환 직후(진입 77 kB) 잡은 재검토 트리거였고, T-15·T-17 이 마운트되면서
// 그 트리거가 예정대로 울렸다 — 카테고리 + CommandLayer 만으로 120,955 B.
// **여기서 한 번 의도적으로 올린다.** 기준은 `docs/TECH_PLAN.md` §8 의 제품 계약 "첫 로드 JS ≤ 200KB" 다.
// 다시 올려야 할 상황이 오면 그건 또 한 번의 명시적 결정이어야 한다 — 조용히 늘리지 마라.
//
// --- 2026-09-21: 계측을 "진입 청크 단독"에서 "진입 폐포"로 바꾼다(T-94, T94_LAZY_BOUNDARY.md §1
// 사실 1·§B-5 (a), 사용자 결정) ---------------------------------------------------------------
// **왜**: rolldown 은 정적 위성 청크(진입이 `import{...}from"./x.js"` 로 직접 끌어오는 것, 예:
// `meta-*.js`·`routine.rules-*.js`)를 만들지 흡수할지를 청크 배치 휴리스틱으로 정한다 — 코드가
// 한 바이트도 안 바뀌어도 그 배치가 바뀌면 `index-*.js` 단독 수치가 ±3 kB 씩 흔들린다(실측: UI
// 컴포넌트를 `lazy` 로 몇 개 떼느냐에 따라 index-*.js 가 135,708~150,530 사이를 오갔다). "첫 페인트가
// 실제로 기다리는 바이트" 는 진입 스크립트 자신이 아니라 **그 스크립트가 평가되기 위해 정적으로
// 먼저 받아야 하는 모든 것**이므로, 그 합을 잰다 — 청크 배치가 바뀌어도 이 합은 코드 무게와만
// 움직인다.
// **어떻게 재는가**: 진입 파일에서 `from"./chunk.js"`(ES 모듈 정적 import — 이 빌드의 동적
// import()는 항상 백틱 템플릿 리터럴을 쓰므로 겹치지 않는다, 실측)로 참조된 청크를 모으고,
// 그 청크들도 재귀적으로 같은 방식으로 훑어 정적 의존 전체(폐포)를 구한다.
function staticImportTargets(source) {
  return [...source.matchAll(/\bfrom"\.\/([\w.-]+\.js)"/g)].map((m) => `/assets/${m[1]}`);
}
function entryClosure(entryFile, allFiles) {
  const byUrl = new Map(allFiles.map((f) => [f.url, f]));
  const seen = new Set([entryFile.url]);
  const queue = [entryFile];
  while (queue.length > 0) {
    const file = queue.shift();
    for (const url of staticImportTargets(readFileSync(file.path, 'utf-8'))) {
      if (seen.has(url)) continue;
      seen.add(url);
      const next = byUrl.get(url);
      if (next !== undefined) queue.push(next);
    }
  }
  return [...seen].map((url) => byUrl.get(url)).filter((f) => f !== undefined);
}
// ENTRY_BUDGET 164,000: 리뷰 라운드1(R2-C, 2026-09-22)이 백엔드·프론트 둘 다 Major 로 지적한
// 항목 — 직전 기준 158,221(T-94/#129 머지 직후 실측)에서 이 브랜치(3영역 배선·사이드바 고정·
// 헤더 h1)가 +1,536 B 를 더해 159,757(`pnpm build` 직접 재측정, 2026-09-22)까지 올랐고, 옛
// 예산 160,000 대비 여유가 243 B(0.15%)뿐이라 "다음 PR 이 200 B 만 더해도 빌드가 멈춘다"는
// 지적이 나왔다. 여기서 **160,000 → 164,000** 으로 올려 여유를 확보한다 — 근거 없이 크게
// 올리지 않고, 실측된 사용량 위에 "다음 재검토 트리거" 로 쓸 최소한의 폭만 얹는다(아래 208행
// 원칙 그대로 — 전부 쓰지 않는다, calendar-layout.md §7 절차). **이 세션 안에서도 병렬로 돌던
// 다른 작업이 반영되며 159,757 → 160,070(2026-09-23 `pnpm build` 재확인, +313 B)으로 한 번 더
// 움직였다** — `scripts/bundle-baseline.json` 은 이 마지막 실측값을 담고 있다(옛 값을 베끼지
// 않는다는 원칙, CLAUDE.md). 그 값 기준으로도 여유는 3,930 B(약 2.5%) 남는다. 예산을 다시
// 올려야 하면 이번처럼 (a) 직전 기준값 (b) 무엇이 얼마나 더했는지 (c) 남기는 여유, 셋을 이
// 주석에 반드시 적고 PR 본문에도 옮긴다 — 단독 결정 금지.
const ENTRY_BUDGET = 164_000; // gzip. 진입 폐포(진입 + 정적 위성 청크) 합.
// NETWORK_BUDGET 210,000: 그대로 둔다(R2-C, 2026-09-22 재검토, 2026-09-23 재확인). 마지막
// 재측정(`bundle-baseline.json`과 같은 시점)에서 네트워크 합은 204,990 B — 여유 5,010 B(약
// 2.4%)가 아직 있어 진입 폐포처럼 당장 막히는 신호가 아니다. 진입 폐포만 올리고 이쪽은
// 건드리지 않는 것 자체가 결정이므로 기록해 둔다 — 다음에 이 여유도 좁아지면 그때 같은
// 절차(위 ENTRY_BUDGET 주석 형식)로 근거를 적어 올린다.
const NETWORK_BUDGET = 210_000; // gzip. = TECH_PLAN §8 제품 계약값(2026-09-21 갱신).
const entryUrl = /<script[^>]+type="module"[^>]+src="([^"]+)"/.exec(doc)?.[1];
const entryFile = distFiles.find((f) => f.url === entryUrl);
if (doc !== '' && entryFile === undefined) {
  note('index.html 이 가리키는 진입 스크립트를 dist 에서 찾지 못했습니다.');
} else if (entryFile !== undefined) {
  const gz = (file) => gzipSync(readFileSync(file.path), { level: 9 }).length;
  const entryGzip = gz(entryFile);
  const entryText = readFileSync(entryFile.path, 'utf-8');
  if (/\bIDBKeyRange\b|\bDexie\b/.test(entryText))
    note(
      `진입 청크(${entryFile.url})에 Dexie 가 들어 있습니다 — ` +
        'providers.tsx 의 infra import 가 동적이어야 합니다(ADR-0013 규칙 7).',
    );
  const closure = entryClosure(entryFile, distFiles);
  const closureGzip = closure.reduce((sum, f) => sum + gz(f), 0);
  if (closureGzip > ENTRY_BUDGET)
    note(
      `진입 폐포(index + 정적 위성 청크 ${closure.length}개) gzip ${closureGzip} B 가 ` +
        `예산 ${ENTRY_BUDGET} B 를 넘었습니다 — 청크 분해를 다시 재고 무엇이 늘었는지부터 보세요` +
        '(ADR-0013 재검토 트리거).',
    );
  const networkGzip = distFiles
    .filter((f) => /^\/assets\/.*\.js$/.test(f.url))
    .reduce((sum, f) => sum + gz(f), 0);
  if (networkGzip > NETWORK_BUDGET)
    note(
      `첫 로드 네트워크 JS gzip 합 ${networkGzip} B 가 예산 ${NETWORK_BUDGET} B 를 넘었습니다 ` +
        '— ADR-0013 재검토 트리거에 도달했습니다.',
    );

  // --- 번들 델타 리포트(R2-C, 2026-09-22) ---------------------------------------------------
  // 왜: 상한(ENTRY_BUDGET) 한 줄뿐이던 게이트는 "넘느냐/안 넘느냐"만 말해서, 예산을 다 채워 가는
  // PR 이 하나씩 조용히 쌓여도 마지막 한 PR 이 상한을 넘기 전까지는 아무 신호가 없었다(리뷰
  // 라운드1 Major — 여유 243 B 까지 몰린 뒤에야 발견됨). 그래서 매 빌드마다 **직전 기준값 대비
  // 증감(delta)** 을 찍는다 — 실패(상한 초과)와는 별개로, 상한 아래에서도 크게 늘면 경고한다.
  // 기준값은 `scripts/bundle-baseline.json`(신뢰 가능한 소스는 이 파일 하나, git 에 커밋된다)에
  // 둔다 — 값을 바꾸려면(즉 새 기준을 인정하려면) `node scripts/check-dist.mjs --update-baseline`
  // 을 사람이 명시적으로 돌려야 한다(자동 갱신 금지 — 그러면 delta 가 항상 0 이 되어 무의미해진다).
  // 로직 자체(파일 읽기·쓰기·WARN 판정)는 `bundle-baseline.mjs` — 여기 두면 이 파일이 300줄
  // 상한(eslint max-lines)을 넘는다.
  let baseline = readBaseline(note);
  let deltaNote = '';
  if (UPDATE_BASELINE) {
    baseline = writeBaseline({
      entryClosureGzip: closureGzip,
      networkGzip,
      prNumber: PR_NUMBER,
      branch: currentBranch(),
    });
    process.stdout.write(
      `기준값 갱신: 진입 폐포 gzip ${closureGzip} B · 네트워크 합 ${networkGzip} B 를 ` +
        `${BASELINE_PATH} 에 새 기준으로 저장했습니다` +
        `${PR_NUMBER === null ? '(PR 번호 미기재 — 머지 후 --pr=<n> 으로 다시 갱신하세요)' : `(#${PR_NUMBER})`}.\n`,
    );
  } else {
    deltaNote = deltaReport(baseline, closureGzip, networkGzip);
  }

  // --- 동기화 가짜 서버·검증 벡터 마커(T94_LAZY_BOUNDARY.md §C-8②) ---------------------------
  // 문자열 리터럴만 본다(식별자는 minify 로 사라진다, 사실 11). 진입에 없어야 하는 것들은 각각
  // **다른 어떤 청크에는 있어야** 한다 — 마커 자체가 죽었으면(오탈자·리터럴이 바뀜) 이 대조가
  // 드러낸다(빈 배열 기대값을 두지 않는다는 §C-8 원칙).
  const allText = distFiles
    .filter((f) => /\.js$/.test(f.url))
    .map((f) => [f.url, readFileSync(f.path, 'utf-8')]);
  const countAcross = (needle) => allText.filter(([, text]) => text.includes(needle)).length;
  // `resync` 는 따옴표 없이 찾는다 — 미니파이어가 `'resync' in response` 를 백틱 템플릿 리터럴
  // (`` `resync` ``)로 바꿔 낼 수도 있어(실측) 인용부호까지 고정하면 마커가 조용히 깨진다.
  const ENTRY_ABSENT_ELSEWHERE_PRESENT = ['X-Tasky', 'protocol:', 'resync'];
  for (const needle of ENTRY_ABSENT_ELSEWHERE_PRESENT) {
    if (entryText.includes(needle))
      note(`진입 청크에 "${needle}" 이 있습니다 — 동기화 엔진/트랜스포트가 진입에 흡수됐습니다.`);
    if (countAcross(needle) === 0)
      note(
        `"${needle}" 이 dist 어디에도 없습니다 — 마커가 죽었을 수 있습니다(빌드가 조용히 무력화됨).`,
      );
  }
  if (!entryText.includes('Google로 계속하기'))
    note('진입 청크에 "Google로 계속하기" 가 없습니다 — 로그인 화면이 진입에서 빠졌습니다(R2).');
  const NEVER_IN_DIST = ['reject-stale', '[vectors]'];
  for (const needle of NEVER_IN_DIST) {
    if (countAcross(needle) > 0)
      note(`dist 에 "${needle}" 이 있습니다 — 가짜 서버/검증 벡터가 번들에 샜습니다.`);
  }
  if (!distFiles.some((f) => /^\/assets\/sync-engine-.*\.js$/.test(f.url)))
    note('sync-engine-*.js 청크가 없습니다 — 동기화 엔진이 지연 청크로 분리되지 않았습니다.');

  summary =
    `진입 폐포 gzip ${closureGzip} B / 예산 ${ENTRY_BUDGET} B · ` +
    `index.js 단독 ${entryGzip} B · 네트워크 합 ${networkGzip} B / 예산 ${NETWORK_BUDGET} B` +
    deltaNote;
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
