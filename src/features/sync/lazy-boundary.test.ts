// 지연 로드 경계 가드(T94_LAZY_BOUNDARY.md §C-8①). `src/app/main.tsx` 에서 **정적 값 import 만**
// 따라가 진입 청크에 실제로 실리는 모듈 그래프를 구하고, `src/features/sync/**` 중 정확히 진입에
// 남아야 할 파일만 그 안에 있는지, 지연 대상(엔진·auth-actions·도메인 값·트랜스포트 구현)은
// **없는지** 단언한다. `import()` 는 간선이 아니다 — 그것이 이 경계의 정의다.
//
// 원칙(빈 배열 기대값을 두지 않는다): 해석 실패는 빈 배열을 기대하고(있으면 안 됨), 도달 집합
// 크기는 하한을 두고, 음성 단언은 반드시 "닿는 다른 지점"이 있는 둘째 걷기와 짝짓는다 — 그래야
// 그래프 자체가 텅 비어 모든 음성이 공짜로 통과하는 것을 막는다.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.resolve('src');

/** `import`/`export … from` 절과 부작용 전용 `import '…'` 를 모두 잡는다(멀티라인 허용). */
const FROM_CLAUSE =
  /import\s+(type\s+)?([^;]*?)\s*from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|export\s+(type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]|export\s+\*\s+from\s*['"]([^'"]+)['"]/g;

/** 중괄호 절 안의 모든 named specifier 가 `type ` 로 시작하면(= 전부 타입) 값 간선이 아니다. */
function isAllTypeSpecifiers(clause: string): boolean {
  const names = clause
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return names.length > 0 && names.every((s) => /^type\s+/.test(s));
}

/** 한 파일의 소스에서 **값으로 평가되는** import/export-from 목적지 명세(문자열 그대로)를 뽑는다. */
function valueImportSpecifiers(source: string): string[] {
  const specs: string[] = [];
  for (const m of source.matchAll(FROM_CLAUSE)) {
    const [
      ,
      importTypeAll,
      importClause,
      importFrom,
      sideEffect,
      exportTypeAll,
      exportClause,
      exportFrom,
      exportStar,
    ] = m;
    if (sideEffect !== undefined) {
      specs.push(sideEffect); // `import '@/styles/globals.css'` 류 — 부작용이라 값 간선
      continue;
    }
    if (importFrom !== undefined) {
      if (importTypeAll !== undefined) continue; // `import type { … } from …`
      const clause = importClause ?? '';
      if (clause.startsWith('{') && isAllTypeSpecifiers(clause.slice(1, -1))) continue;
      specs.push(importFrom);
      continue;
    }
    if (exportFrom !== undefined) {
      if (exportTypeAll !== undefined) continue; // `export type { … } from …`
      if (isAllTypeSpecifiers(exportClause ?? '')) continue;
      specs.push(exportFrom);
      continue;
    }
    if (exportStar !== undefined) specs.push(exportStar);
  }
  return specs;
}

/** `@/x` → `src/x`, 상대경로는 파일 기준. 확장자는 그대로 → `.ts` → `.tsx` → `/index.ts` 순으로 해석. */
function resolveSpec(spec: string, fromFile: string): string | null {
  if (spec.startsWith('@/')) {
    return resolveCandidates(path.join(SRC_ROOT, spec.slice(2)));
  }
  if (spec.startsWith('.')) {
    return resolveCandidates(path.join(path.dirname(fromFile), spec));
  }
  return null; // 외부 패키지 — 걷지 않는다
}

