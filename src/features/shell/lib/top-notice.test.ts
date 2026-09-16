// 상단 고정 알림만큼 자리를 비운다 (실 Chromium 에서 배너가 날짜 스트립을 덮던 자리).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TOP_NOTICE_GAP_PX,
  TOP_NOTICE_SELECTOR,
  measureTopNotice,
  observeTopNotice,
} from '@/features/shell/lib/top-notice';

function addNoticeRegion(bannerBottom: number | null): HTMLElement {
  const region = document.createElement('div');
  region.setAttribute('data-top-notice', '');
  if (bannerBottom !== null) {
    const banner = document.createElement('div');
    vi.spyOn(banner, 'getBoundingClientRect').mockReturnValue({ bottom: bannerBottom } as DOMRect);
    region.append(banner);
  }
  document.body.append(region);
  return region;
}

beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('measureTopNotice', () => {
  it('알림 영역 자체가 없으면 0', () => {
    expect(measureTopNotice(document)).toBe(0);
  });

  it('영역은 있지만 배너가 없으면 0 — 빈 라이브 영역이 자리를 먹지 않는다', () => {
    addNoticeRegion(null);
    expect(measureTopNotice(document)).toBe(0);
  });

  it('배너가 있으면 그 아래 끝 + 간격만큼 비운다', () => {
    addNoticeRegion(72);
    expect(measureTopNotice(document)).toBe(72 + TOP_NOTICE_GAP_PX);
  });

  it('선택자는 사람이 읽는 문구가 아니라 PwaNotices 의 표식을 본다(T-30)', () => {
    expect(TOP_NOTICE_SELECTOR).toBe('[data-top-notice]');
  });

  it('접근 이름만 같고 표식이 없으면 못 찾는다 — 문구에 다시 결합되지 않았다는 증거', () => {
    const region = document.createElement('div');
    region.setAttribute('aria-label', '저장 공간 알림');
    const banner = document.createElement('div');
    vi.spyOn(banner, 'getBoundingClientRect').mockReturnValue({ bottom: 72 } as DOMRect);
    region.append(banner);
    document.body.append(region);
    expect(measureTopNotice(document)).toBe(0);
  });
});

describe('observeTopNotice', () => {
  it('배너가 나중에 떠도 알린다', async () => {
    const region = addNoticeRegion(null);
    const seen: number[] = [];
    const stop = observeTopNotice(document, (px) => seen.push(px));
    const banner = document.createElement('div');
    vi.spyOn(banner, 'getBoundingClientRect').mockReturnValue({ bottom: 60 } as DOMRect);
    region.append(banner);
    await new Promise((resolve) => setTimeout(resolve, 0));
    stop();
    expect(seen.at(-1)).toBe(60 + TOP_NOTICE_GAP_PX);
  });

  it('배너를 닫으면 0 으로 돌아간다', async () => {
    const region = addNoticeRegion(60);
    const seen: number[] = [];
    const stop = observeTopNotice(document, (px) => seen.push(px));
    region.replaceChildren();
    await new Promise((resolve) => setTimeout(resolve, 0));
    stop();
    expect(seen.at(-1)).toBe(0);
  });
});
