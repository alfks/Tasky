export type GraphChunk = {
  file: string;
  entry: boolean;
  modules: string[];
  imports: string[];
  dynamicImports: string[];
};
type BundleAsset =
  | { type: 'asset' }
  | {
      type: 'chunk';
      fileName: string;
      isEntry: boolean;
      modules: Record<string, unknown>;
      imports: string[];
      dynamicImports: string[];
    };
export const OPTIONAL_SOURCE_ROOTS: string[];
export function chunkGraph(bundle: Record<string, BundleAsset>): GraphChunk[];
export function graphClosure(graph: GraphChunk[], roots: string[], dynamic?: boolean): Set<string>;
export function classifyGraph(
  graph: GraphChunk[],
  sourceRoots?: string[],
): {
  anchors: string[];
  required: Set<string>;
  optional: Set<string>;
};
export function inspectArtifactGraph(
  graph: GraphChunk[],
  assetUrls: string[],
  doc: string,
): {
  errors: string[];
  firstLoad: Set<string>;
  optional: Set<string>;
};

export function artifactSizes<T extends { url: string }>(
  graph: GraphChunk[],
  assets: T[],
  doc: string,
  sizeOf: (file: T) => number,
): { networkGzip: number; optionalGzip: number; totalGzip: number };
export function inspectPrecacheGraph(graph: GraphChunk[], urls: string[]): string[];

export const PERSONAL_DIALOG_MODULES: string[];
export function bundleGroup(
  moduleId: string,
): 'personal-dialogs' | 'shared-primitives' | 'react-vendor' | undefined;
export function inspectBundleGroups(graph: GraphChunk[]): string[];