function resolveCandidates(base: string): string | null {
  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')];
  for (const candidate of candidates) {
    try {
      readFileSync(candidate, 'utf-8');
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

type WalkResult = { reachable: Set<string>; errors: string[] };

/** `entry` 에서 정적 값 import 만 따라가 도달 가능한 파일 집합을 구한다. */
function walk(entry: string): WalkResult {
  const reachable = new Set<string>();
  const errors: string[] = [];
  const queue = [path.resolve(entry)];
  while (queue.length > 0) {
    const file = queue.shift();
    if (file === undefined || reachable.has(file)) continue;
    reachable.add(file);
    if (!/\.(ts|tsx)$/.test(file)) continue; // .css 등은 잎 — 더 훑지 않는다
    let source: string;
    try {
      source = readFileSync(file, 'utf-8');
    } catch {
      errors.push(`읽기 실패: ${file}`);
      continue;
    }
    for (const spec of valueImportSpecifiers(source)) {
      if (!spec.startsWith('@/') && !spec.startsWith('.')) continue; // 외부 패키지
      const resolved = resolveSpec(spec, file);
      if (resolved === null) {
        errors.push(`해석 실패: ${file} → ${spec}`);
        continue;
      }
      if (!reachable.has(resolved)) queue.push(resolved);
    }
  }
  return { reachable, errors };
}

/** 도달 집합을 `src/` 상대 경로 집합으로. */
function relSet(reachable: Set<string>): Set<string> {
  return new Set([...reachable].map((f) => path.relative(SRC_ROOT, f).replaceAll(path.sep, '/')));
}

describe('sync 지연 로드 경계 — 진입 그래프 도달성', () => {
  const { reachable, errors } = walk('src/app/main.tsx');
  const rel = relSet(reachable);

  it('해석 실패가 없다(해석기가 조용히 죽지 않는다)', () => {
    expect(errors).toEqual([]);
  });

  it('그래프가 비어 있지 않다(음성 단언이 공짜로 통과하는 것을 막는 하한)', () => {
    expect(reachable.size).toBeGreaterThan(200);
  });

  const SYNC_ENTRY_ALLOWLIST = [
    'features/sync/index.ts',
    'features/sync/store/sync-store.ts',
    'features/sync/components/AuthGate.tsx',
    'features/sync/components/LoginScreen.tsx',
    'features/sync/components/AccountBlockLauncher.tsx',
    'features/sync/components/AccountBlock.tsx',
    'features/sync/components/AccountSyncOverlays.tsx',
    'features/sync/components/UploadDialog.tsx',
    'features/sync/components/AccountDeleteDialog.tsx',
    'features/sync/components/AccountDeletedNotice.tsx',
    'features/sync/components/AccountSwitchedNotice.tsx',
  ].sort();

  it('진입에 닿는 src/features/sync/** 는 정확히 이 열한 파일뿐이다(리뷰 Major 2·3 — 계정 전환 안내·항상-마운트 오버레이가 늘었다)', () => {
    const syncFiles = [...rel].filter((f) => f.startsWith('features/sync/')).sort();
    expect(syncFiles).toEqual(SYNC_ENTRY_ALLOWLIST);
  });

  const LAZY_ONLY = [
    'features/sync/store/sync-engine.ts',
    'features/sync/store/auth-actions.ts',
    'features/sync/store/reload-views.ts',
    'infra/sync/http-transport.ts',
    'infra/indexeddb/repositories.ts',
    'infra/indexeddb/db.ts',
    'domain/sync/wire.ts',
    'domain/sync/remote-rows.ts',
    'domain/sync/server-rules.ts',
    'repositories/sync-transport.ts',
    'domain/backup/validate-rows.ts',
    'repositories/memory/sync-server.ts',
    'repositories/memory/sync-transport.ts',
  ];

  it.each(LAZY_ONLY)('%s 는 진입에 닿지 않는다', (file) => {
    expect(rel.has(file)).toBe(false);
  });

  // 음성 짝 — 둘째 걷기로 위 파일들이 "존재는 하고, 다른 지점에서는 닿는다"를 보여, 위 음성이
  // "파일이 아예 없어서" 거저 통과한 게 아님을 확인한다.
  it('sync-engine.ts 자신에서 시작하면 wire.ts·remote-rows.ts 에 닿는다', () => {
    const { reachable: fromEngine, errors: engineErrors } = walk(
      'src/features/sync/store/sync-engine.ts',
    );
    expect(engineErrors).toEqual([]);
    const engineRel = relSet(fromEngine);
    expect(engineRel.has('domain/sync/wire.ts')).toBe(true);
    expect(engineRel.has('domain/sync/remote-rows.ts')).toBe(true);
  });
});

describe('sync 지연 로드 경계 — 방향 규칙(§D-10)', () => {
  const NON_ASSEMBLING_FEATURES = [
    'todo',
    'category',
    'calendar',
    'diary',
    'timer',
    'theme',
    'date-strip',
    'stats',
    'command',
    'pwa',
    'reports',
  ];

  it.each(NON_ASSEMBLING_FEATURES)(
    'features/%s/** 의 어떤 파일도 @/features/sync 를 import 하지 않는다',
    (feature) => {
      const dir = path.join(SRC_ROOT, 'features', feature);
      const hits: string[] = [];
      const stack = [dir];
      while (stack.length > 0) {
        const current = stack.pop();
        if (current === undefined) continue;
        let entries;
        try {
          entries = readdirSync(current, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const entry of entries) {
          const full = path.join(current, entry.name);
          if (entry.isDirectory()) stack.push(full);
          else if (/\.(ts|tsx)$/.test(entry.name)) {
            const source = readFileSync(full, 'utf-8');
            if (/@\/features\/sync\b/.test(source)) hits.push(full);
          }
        }
      }
      expect(hits).toEqual([]);
    },
  );

  // 양성 짝 — 조립하는 쪽(shell·backup)은 실제로 import **한다**. 위 음성이 "아무도 안 써서 당연히
  // 없는" 결과가 아님을 보인다.
  const ASSEMBLERS = [
    'src/features/shell/components/ShellSidebar.tsx',
    'src/features/shell/components/ShellHeader.tsx',
    'src/features/shell/components/ShellOverlays.tsx',
    'src/features/backup/components/BackupDialog.tsx',
  ];

  it.each(ASSEMBLERS)('%s 는 @/features/sync 를 import 한다', (file) => {
    expect(readFileSync(file, 'utf-8')).toMatch(/@\/features\/sync\b/);
  });

  it('src/features/sync/** 는 @/features/(shell|backup) 를 import 하지 않는다', () => {
    const dir = path.join(SRC_ROOT, 'features', 'sync');
    const hits: string[] = [];
    const stack = [dir];
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) continue;
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) {
          const source = readFileSync(full, 'utf-8');
          if (/@\/features\/(shell|backup)\b/.test(source)) hits.push(full);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
