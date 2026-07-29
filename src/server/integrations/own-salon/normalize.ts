import type { ExternalSource } from '@/server/db/schema';
import type { NormalizedCollection } from '../types';
import type { OwnSalonSnapshot } from './types';

/** 自店舗エンティティの参照キー。1サロンに1つだけ存在する */
export const OWN_SALON_ENTITY_SOURCE: ExternalSource = 'own_salon';
export const OWN_SALON_EXTERNAL_ID = 'self';

/**
 * 自店舗スナップショットを共通 Observation に正規化する。
 * エンティティは常に ('own_salon', 'self')、観測の source は実データ源
 * ('own_salon_mock' または 'manual') を記録する。
 */
export function normalizeOwnSalonSnapshot(
  raw: OwnSalonSnapshot,
  source: ExternalSource,
): NormalizedCollection {
  const collection: NormalizedCollection = {
    entities: [
      {
        entityType: 'own_salon',
        externalSource: OWN_SALON_ENTITY_SOURCE,
        externalId: OWN_SALON_EXTERNAL_ID,
        name: '自店舗',
        latitude: null,
        longitude: null,
        attributes: {},
      },
    ],
    observations: [
      {
        externalSource: OWN_SALON_ENTITY_SOURCE,
        externalId: OWN_SALON_EXTERNAL_ID,
        source,
        metricKey: 'rating',
        numericValue: raw.rating,
      },
      {
        externalSource: OWN_SALON_ENTITY_SOURCE,
        externalId: OWN_SALON_EXTERNAL_ID,
        source,
        metricKey: 'review_count',
        numericValue: raw.reviewCount,
      },
    ],
    costMetadata: { reviewsReturned: raw.reviews.length },
  };

  for (const review of raw.reviews) {
    collection.observations.push({
      externalSource: OWN_SALON_ENTITY_SOURCE,
      externalId: OWN_SALON_EXTERNAL_ID,
      source,
      metricKey: 'review',
      numericValue: review.star,
      jsonValue: { ...review },
      sourceUpdatedAt: new Date(review.createdAt),
    });
  }

  return collection;
}
