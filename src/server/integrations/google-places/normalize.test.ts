import { describe, expect, it } from 'vitest';
import { normalizeNearbyResponse } from './normalize';
import type { PlacesNearbyResponse } from './types';
import fixtureStep0 from './fixtures/nearby-search.step0.json';

describe('normalizeNearbyResponse', () => {
  const fixture = fixtureStep0 as PlacesNearbyResponse;

  it('fixtureの各placeをcompetitorエンティティに正規化する', () => {
    const result = normalizeNearbyResponse(fixture);
    expect(result.entities).toHaveLength(3);
    const first = result.entities[0];
    expect(first).toMatchObject({
      entityType: 'competitor',
      externalSource: 'google_places',
      externalId: 'ChIJxxxxxxxxxxxxxxxxxxx1',
      name: 'hair salon TESTA',
      latitude: 35.6466,
      longitude: 139.6522,
    });
    expect(first?.attributes.formattedAddress).toContain('三軒茶屋');
  });

  it('rating/review_count/business_statusの観測を生成する', () => {
    const result = normalizeNearbyResponse(fixture);
    const obs1 = result.observations.filter((o) => o.externalId === 'ChIJxxxxxxxxxxxxxxxxxxx1');
    expect(obs1.find((o) => o.metricKey === 'rating')?.numericValue).toBe(4.3);
    expect(obs1.find((o) => o.metricKey === 'review_count')?.numericValue).toBe(120);
    expect(obs1.find((o) => o.metricKey === 'business_status')?.textValue).toBe('OPERATIONAL');
  });

  it('rating欠落を許容する (観測を生成しない)', () => {
    const result = normalizeNearbyResponse(fixture);
    const obs2 = result.observations.filter((o) => o.externalId === 'ChIJxxxxxxxxxxxxxxxxxxx2');
    expect(obs2.find((o) => o.metricKey === 'rating')).toBeUndefined();
    expect(obs2.find((o) => o.metricKey === 'business_status')?.textValue).toBe('OPERATIONAL');
  });

  it('閉店ステータスを保持する', () => {
    const result = normalizeNearbyResponse(fixture);
    const obs3 = result.observations.filter((o) => o.externalId === 'ChIJxxxxxxxxxxxxxxxxxxx3');
    expect(obs3.find((o) => o.metricKey === 'business_status')?.textValue).toBe(
      'CLOSED_TEMPORARILY',
    );
  });

  it('空レスポンスを許容する', () => {
    const result = normalizeNearbyResponse({});
    expect(result.entities).toHaveLength(0);
    expect(result.observations).toHaveLength(0);
  });
});
