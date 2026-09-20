import { describe, expect, it } from 'vitest';

import {
  isInsideLayerAbove,
  isTopOverlayLayer,
  overlayLayerCount,
  overlayZIndex,
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

// 리뷰 #104 라운드2 Minor-2: `overlayZIndex`(공개 순수 함수)의 계약을 직접 잰다 — e2e 는 "모달 안
// 팝오버" 한 조합만 덮는다. 모듈 상태가 전역이라(`stack`) 각 테스트가 자기 몫을 반드시 pop 한다.
describe('overlayZIndex', () => {
  it('스택이 비어 있으면 baseZ 그대로다(가장 바깥에서 여는 보통의 경우)', () => {
    expect(overlayZIndex(20)).toBe(20);
    expect(overlayZIndex(30)).toBe(30);
  });

  it('이미 열린 레이어보다 항상 높다(대화상자 30 안에서 여는 팝오버 20 → 31)', () => {
    const outer = layerOf(document.createElement('div'));
    const pop = pushOverlayLayer(outer, 30);
    expect(overlayZIndex(20)).toBe(31);
    pop();
  });

  it('중첩(3단계): 30 → 31 → 32', () => {
    const l1 = layerOf(document.createElement('div'));
    const pop1 = pushOverlayLayer(l1, 30);
    expect(overlayZIndex(30)).toBe(31);
    const l2 = layerOf(document.createElement('div'));
    const pop2 = pushOverlayLayer(l2, 30);
    expect(overlayZIndex(30)).toBe(32);
    const l3 = layerOf(document.createElement('div'));
    const pop3 = pushOverlayLayer(l3, 30);
    expect(overlayZIndex(20)).toBe(33);
    pop3();
    pop2();
    pop1();
  });

  it('pop 하면 그 레이어의 z 는 더 이상 계산에 들어가지 않는다', () => {
    const high = layerOf(document.createElement('div'));
    const popHigh = pushOverlayLayer(high, 30);
    expect(overlayZIndex(20)).toBe(31);
    popHigh();
    // 높은 레이어가 내려갔으니 스택이 다시 비었다 — 새로 여는 것은 자기 baseZ 그대로다.
    expect(overlayZIndex(20)).toBe(20);
  });

  it('baseZ 없이 push 한 레이어(z 관리가 필요 없는 호출부)는 계산에 끼지 않는다', () => {
    const untracked = layerOf(document.createElement('div'));
    const pop = pushOverlayLayer(untracked); // baseZ 생략 — 기존 호출부와 같은 모양
    expect(overlayLayerCount()).toBe(1);
    expect(overlayZIndex(20)).toBe(20); // 스택엔 있지만 z 를 안 남겼으니 20 을 끌어올리지 않는다
    pop();
  });
});
