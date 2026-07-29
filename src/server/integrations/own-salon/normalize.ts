import type { ExternalSource } from '@/server/db/schema';
import type { NormalizedCollection } from '../types';
import type { OwnSalonSnapshot } from './types';

/** 自店舗エンティティの external_id は固定値。1サロンに1つだけ存在する */
export const OWN_SALON_EXTERNAL_ID = 'self';

export function normalizeOwnSalonSnapshot(
  raw: OwnSalonSnapshot,
  source: ExternalSource,
): NormalizedCollection {
  const collection: NormalizedCollection = {
    entities: [
      {
        entityType: 'own_salon',
        externalSource: source,
        externalId: OWN_SALON_EXTERNAL_ID,
        name: '自店舗',
        latitude: null,
        longitude: null,
        attributes: {},
      },
    ],
    observations: [
      {
        externalSource: source,
        externalId: OWN_SALON_EXTERNAL_ID,
        metricKey: 'rating',
        numericValue: raw.rating,
      },
      {
        externalSource: source,
        externalId: OWN_SALON_EXTERNAL_ID,
        metricKey: 'review_count',
        numericValue: raw.reviewCount,
      },
    ],
    costMetadata: { reviewsReturned: raw.reviews.length },
  };

  for (const review of raw.reviews) {
    collection.observations.push({
      externalSource: source,
      externalId: OWN_SALON_EXTERNAL_ID,
      metricKey: 'review',
      numericValue: review.star,
      jsonValue: { ...review },
      sourceUpdatedAt: new Date(review.createdAt),
    });
  }

  return collection;
}
