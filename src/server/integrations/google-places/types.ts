/** Google Places API (New) のワイヤ形式。ドメイン型はここから normalize で変換する */

export interface PlaceDisplayName {
  text: string;
  languageCode?: string;
}

export interface PlaceLocation {
  latitude: number;
  longitude: number;
}

export interface PlaceOpeningHours {
  weekdayDescriptions?: string[];
}

export type PlaceBusinessStatus =
  | 'OPERATIONAL'
  | 'CLOSED_TEMPORARILY'
  | 'CLOSED_PERMANENTLY'
  | 'BUSINESS_STATUS_UNSPECIFIED';

export interface Place {
  id: string;
  displayName: PlaceDisplayName;
  location: PlaceLocation;
  types?: string[];
  rating?: number;
  userRatingCount?: number;
  regularOpeningHours?: PlaceOpeningHours;
  businessStatus?: PlaceBusinessStatus;
  formattedAddress?: string;
}

export interface PlacesNearbyResponse {
  places?: Place[];
}

export interface NearbySearchInput {
  latitude: number;
  longitude: number;
  radiusM: number;
}
