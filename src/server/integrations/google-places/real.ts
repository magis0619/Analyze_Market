import type { DataSourceAdapter, NormalizedCollection } from '../types';
import { normalizeNearbyResponse } from './normalize';
import type { NearbySearchInput, PlacesNearbyResponse } from './types';

const NEARBY_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchNearby';

// FieldMask は課金に直結するためコード定数で管理する (仕様04)
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.types',
  'places.rating',
  'places.userRatingCount',
  'places.regularOpeningHours',
  'places.businessStatus',
  'places.formattedAddress',
].join(',');

const INCLUDED_TYPES = ['hair_salon', 'beauty_salon'];
const MAX_RESULT_COUNT = 20;

export class RealGooglePlacesAdapter
  implements DataSourceAdapter<NearbySearchInput, PlacesNearbyResponse>
{
  readonly sourceName = 'google_places' as const;
  readonly mode = 'real' as const;

  constructor(private readonly apiKey: string) {}

  async collect(input: NearbySearchInput): Promise<PlacesNearbyResponse> {
    const response = await fetch(NEARBY_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({
        includedTypes: INCLUDED_TYPES,
        maxResultCount: MAX_RESULT_COUNT,
        locationRestriction: {
          circle: {
            center: { latitude: input.latitude, longitude: input.longitude },
            radius: input.radiusM,
          },
        },
        languageCode: 'ja',
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Places Nearby Search failed: ${response.status} ${body.slice(0, 300)}`);
    }
    return (await response.json()) as PlacesNearbyResponse;
  }

  normalize(raw: PlacesNearbyResponse): NormalizedCollection {
    return normalizeNearbyResponse(raw);
  }
}
