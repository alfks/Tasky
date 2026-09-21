<!-- 읽기 조건: PWA 아이콘·manifest, 셀프 호스팅 폰트, 정적 자산 캐시 헤더를 추가·교체할 때. -->

# public/ — AGENTS

## 목적

빌드 파이프라인을 거치지 않고 그대로 서빙되는 정적 자산과 그 배포 헤더만 둔다 — web manifest(`manifest.webmanifest`), PWA 아이콘, 셀프 호스팅 폰트(`fonts/`), `_headers`. manifest 는 예전에 `src/app/manifest.ts` 가 만드는 Worker 동적 라우트였지만 ADR-0013 에서 **여기 정적 파일**이 됐다 — 그래서 이제 서비스워커 프리캐시에도 들어간다.

## 규칙

1. 코드 파일(`.ts`/`.tsx`/`.js`) 금지 — 정적 자산만.
2. **아이콘 4종은 손으로 만들지 않는다** — 그림의 원본은 `assets/seal-sheet.png`(캐릭터 확정본, 서빙되지 않음)이고 `node scripts/make-icons.mjs` 가 거기서 오려 네 파일을 만든다. 코드로 다시 그리지 않는다(`docs/specs/pwa.md` R2-a). 하나만 손으로 고치면 나머지 셋과 조용히 갈라진다. 파일마다 계약이 다르다: 192·512 는 모서리가 투명한 둥근 사각, maskable 은 꽉 찬 사각 + 캐릭터를 안전 영역(≈72%)까지 축소, `icon-apple-touch-180.png` 는 꽉 찬 사각 + **알파 없음**(iOS 는 투명 픽셀을 검정으로 합성한다 — `docs/specs/pwa.md` R1-a). apple 것만 `manifest` 의 `icons` 밖이고 `index.html` 의 `<link rel="apple-touch-icon">` 가 가리킨다. `scripts/check-dist.mjs` 가 매 빌드 크기·알파·문서 링크·프리캐시 포함을 확인한다.
3. 나머지 아이콘의 크기·이름은 `manifest.webmanifest` 의 `icons` 배열과 1:1로 맞춘다. `manifest.webmanifest` 자체는 `docs/specs/pwa.md` R1 의 필드(`name`·`start_url`·`scope`·`display`·색 2종·아이콘 3종)를 지켜야 하고, `scripts/check-dist.mjs` 가 매 빌드 그 값들과 프리캐시 포함 여부를 확인한다. `index.html` 의 `<link rel="manifest">` 가 이 파일을 가리키는지도 같은 스크립트가 본다 — 파일만 있고 문서가 안 가리키면 설치되지 않는다.
4. `_headers` — Cloudflare Workers Static Assets 가 읽는 캐시 헤더. Vite 가 이 디렉토리를 `dist/client` 로 그대로 복사하므로 이 파일이 곧 산출물이다(생성본과 합쳐지지 않는다). Worker 코드가 없는 정적 자산 전용 배포라(ADR-0013) **모든 응답이 여기 규칙의 적용 대상**이다. 번들 자산 규칙 `/assets/*` 는 `vite.config.ts` 의 `build.assetsDir` 과 한 쌍이다 — `scripts/check-dist.mjs` 가 매 빌드 산출물 파일 하나하나가 이 글롭에 덮이는지 대조하므로 한쪽만 바꾸면 빌드가 실패한다.
5. `fonts/`는 `scripts/subset-font.sh`로만 갱신(손으로 고치지 않는다), woff2 1개 + `OFL.txt`만. 파일명의 내용 해시와 `_headers` 의 `/fonts/*` 1년 immutable 은 **한 쌍**이다 — 해시 없는 이름으로 되돌리면 1년 동안 낡은 폰트가 나간다(`docs/specs/theme.md` R14). 관할: fonts/

## 검증

```bash
pnpm build 2>&1 | tail -5
```
