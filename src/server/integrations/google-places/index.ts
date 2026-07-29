import type { DataSourceAdapter } from '../types';
import { getPlacesMode } from '../modes';
import { MockGooglePlacesAdapter } from './mock';
import { RealGooglePlacesAdapter } from './real';
import type { NearbySearchInput, PlacesNearbyResponse } from './types';

export type GooglePlacesAdapter = DataSourceAdapter<NearbySearchInput, PlacesNearbyResponse>;

export interface GooglePlacesAdapterContext {
  salonId: string;
  /**
   * モックのシナリオ進行に使う収集回数。
   * 実APIでは参照されないため、呼び出し側は mock 時のみ算出すればよい。
   */
  runIndex: number;
}

/** GOOGLE_MAPS_API_KEY があれば実API、なければモックを返す */
export function createGooglePlacesAdapter(ctx: GooglePlacesAdapterContext): GooglePlacesAdapter {
  if (getPlacesMode() === 'real') {
    return new RealGooglePlacesAdapter(process.env.GOOGLE_MAPS_API_KEY as string);
  }
  return new MockGooglePlacesAdapter(ctx.salonId, ctx.runIndex);
}
