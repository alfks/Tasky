import { afterEach, describe, expect, it } from 'vitest';

import {
  isEditableTarget,
  shortcutBlockReason,
  type ShortcutBlockReason,
} from '@/features/command/lib/event-guards';

/** 실제 DOM 에서 실제 이벤트를 쏜다 — `target` 과 `defaultPrevented` 는 손으로 못 만든다. */
function fireFrom(
  html: string,
  init: KeyboardEventInit & { keyCode?: number },
  ctx: { isTopLayer?: boolean; allowInEditable?: boolean; preventFirst?: boolean } = {},
): ShortcutBlockReason | null {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.append(host);
  const source = host.firstElementChild;
  if (source === null) throw new Error('픽스처에 요소가 없습니다.');

  let seen: ShortcutBlockReason | null | undefined;
  if (ctx.preventFirst === true) {
    source.addEventListener('keydown', (e) => e.preventDefault());
  }
  const onKeyDown = (e: Event) => {
    seen = shortcutBlockReason(e as KeyboardEvent, {
      isTopLayer: ctx.isTopLayer ?? true,
      allowInEditable: ctx.allowInEditable ?? false,
    });
  };
  document.addEventListener('keydown', onKeyDown);
  source.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
  document.removeEventListener('keydown', onKeyDown);
  if (seen === undefined) throw new Error('이벤트가 document 까지 오지 않았습니다.');
  return seen;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('isEditableTarget', () => {
  it('입력 요소를 알아본다', () => {
    const host = document.createElement('div');
    host.innerHTML = `
      <input id="text" />
      <input id="check" type="checkbox" />
      <textarea id="area"></textarea>
      <select id="sel"><option>a</option></select>
      <div id="rich" contenteditable="true"><span id="inner">글</span></div>
      <div id="plain" contenteditable="false"></div>
      <button id="btn">버튼</button>
      <div id="bare"></div>`;
    document.body.append(host);
    const at = (id: string) => isEditableTarget(document.getElementById(id));

    expect(at('text')).toBe(true);
    // 체크박스의 Space, range 의 화살표도 그 요소의 것이다.
    expect(at('check')).toBe(true);
    expect(at('area')).toBe(true);
    expect(at('sel')).toBe(true);
    expect(at('rich')).toBe(true);
    // contenteditable 안의 자손도 입력 중이다.
    expect(at('inner')).toBe(true);

    expect(at('plain')).toBe(false);
    expect(at('btn')).toBe(false);
    expect(at('bare')).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe('shortcutBlockReason', () => {
  it('아무 문제 없으면 통과한다', () => {
    expect(fireFrom('<button>버튼</button>', { key: 't' })).toBeNull();
  });

  it('입력 중이면 막는다(R1)', () => {
    expect(fireFrom('<input />', { key: 't' })).toBe('editable');
    expect(fireFrom('<textarea></textarea>', { key: 'n' })).toBe('editable');
    expect(fireFrom('<div contenteditable="true">글</div>', { key: 'n' })).toBe('editable');
  });

  it('입력 중에도 도는 단축키는 통과시킨다(Mod+K — R1)', () => {
    expect(
      fireFrom('<input />', { key: 'k', ctrlKey: true }, { allowInEditable: true }),
    ).toBeNull();
    // 같은 자리에서 그 예외가 없는 단축키는 여전히 막힌다 — 예외가 전부를 푸는 게 아니다.
    expect(fireFrom('<input />', { key: 'k', ctrlKey: true })).toBe('editable');
  });

  it('IME 조합 중이면 막는다 — isComposing 과 keyCode 229 둘 다(R6)', () => {
    expect(fireFrom('<button>버튼</button>', { key: 't', isComposing: true })).toBe('ime');
    expect(fireFrom('<button>버튼</button>', { key: 'Process', keyCode: 229 })).toBe('ime');
    // 조합이 끝난 같은 키는 통과한다.
    expect(fireFrom('<button>버튼</button>', { key: 't' })).toBeNull();
  });

  it('입력 예외가 있는 단축키는 조합 중에도 통과한다(R1 의 Mod+K)', () => {
    // 실측: Chromium 은 조합 중 Ctrl+K 를 key:'k', isComposing:true 로 정확히 주고,
    // preventDefault 해도 조합 중 글자는 남는다. 여기서 막으면 첫 Mod+K 를 잃는다.
    expect(
      fireFrom(
        '<input />',
        { key: 'k', ctrlKey: true, isComposing: true },
        { allowInEditable: true },
      ),
    ).toBeNull();
    // keyCode 229 로만 알려 오는 조합기에서도 같다 — 예외는 조합 여부를 가리지 않는다.
    expect(
      fireFrom('<input />', { key: 'k', ctrlKey: true, keyCode: 229 }, { allowInEditable: true }),
    ).toBeNull();
    // 예외가 없는 단축키는 조합 중에 여전히 막힌다(R6).
    expect(fireFrom('<input />', { key: 'k', ctrlKey: true, isComposing: true })).toBe('ime');
  });

  it('오버레이가 떠 있으면 막는다', () => {
    expect(fireFrom('<button>버튼</button>', { key: 't' }, { isTopLayer: false })).toBe('overlay');
    expect(
      fireFrom(
        '<input />',
        { key: 'k', ctrlKey: true },
        { isTopLayer: false, allowInEditable: true },
      ),
    ).toBe('overlay');
  });

  it('가까운 처리기가 이미 먹은 키는 막는다 — 날짜가 두 칸 움직이지 않게', () => {
    expect(fireFrom('<button>버튼</button>', { key: 'ArrowLeft' }, { preventFirst: true })).toBe(
      'handled',
    );
    expect(fireFrom('<button>버튼</button>', { key: 'ArrowLeft' })).toBeNull();
  });

  it('이유의 우선순위는 handled → ime → overlay → editable 이다', () => {
    expect(
      fireFrom(
        '<input />',
        { key: 't', isComposing: true },
        { isTopLayer: false, preventFirst: true },
      ),
    ).toBe('handled');
    expect(fireFrom('<input />', { key: 't', isComposing: true }, { isTopLayer: false })).toBe(
      'ime',
    );
    expect(fireFrom('<input />', { key: 't' }, { isTopLayer: false })).toBe('overlay');
    expect(fireFrom('<input />', { key: 't' })).toBe('editable');
  });
});
