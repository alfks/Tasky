// 회귀 방지(design review §5 위험5 — "통계가 summarizeDays 를 다시 만드는 사고, Blocker 이력").
// reports/** 는 summarizeDays·summarizeByCategory 를 그대로 부를 뿐, 같은 일을 하는 동명/유사
// 함수를 다시 만들지 않는다. 소스를 직접 훑어 `summarize` 로 시작하는 새 export 함수가 없는지 고정한다.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); // src/features/reports

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    const isSource = /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name);
    return isSource ? [full] : [];
  });
}

describe('회귀 방지: summarize* 함수를 새로 만들지 않는다', () => {
  it('reports/** 어디에도 새 summarize* export 함수 정의가 없다', () => {
    const offenders = sourceFiles(ROOT)
      .filter((file) => /export function summarize\w*\s*\(/.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(ROOT.length + 1));

    expect(offenders).toEqual([]);
  });
});
