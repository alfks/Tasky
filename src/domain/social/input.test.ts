import {
  isHappenedOn,
  isInviteToken,
  isSocialId,
  parseNickname,
  parsePageInput,
  parsePostInput,
} from '@/domain/social/input';
import { ACTOR_A } from '@/domain/social/social-vectors';
describe('R1/R3 공유 입력 whitelist', () => {
  it('NFC·Unicode code point 기준 별명과 제어문자 거절', () => {
    expect(parseNickname(' 가 ')).toEqual({ ok: true, value: '가' });
    expect(parseNickname('😀'.repeat(20)).ok).toBe(true);
    expect(parseNickname('😀'.repeat(21)).ok).toBe(false);
    expect(parseNickname('a\n').ok).toBe(false);
    expect(parseNickname('a\u202e').ok).toBe(false);
    for (const control of ['\u061c', '\u200e', '\u200f', '\u2028', '\u2029']) {
      expect(parseNickname(`a${control}`).ok).toBe(false);
      expect(parsePostInput({ text: `a${control}`, happenedOn: '2000-02-29' }).ok).toBe(false);
    }
    expect(parseNickname('👨‍👩‍👧').ok).toBe(true);
  });

  it('공유 명령은 text·happenedOn만 받고 원본 참조를 거절', () => {
    expect(parsePostInput({ text: ' 완료 ', happenedOn: '2000-02-29' })).toEqual({
      ok: true,
      value: { text: '완료', happenedOn: '2000-02-29' },
    });
    expect(parsePostInput({ text: '완료', happenedOn: '2000-02-29', sourceId: ACTOR_A }).ok).toBe(
      false,
    );
    expect(parsePostInput({ text: ' ', happenedOn: '2000-02-29' }).ok).toBe(false);
    expect(parsePostInput({ text: 'a'.repeat(281), happenedOn: '2000-02-29' }).ok).toBe(false);
    expect(parsePostInput({ text: 'a\nb', happenedOn: '2000-02-29' }).ok).toBe(false);
  });

  it('날짜·opaque id·페이지 상한을 검증', () => {
    expect(isHappenedOn('2000-02-29')).toBe(true);
    expect(isHappenedOn('2001-02-29')).toBe(false);
    expect(isHappenedOn('1970-01-01')).toBe(true);
    expect(isHappenedOn('2099-12-31')).toBe(true);
    expect(isHappenedOn('2100-01-01')).toBe(false);
    expect(isSocialId(ACTOR_A)).toBe(true);
    expect(isSocialId('google-sub')).toBe(false);
    expect(isInviteToken('a'.repeat(64))).toBe(true);
    expect(isInviteToken('a'.repeat(63))).toBe(false);
    expect(parsePageInput({}).ok).toBe(true);
    expect(parsePageInput({ limit: 50 }).ok).toBe(true);
    expect(parsePageInput({ limit: 51 }).ok).toBe(false);
    expect(parsePageInput({ cursor: 'signed', actor: ACTOR_A }).ok).toBe(false);
  });
});
