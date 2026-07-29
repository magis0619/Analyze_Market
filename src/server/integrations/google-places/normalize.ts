import type { NormalizedCollection } from '../types';
import type { PlacesNearbyResponse } from './types';

/**
 * Places Nearby Search レスポンスを共通 Observation へ正規化する。
 * real / mock 両方がこの関数を通る。
 */
export function normalizeNearbyResponse(raw: PlacesNearbyResponse): NormalizedCollection {
  const collection: NormalizedCollection = {
    entities: [],
    observations: [],
    // billableCalls はアダプタ契約 (types.ts) の必須キー。
    // 実際に外部APIを叩いたアダプタが normalize 後に上書きする。
    costMetadata: {
      billableCalls: 0,
      nearbySearchRequests: 1,
      placesReturned: raw.places?.length ?? 0,
    },
  };

  for (const place of raw.places ?? []) {
    if (!place.id || !place.displayName?.text) continue;
    collection.entities.push({
      entityType: 'competitor',
      externalSource: 'google_places',
      externalId: place.id,
      name: place.displayName.text,
      latitude: place.location?.latitude ?? null,
      longitude: place.location?.longitude ?? null,
      attributes: {
        types: place.types ?? [],
        formattedAddress: place.formattedAddress ?? null,
      },
    });

    if (typeof place.rating === 'number') {
      collection.observations.push({
        externalSource: 'google_places',
        externalId: place.id,
        source: 'google_places',
        metricKey: 'rating',
        numericValue: place.rating,
      });
    }
    if (typeof place.userRatingCount === 'number') {
      collection.observations.push({
        externalSource: 'google_places',
        externalId: place.id,
        source: 'google_places',
        metricKey: 'review_count',
        numericValue: place.userRatingCount,
      });
    }
    collection.observations.push({
      externalSource: 'google_places',
      externalId: place.id,
      source: 'google_places',
      metricKey: 'business_status',
      textValue: place.businessStatus ?? 'OPERATIONAL',
    });
  }

  return collection;
}
