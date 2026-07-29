import { describe, expect, it } from 'vitest';
import { buildMockNearbyResponse } from './mock';
import type { NearbySearchInput } from './types';

const SALON_ID = '2b7e1f60-0000-4000-8000-000000000001';
const INPUT: NearbySearchInput = { latitude: 35.6467, longitude: 139.6533, radiusM: 500 };

describe('buildMockNearbyResponse', () => {
  it('同一(salonId, runIndex)は常に同一のレスポンスを返す', () => {
    const a = buildMockNearbyResponse(SALON_ID, 0, INPUT);
    const b = buildMockNearbyResponse(SALON_ID, 0, INPUT);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('salonIdが異なると配置が変わる', () => {
    const a = buildMockNearbyResponse(SALON_ID, 0, INPUT);
    const b = buildMockNearbyResponse('other-salon', 0, INPUT);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('step0: 競合10店、全て営業中', () => {
    const result = buildMockNearbyResponse(SALON_ID, 0, INPUT);
    expect(result.places).toHaveLength(10);
    expect(result.places?.every((p) => p.businessStatus === 'OPERATIONAL')).toBe(true);
  });

  it('step1: 新規競合「Lien hair design」が出現し、評価と口コミ数が変化する', () => {
    const run0 = buildMockNearbyResponse(SALON_ID, 0, INPUT);
    const run1 = buildMockNearbyResponse(SALON_ID, 1, INPUT);
    expect(run1.places).toHaveLength(11);

    const newPlace = run1.places?.find((p) => p.displayName.text === 'Lien hair design');
    expect(newPlace).toBeDefined();
    expect(run0.places?.find((p) => p.displayName.text === 'Lien hair design')).toBeUndefined();

    // 既存店の評価変化 (+0.2)
    const before = run0.places?.[2];
    const after = run1.places?.[2];
    expect(after?.rating).toBeCloseTo((before?.rating ?? 0) + 0.2, 5);

    // 口コミ数増加 (+6)
    expect(run1.places?.[5]?.userRatingCount).toBe((run0.places?.[5]?.userRatingCount ?? 0) + 6);
  });

  it('step2: 1店が一時閉店になる', () => {
    const run2 = buildMockNearbyResponse(SALON_ID, 2, INPUT);
    const closed = run2.places?.filter((p) => p.businessStatus === 'CLOSED_TEMPORARILY');
    expect(closed).toHaveLength(1);
  });

  it('step3以降: 口コミ数は単調増加する (有界ドリフト)', () => {
    const run3 = buildMockNearbyResponse(SALON_ID, 3, INPUT);
    const run4 = buildMockNearbyResponse(SALON_ID, 4, INPUT);
    const run5 = buildMockNearbyResponse(SALON_ID, 5, INPUT);
    for (let i = 0; i < 10; i++) {
      const c3 = run3.places?.[i]?.userRatingCount ?? 0;
      const c4 = run4.places?.[i]?.userRatingCount ?? 0;
      const c5 = run5.places?.[i]?.userRatingCount ?? 0;
      expect(c4).toBeGreaterThanOrEqual(c3);
      expect(c5).toBeGreaterThanOrEqual(c4);
      expect(c5 - c3).toBeLessThanOrEqual(6);
    }
  });

  it('競合は商圏半径内に配置される', () => {
    const result = buildMockNearbyResponse(SALON_ID, 0, INPUT);
    for (const place of result.places ?? []) {
      const dLat = ((place.location.latitude - INPUT.latitude) * Math.PI) / 180;
      const dLng = ((place.location.longitude - INPUT.longitude) * Math.PI) / 180;
      const lat = (INPUT.latitude * Math.PI) / 180;
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat) ** 2 * Math.sin(dLng / 2) ** 2;
      const dist = 2 * 6371000 * Math.asin(Math.sqrt(h));
      expect(dist).toBeLessThanOrEqual(INPUT.radiusM);
    }
  });
});
