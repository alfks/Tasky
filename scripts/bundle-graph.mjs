/** ADR-0025: 소스 진입점으로 optional 그래프를 증명한다. 불명확하면 필수로 남긴다. */
export const OPTIONAL_SOURCE_ROOTS = [
  'src/features/shell/components/SocialWorkspace.tsx',
  'src/features/shell/components/PublicWorkspace.tsx',
  'src/features/shell/components/CategoryPublicationWorkspace.tsx',
  'src/features/social/components/SocialScreen.tsx',
  'src/features/social/components/PublicScreen.tsx',
  'src/features/category/components/CategoryAudienceController.tsx',
  'src/infra/social/http-repository.ts',
  'src/infra/social/public-repository.ts',
];

export function chunkGraph(bundle) {
  return Object.values(bundle)
    .filter((asset) => asset.type === 'chunk')
    .map((chunk) => ({
      file: chunk.fileName,
      entry: chunk.isEntry,
      modules: Object.keys(chunk.modules),
      imports: chunk.imports,
      dynamicImports: chunk.dynamicImports,
    }));
}

export function graphClosure(graph, roots, dynamic = false) {
  const byFile = new Map(graph.map((chunk) => [chunk.file, chunk]));
  const reached = new Set();
  const visit = (file) => {
    if (reached.has(file)) return;
    const chunk = byFile.get(file);
    if (chunk === undefined) throw new Error(`알 수 없는 청크 참조: ${file}`);
    reached.add(file);
    for (const dependency of chunk.imports) visit(dependency);
    if (dynamic) for (const dependency of chunk.dynamicImports) visit(dependency);
  };
  roots.forEach(visit);
  return reached;
}

export function classifyGraph(graph, sourceRoots = OPTIONAL_SOURCE_ROOTS) {
  const anchors = graph
    .filter((chunk) =>
      chunk.modules.some((module) =>
        sourceRoots.some((root) => module.replaceAll('\\', '/').endsWith(`/${root}`)),
      ),
    )
    .map((chunk) => chunk.file);
  const candidates = graphClosure(graph, anchors, true);
  // 기존 개인 dynamic root, entry, 분류되지 않은 청크 모두 필수다. 공유 static 의존성도 필수로 되돌린다.
  const requiredRoots = graph
    .filter((chunk) => chunk.entry || !candidates.has(chunk.file))
    .map((chunk) => chunk.file);
  const byFile = new Map(graph.map((chunk) => [chunk.file, chunk]));
  const anchorSet = new Set(anchors);
  const required = new Set();
  const visitRequired = (file) => {
    if (required.has(file)) return;
    const chunk = byFile.get(file);
    if (chunk === undefined) throw new Error(`알 수 없는 청크 참조: ${file}`);
    required.add(file);
    chunk.imports.forEach(visitRequired);
    // 기존 개인 dynamic edge는 유지한다. 명시한 optional 진입 edge만 자른다.
    chunk.dynamicImports.filter((dependency) => !anchorSet.has(dependency)).forEach(visitRequired);
  };
  requiredRoots.forEach(visitRequired);
  const optional = new Set([...candidates].filter((file) => !required.has(file)));
  return { anchors, required, optional };
}

/** 실제 HTML script/preload 폐포와 출력 파일 집합을 대조한다. */
export function inspectArtifactGraph(graph, assetUrls, doc) {
  const { required, optional } = classifyGraph(graph);
  const preloaded = [...doc.matchAll(/rel="modulepreload"[^>]*href="([^"]+)"/g)].map(
    (match) => match[1],
  );
  const scripts = [...doc.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g)].map(
    (match) => match[1],
  );
  const errors = [];
  const allFiles = new Set(assetUrls.map((url) => url.slice(1)));
  for (const file of allFiles) {
    if (!required.has(file) && !optional.has(file))
      errors.push(`/${file} 은 출력 그래프에 분류되지 않았습니다.`);
  }
  for (const file of [...required, ...optional]) {
    if (!allFiles.has(file)) errors.push(`출력 그래프 청크 /${file} 이 실제 산출물에 없습니다.`);
  }
  for (const file of required) {
    if (!preloaded.includes(`/${file}`) && !scripts.includes(`/${file}`))
      errors.push(`필수 개인 청크 /${file} 이 문서에서 preload되지 않았습니다.`);
  }
  for (const file of optional) {
    if (preloaded.includes(`/${file}`))
      errors.push(`온라인 선택 청크 /${file} 이 첫 로드로 preload되었습니다.`);
  }
  const firstLoad = graphClosure(
    graph,
    [...scripts, ...preloaded].map((url) => url.slice(1)),
  );
  return { errors, firstLoad, optional };
}

export function artifactSizes(graph, assets, doc, sizeOf) {
  const { firstLoad, optional } = inspectArtifactGraph(
    graph,
    assets.map((file) => file.url),
    doc,
  );
  const sum = (predicate) =>
    assets.filter(predicate).reduce((total, file) => total + sizeOf(file), 0);
  return {
    networkGzip: sum((file) => firstLoad.has(file.url.slice(1))),
    optionalGzip: sum((file) => optional.has(file.url.slice(1))),
    totalGzip: sum(() => true),
  };
}

/** 개인 offline 청크는 보존하고 온라인 전용 청크는 첫 SW 설치에서도 받지 않는다. */
export function inspectPrecacheGraph(graph, urls) {
  const { required, optional } = classifyGraph(graph);
  return [
    ...[...required]
      .filter((file) => !urls.includes(`/${file}`))
      .map((file) => `개인 필수 청크 /${file} 이 프리캐시에서 빠졌습니다.`),
    ...[...optional]
      .filter((file) => urls.includes(`/${file}`))
      .map((file) => `온라인 선택 청크 /${file} 이 프리캐시에 포함되었습니다.`),
  ];
}
