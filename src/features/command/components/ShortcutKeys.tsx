import { Fragment } from 'react';

import type { Chord } from '@/features/command/lib/key-chord';
import { chordKeyLabels, chordSpokenLabel, isMacPlatform } from '@/features/command/lib/key-label';

import { Kbd } from '@/components/ui/Kbd';

import { cn } from '@/lib/cn';

type ShortcutKeysProps = {
  /** 같은 동작에 붙은 조합들. 둘 이상이면 "또는" 으로 잇는다. */
  chords: readonly Chord[];
  /** 표기를 macOS 기준으로(R3). 기본값은 지금 브라우저. 테스트·스토리는 값을 넘겨 두 판을 다 본다. */
  isMac?: boolean;
  className?: string;
};

/**
 * 조합을 `<kbd>` 칩으로 그린다(shortcuts §5).
 *
 * 칩 전체를 `aria-hidden` 으로 덮고 같은 뜻의 한국어 문장을 따로 둔다: `⌘` `←` 같은 기호를 낭독기가
 * 읽는 방식이 제각각이라(Chromium AX 트리 실측에서 `⌘` 노드의 이름은 비어 있었다) 기호만 남기면
 * 스크린리더 사용자에게는 행이 "오늘로 " 로 끝난다. `<kbd aria-label>` 은 `kbd` 에 암묵 역할이 없어
 * 이름 계산이 보장되지 않으므로 쓰지 않았다.
 */
export function ShortcutKeys({ chords, isMac = isMacPlatform(), className }: ShortcutKeysProps) {
  const spoken = chords.map((chord) => chordSpokenLabel(chord, isMac)).join(' 또는 ');
  return (
    <span className={cn('inline-flex items-center gap-[var(--space-1)]', className)}>
      <span aria-hidden="true" className="inline-flex items-center gap-[var(--space-1)]">
        {chords.map((chord, chordIndex) => (
          <Fragment key={chordSpokenLabel(chord, isMac)}>
            {chordIndex > 0 ? <span className="text-xs text-muted">또는</span> : null}
            {chordKeyLabels(chord, isMac).map((label, labelIndex) => (
              <Fragment key={label}>
                {labelIndex > 0 ? <span className="text-xs text-muted">+</span> : null}
                <Kbd>{label}</Kbd>
              </Fragment>
            ))}
          </Fragment>
        ))}
      </span>
      <span className="sr-only">{spoken}</span>
    </span>
  );
}
