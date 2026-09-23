// 읽기 조건: 번들 델타 리포트(scripts/bundle-baseline.json 비교) 로직을 바꿀 때.
// check-dist.mjs 하나에 다 있으면 그 파일이 300줄 상한(eslint max-lines)을 넘는다 — 로직을
// 옮긴 이유는 오직 그것뿐이라 여기 있는 함수는 check-dist.mjs 가 부르는 용도로만 존재한다.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const BASELINE_PATH = 'scripts/bundle-baseline.json';

// --update-baseline 을 돌리는 사람이 "이 기준값이 어느 PR 것인지" 남기는 선택 인자. CLAUDE.md
// 머리("기준을 커밋 해시가 아니라 PR 번호로 적는다 — 해시는 재는 시점과 머지 시점이 달라 머지되는
// 순간 이미 틀린 값을 가리킨다")를 bundle-baseline.json 에도 그대로 적용한다. 안 주면 null —
// 머지 전에는 PR 번호를 모를 수 있으니 필수로 만들지 않는다(머지 후 사람이 다시 채운다).
export function parsePrArg(argv) {
  const arg = argv.find((a) => a.startsWith('--pr='));
  return arg === undefined ? null : Number.parseInt(arg.slice('--pr='.length), 10);
}

/** 현재 브랜치 이름(best-effort) — 실패해도 기준값 갱신 자체를 막지 않는다. */
export function currentBranch() {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

/** 기준값 파일을 읽는다. 없으면 null. 손상됐으면 note(...)로 알리고 null을 돌려준다. */
export function readBaseline(note) {
  if (!existsSync(BASELINE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
  } catch (error) {
    note(`${BASELINE_PATH} 를 읽지 못했습니다(JSON 파싱 실패): ${String(error)}`);
    return null;
  }
}

/** 새 기준값을 파일에 쓰고 그 값을 돌려준다(--update-baseline 전용). */
export function writeBaseline({ entryClosureGzip, networkGzip, prNumber, branch }) {
  const next = {
    entryClosureGzip,
    networkGzip,
    prNumber,
    branch,
    recordedAt: new Date().toISOString().slice(0, 10),
    note: 'node scripts/check-dist.mjs --update-baseline 로 갱신됨 — scripts/AGENTS.md 참고.',
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

/**
 * 진입 폐포·네트워크 합 delta 문구를 만들고, 필요하면 WARN 을 찍는다.
 * scripts/AGENTS.md 규칙 6("검사 대상이 없을 때 조용히 통과시키지 않는다") — baseline 이
 * null(파일 없음)이거나 entryClosureGzip 이 숫자가 아니면(손상·스키마 변경) WARN 만 찍고
 * '' 를 돌려준다. networkGzip 은 옛 스키마 하위호환을 위해 숫자일 때만 부가로 찍는다.
 */
export function deltaReport(baseline, closureGzip, networkGzip) {
  if (baseline === null) {
    console.warn(
      `WARN: ${BASELINE_PATH} 가 없어 진입 폐포 delta 를 비교하지 못했습니다 — ` +
        'node scripts/check-dist.mjs --update-baseline 로 만드세요.',
    );
    return '';
  }
  if (typeof baseline.entryClosureGzip !== 'number') {
    console.warn(
      `WARN: ${BASELINE_PATH} 에 entryClosureGzip 숫자 값이 없어 진입 폐포 delta 를 비교하지 ` +
        '못했습니다(파일이 손상됐거나 스키마가 바뀌었을 수 있습니다) — ' +
        'node scripts/check-dist.mjs --update-baseline 로 다시 만드세요.',
    );
    return '';
  }
  const delta = closureGzip - baseline.entryClosureGzip;
  const sign = delta >= 0 ? '+' : '';
  let out = ` · 진입 폐포 delta ${sign}${delta} B(기준 ${baseline.entryClosureGzip} B, ${baseline.recordedAt})`;
  if (delta >= 2_000) {
    console.warn(
      `WARN: 진입 폐포 gzip 이 기준(${baseline.recordedAt}, ${baseline.entryClosureGzip} B) 대비 ` +
        `${sign}${delta} B 늘었습니다(상한 초과는 아닙니다) — PR 본문에 무엇이 늘었는지 근거를 ` +
        '적으세요(calendar-layout.md §7). 근거가 붙었으면 이 경고는 무시해도 되고, 새 값을 ' +
        '기준으로 인정하려면 node scripts/check-dist.mjs --update-baseline 을 돌리세요.',
    );
  }
  if (typeof baseline.networkGzip === 'number') {
    const netDelta = networkGzip - baseline.networkGzip;
    const netSign = netDelta >= 0 ? '+' : '';
    out += ` · 네트워크 delta ${netSign}${netDelta} B(기준 ${baseline.networkGzip} B)`;
    if (netDelta >= 2_000) {
      console.warn(
        `WARN: 네트워크 합 gzip 이 기준(${baseline.recordedAt}, ${baseline.networkGzip} B) 대비 ` +
          `${netSign}${netDelta} B 늘었습니다(상한 초과는 아닙니다) — 진입 폐포 delta 와 같은 ` +
          '기준으로 PR 본문에 근거를 적으세요.',
      );
    }
  }
  return out;
}
