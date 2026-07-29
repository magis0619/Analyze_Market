import type { DataSourceAdapter } from '../types';
import { MockGooglePlacesAdapter } from './mock';
import { RealGooglePlacesAdapter } from './real';
import type { NearbySearchInput, PlacesNearbyResponse } from './types';

export type GooglePlacesAdapter = DataSourceAdapter<NearbySearchInput, PlacesNearbyResponse>;

/**
 * GOOGLE_MAPS_API_KEY があれば実API、なければモックを返す。
 * salonId / runIndex はモックのシナリオ進行に使う (実APIでは不要)。
 */
export function getGooglePlacesAdapter(salonId: string, runIndex: number): GooglePlacesAdapter {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (apiKey) return new RealGooglePlacesAdapter(apiKey);
  return new MockGooglePlacesAdapter(salonId, runIndex);
}
