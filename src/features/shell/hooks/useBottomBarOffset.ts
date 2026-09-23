// 하단 고정 [+ 할 일] 막대가 차지하는 높이. 자세한 사정은 `lib/bottom-bar.ts` 머리주석.
import { useEffect, useState } from 'react';

import { observeBottomBar } from '@/features/shell/lib/bottom-bar';

export function useBottomBarOffset(): number {
  const [offset, setOffset] = useState(0);
  useEffect(() => observeBottomBar(document, setOffset), []);
  return offset;
}
