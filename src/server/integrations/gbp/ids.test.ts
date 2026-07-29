import { describe, expect, it } from 'vitest';
import { GbpIdFormatError, parseLocationName, toV4LocationPath } from './ids';

describe('parseLocationName (v1 → id)', () => {
  it('"locations/456" から "456" を取り出す', () => {
    expect(parseLocationName('locations/456')).toBe('456');
  });

  it('英数字混じりのIDも扱える', () => {
    expect(parseLocationName('locations/abc-123_XYZ')).toBe('abc-123_XYZ');
  });

  it('v4形式を渡したら弾く (取り違えの防止)', () => {
    expect(() => parseLocationName('accounts/123/locations/456')).toThrow(GbpIdFormatError);
  });

  it('接頭辞なしを弾く', () => {
    expect(() => parseLocationName('456')).toThrow(GbpIdFormatError);
  });

  it('空文字を弾く', () => {
    expect(() => parseLocationName('')).toThrow(GbpIdFormatError);
  });
});

describe('toV4LocationPath (account + id → v4パス)', () => {
  it('"accounts/123/locations/456" を組み立てる', () => {
    expect(toV4LocationPath('accounts/123', '456')).toBe('accounts/123/locations/456');
  });

  it('account name 形式でなければ弾く', () => {
    expect(() => toV4LocationPath('123', '456')).toThrow(GbpIdFormatError);
    expect(() => toV4LocationPath('accounts/123/locations/456', '789')).toThrow(GbpIdFormatError);
  });

  it('location id にスラッシュが混じっていたら弾く (v1形式の渡し間違い)', () => {
    expect(() => toV4LocationPath('accounts/123', 'locations/456')).toThrow(GbpIdFormatError);
  });

  it('空の location id を弾く', () => {
    expect(() => toV4LocationPath('accounts/123', '')).toThrow(GbpIdFormatError);
  });

  it('v1レスポンスからの一連の流れが通る', () => {
    const v1Name = 'locations/987654321';
    expect(toV4LocationPath('accounts/111', parseLocationName(v1Name))).toBe(
      'accounts/111/locations/987654321',
    );
  });
});
