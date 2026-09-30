import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyGraph, graphClosure } from './bundle-graph.mjs';

const chunk = (file, modules = [], imports = [], dynamicImports = [], entry = false) => ({
  file,
  modules,
  imports,
  dynamicImports,
  entry,
});
const root = '/project/src/features/shell/components/SocialWorkspace.tsx';

test('개인 dynamic preload와 optional 공유 의존성은 필수로 남긴다', () => {
  const graph = [
    chunk('entry.js', [], [], ['personal.js', 'social.js'], true),
    chunk('personal.js', [], ['shared.js']),
    chunk('social.js', [root], ['shared.js', 'social-only.js'], ['social-dialog.js']),
    chunk('shared.js'),
    chunk('social-only.js'),
    chunk('social-dialog.js'),
    chunk('unknown.js'),
  ];
  const { required, optional } = classifyGraph(graph);
  assert.deepEqual([...required].sort(), ['entry.js', 'personal.js', 'shared.js', 'unknown.js']);
  assert.deepEqual([...optional].sort(), ['social-dialog.js', 'social-only.js', 'social.js']);
});

test('출력 basename이 바뀌어도 소스 anchor만으로 같은 optional 정책을 사용한다', () => {
  const graph = [chunk('entry.js', [], [], ['random.js'], true), chunk('random.js', [root])];
  assert.deepEqual([...classifyGraph(graph).optional], ['random.js']);
});

test('정적 entry에 흡수된 소셜 anchor는 optional로 예산을 숨기지 않는다', () => {
  const graph = [chunk('entry.js', [root], ['heavy.js'], [], true), chunk('heavy.js')];
  assert.equal(classifyGraph(graph).optional.size, 0);
});

test('anchor가 사라지거나 알려지지 않은 소스 청크면 fail closed로 필수다', () => {
  const graph = [
    chunk('entry.js', [], [], ['SocialWorkspace.js'], true),
    chunk('SocialWorkspace.js', ['/other/unknown.ts']),
  ];
  assert.equal(classifyGraph(graph).optional.size, 0);
  assert.equal(classifyGraph(graph).required.size, 2);
});

test('누락 의존성은 조용히 분류하지 않고 실패한다', () => {
  assert.throws(
    () => graphClosure([chunk('entry.js', [], ['missing.js'])], ['entry.js']),
    /알 수 없는/,
  );
});

test('실제 HTML 첫로드는 optional byte를 감추거나 개인 preload를 지울 수 없다', async () => {
  const { inspectArtifactGraph } = await import('./bundle-graph.mjs');
  const graph = [
    chunk('assets/main.js', [], [], ['assets/optional.js'], true),
    chunk('assets/optional.js', [root]),
    chunk('assets/personal.js'),
  ];
  const assets = graph.map((c) => `/${c.file}`);
  const doc =
    '<script type="module" src="/assets/main.js"></script><link rel="modulepreload" href="/assets/personal.js">';
  const result = inspectArtifactGraph(graph, assets, doc);
  assert.equal(result.errors.length, 0);
  assert.deepEqual([...result.firstLoad].sort(), ['assets/main.js', 'assets/personal.js']);
  assert.match(
    inspectArtifactGraph(
      graph,
      assets,
      doc.replace('<link rel="modulepreload" href="/assets/personal.js">', ''),
    ).errors.join(),
    /필수 개인/,
  );
  assert.match(
    inspectArtifactGraph(
      graph,
      assets,
      `${doc}<link rel="modulepreload" href="/assets/optional.js">`,
    ).errors.join(),
    /온라인 선택/,
  );
  assert.match(
    inspectArtifactGraph(graph, [...assets, '/assets/extra.js'], doc).errors.join(),
    /분류되지/,
  );
});

test('optional과 공유하는 기존 개인 dynamic 진입도 preload를 유지한다', () => {
  const graph = [
    chunk('entry.js', [], [], ['personal.js', 'social.js'], true),
    chunk('social.js', [root], ['personal.js']),
    chunk('personal.js', ['/project/src/features/backup/BackupScreen.tsx'], [], ['unknown.js']),
    chunk('unknown.js'),
  ];
  const { required, optional } = classifyGraph(graph);
  assert.deepEqual([...required].sort(), ['entry.js', 'personal.js', 'unknown.js']);
  assert.deepEqual([...optional], ['social.js']);
});

test('개인 offline 청크 누락과 optional 첫 SW 설치 fetch는 실패한다', async () => {
  const { inspectPrecacheGraph } = await import('./bundle-graph.mjs');
  const graph = [
    chunk('assets/main.js', [], [], ['assets/social.js'], true),
    chunk('assets/social.js', [root]),
  ];
  assert.deepEqual(inspectPrecacheGraph(graph, ['/assets/main.js']), []);
  assert.match(inspectPrecacheGraph(graph, []).join(), /개인 필수/);
  assert.match(
    inspectPrecacheGraph(graph, ['/assets/main.js', '/assets/social.js']).join(),
    /온라인 선택/,
  );
});

test('청크 묶음은 승인한 정확한 소스와 패키지 파일만 잡는다', async () => {
  const { bundleGroup } = await import('./bundle-graph.mjs');
  assert.equal(bundleGroup('/project/src/components/ui/Button.tsx'), 'shared-primitives');
  assert.equal(
    bundleGroup('C:\\project\\src\\features\\profile\\components\\ProfileDialog.tsx'),
    'personal-dialogs',
  );
  assert.equal(
    bundleGroup('/project/node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs'),
    'shared-primitives',
  );
  assert.equal(bundleGroup('/project/node_modules/react/jsx-runtime.js'), 'react-vendor');
  for (const source of [
    '/project/src/app/main.tsx',
    '/project/src/app/providers.tsx',
    '/project/src/features/category/store/category-store.ts',
    '/project/src/components/ui/Button.tsx/unknown.ts',
    '/project/src/components/ui/ButtonLike.tsx',
    '/project/node_modules/clsx/dist/other.mjs',
    '/project/node_modules/clsx-lookalike/dist/clsx.mjs',
    '/project/node_modules/react-lookalike/index.js',
    '/project/node_modules/dexie/dist/dexie.mjs',
  ])
    assert.equal(bundleGroup(source), undefined, source);
});

test('묶음에 초기화·공유 의존성을 섞거나 개인 모달을 정적 진입으로 당기면 실패한다', async () => {
  const { inspectBundleGroups } = await import('./bundle-graph.mjs');
  const personal = '/project/src/features/profile/components/ProfileDialog.tsx';
  const button = '/project/src/components/ui/Button.tsx';
  const clean = [
    chunk('entry.js', [], ['ui.js'], ['dialogs.js'], true),
    chunk('ui.js', [button]),
    chunk('dialogs.js', [personal], ['ui.js']),
  ];
  assert.deepEqual(inspectBundleGroups(clean), []);
  for (const hidden of [
    button,
    '/project/src/app/providers.tsx',
    '/project/node_modules/dexie/dist/dexie.mjs',
  ]) {
    assert.match(inspectBundleGroups([chunk('mixed.js', [personal, hidden])]).join(), /승인되지/);
  }
  const eager = [chunk('entry.js', [], ['dialogs.js'], [], true), chunk('dialogs.js', [personal])];
  assert.match(inspectBundleGroups(eager).join(), /정적 진입/);
  const nested = [
    chunk('entry.js', [], ['ui.js'], [], true),
    chunk('ui.js', [button], ['dialogs.js']),
    chunk('dialogs.js', [personal]),
  ];
  assert.match(inspectBundleGroups(nested).join(), /정적 진입/);
});
