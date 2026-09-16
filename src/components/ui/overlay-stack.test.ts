import { describe, expect, it } from 'vitest';

import {
  isInsideLayerAbove,
  isTopOverlayLayer,
  overlayLayerCount,
  pushOverlayLayer,
} from '@/components/ui/overlay-stack';

const layerOf = (node: Node) => ({ contains: (target: Node) => node.contains(target) });

describe('overlay-stack', () => {
  it('맨 위 레이어만 top 이고, 내리면 그 아래가 다시 top 이 된다', () => {
    const outer = layerOf(document.createElement('div'));
    const inner = layerOf(document.createElement('div'));
    const popOuter = pushOverlayLayer(outer);
    const popInner = pushOverlayLayer(inner);

    expect(overlayLayerCount()).toBe(2);
    expect(isTopOverlayLayer(inner)).toBe(true);
    expect(isTopOverlayLayer(outer)).toBe(false);

    popInner();
    expect(isTopOverlayLayer(outer)).toBe(true);
    popOuter();
    expect(overlayLayerCount()).toBe(0);
  });

  it('위 레이어가 품은 노드는 아래 레이어에게 "바깥"이 아니다', () => {
    const outerNode = document.createElement('div');
    const innerNode = document.createElement('div');
    const child = document.createElement('button');
    innerNode.append(child);
    const outer = layerOf(outerNode);
    const inner = layerOf(innerNode);
    const popOuter = pushOverlayLayer(outer);
    const popInner = pushOverlayLayer(inner);

    expect(isInsideLayerAbove(outer, child)).toBe(true);
    expect(isInsideLayerAbove(inner, child)).toBe(false);
    expect(isInsideLayerAbove(outer, document.createElement('span'))).toBe(false);

    popInner();
    popOuter();
  });
});
