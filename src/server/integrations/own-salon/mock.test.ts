import { describe, expect, it } from 'vitest';
import { buildMockOwnSalonSnapshot } from './mock';
import { normalizeOwnSalonSnapshot } from './normalize';

const SALON_ID = '2b7e1f60-0000-4000-8000-000000000001';

describe('buildMockOwnSalonSnapshot', () => {
  it('決定論的である', () => {
    const a = buildMockOwnSalonSnapshot(SALON_ID, 1);
    const b = buildMockOwnSalonSnapshot(SALON_ID, 1);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('step0: 評価4.2 / 全口コミ返信済み', () => {
    const snap = buildMockOwnSalonSnapshot(SALON_ID, 0);
    expect(snap.rating).toBe(4.2);
    expect(snap.reviews.every((r) => r.replied)).toBe(true);
  });

  it('step1: ★2の未返信口コミが届く', () => {
    const snap = buildMockOwnSalonSnapshot(SALON_ID, 1);
    const low = snap.reviews.find((r) => r.star <= 2);
    expect(low).toBeDefined();
    expect(low?.replied).toBe(false);
    expect(snap.rating).toBe(4.2);
  });

  it('step2: 評価が4.1に低下する', () => {
    const snap = buildMockOwnSalonSnapshot(SALON_ID, 2);
    expect(snap.rating).toBe(4.1);
  });

  it('step3以降: 口コミ数は単調増加する', () => {
    const c3 = buildMockOwnSalonSnapshot(SALON_ID, 3).reviewCount;
    const c5 = buildMockOwnSalonSnapshot(SALON_ID, 5).reviewCount;
    expect(c5).toBeGreaterThanOrEqual(c3);
  });
});

describe('normalizeOwnSalonSnapshot', () => {
  it('rating/review_count/review観測を生成する', () => {
    const snap = buildMockOwnSalonSnapshot(SALON_ID, 1);
    const result = normalizeOwnSalonSnapshot(snap, 'own_salon_mock');
    expect(result.entities[0]?.entityType).toBe('own_salon');
    expect(result.observations.find((o) => o.metricKey === 'rating')?.numericValue).toBe(4.2);
    const reviews = result.observations.filter((o) => o.metricKey === 'review');
    expect(reviews).toHaveLength(snap.reviews.length);
    expect(reviews.every((o) => typeof o.jsonValue?.reviewId === 'string')).toBe(true);
  });
});
