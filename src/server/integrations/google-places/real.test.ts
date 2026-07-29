import { afterEach, describe, expect, it, vi } from 'vitest';
import { RealGooglePlacesAdapter, __testing } from './real';
import { bodyOf, headerOf, installFetchMock } from '../__test__/fetch-mock';
import type { NearbySearchInput, Place } from './types';

const INPUT: NearbySearchInput = { latitude: 35.6467, longitude: 139.6533, radiusM: 500 };

function place(id: string): Place {
  return {
    id,
    displayName: { text: `salon ${id}`, languageCode: 'ja' },
    location: { latitude: 35.647, longitude: 139.653 },
    rating: 4.2,
    userRatingCount: 30,
    businessStatus: 'OPERATIONAL',
  };
}

function okBody(count: number) {
  return { places: Array.from({ length: count }, (_, i) => place(`p${i}`)) };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('RealGooglePlacesAdapter リクエスト内容', () => {
  it('FieldMask が定数と一致し、regularOpeningHours を含まない (Enterprise SKU 回避)', async () => {
    const { calls } = installFetchMock([{ status: 200, body: okBody(3) }]);
    await new RealGooglePlacesAdapter('test-key').collect(INPUT);

    const mask = headerOf(calls[0]!, 'X-Goog-FieldMask');
    expect(mask).toBe(__testing.FIELD_MASK);
    expect(mask).not.toContain('regularOpeningHours');
    expect(mask).toContain('places.rating');
    expect(mask).toContain('places.userRatingCount');
  });

  it('rankPreference は DISTANCE (偽の new_competitor / competitor_closed を防ぐ)', async () => {
    const { calls } = installFetchMock([{ status: 200, body: okBody(3) }]);
    await new RealGooglePlacesAdapter('test-key').collect(INPUT);

    expect(bodyOf(calls[0]!).rankPreference).toBe('DISTANCE');
  });

  it('リクエストボディが仕様どおり', async () => {
    const { calls } = installFetchMock([{ status: 200, body: okBody(1) }]);
    await new RealGooglePlacesAdapter('test-key').collect(INPUT);

    const body = bodyOf(calls[0]!);
    expect(body.maxResultCount).toBe(20);
    expect(body.includedTypes).toEqual(['hair_salon', 'beauty_salon']);
    expect(body.languageCode).toBe('ja');
    expect(body.locationRestriction).toEqual({
      circle: {
        center: { latitude: INPUT.latitude, longitude: INPUT.longitude },
        radius: INPUT.radiusM,
      },
    });
    expect(headerOf(calls[0]!, 'X-Goog-Api-Key')).toBe('test-key');
  });

  it('AbortSignal (timeout) が設定される', async () => {
    const { calls } = installFetchMock([{ status: 200, body: okBody(1) }]);
    await new RealGooglePlacesAdapter('test-key').collect(INPUT);

    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('RealGooglePlacesAdapter エラー処理とリトライ', () => {
  it('500 は再試行し、最終的に throw する (本文は300字で切り詰め)', async () => {
    const longBody = { error: 'x'.repeat(1000) };
    const { fn } = installFetchMock([{ status: 500, body: longBody }]);
    const adapter = new RealGooglePlacesAdapter('test-key');

    await expect(adapter.collect(INPUT)).rejects.toThrow(/500/);
    // 初回 + リトライ2回
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('429 のあと 200 なら解決し、billableCalls に試行回数が入る', async () => {
    const { fn } = installFetchMock([
      { status: 429, body: { error: 'rate limited' }, headers: { 'retry-after': '0' } },
      { status: 200, body: okBody(2) },
    ]);
    const adapter = new RealGooglePlacesAdapter('test-key');

    const raw = await adapter.collect(INPUT);
    expect(raw.places).toHaveLength(2);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(adapter.normalize(raw).costMetadata.billableCalls).toBe(2);
  });

  it('400 は再試行せず即失敗する (誤リクエストの再送で課金しない)', async () => {
    const { fn } = installFetchMock([{ status: 400, body: { error: 'bad request' } }]);
    const adapter = new RealGooglePlacesAdapter('test-key');

    await expect(adapter.collect(INPUT)).rejects.toThrow(/400/);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('RealGooglePlacesAdapter costMetadata', () => {
  it('取得上限に達したら resultSetSaturated=1', async () => {
    installFetchMock([{ status: 200, body: okBody(20) }]);
    const adapter = new RealGooglePlacesAdapter('test-key');
    const raw = await adapter.collect(INPUT);

    expect(adapter.normalize(raw).costMetadata.resultSetSaturated).toBe(1);
  });

  it('上限未満なら resultSetSaturated=0、billableCalls=1', async () => {
    installFetchMock([{ status: 200, body: okBody(5) }]);
    const adapter = new RealGooglePlacesAdapter('test-key');
    const raw = await adapter.collect(INPUT);

    const cost = adapter.normalize(raw).costMetadata;
    expect(cost.resultSetSaturated).toBe(0);
    expect(cost.billableCalls).toBe(1);
    expect(cost.placesReturned).toBe(5);
  });
});
