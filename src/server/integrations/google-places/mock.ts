import { fnv1a, mulberry32 } from '../rng';
import type { DataSourceAdapter, NormalizedCollection } from '../types';
import { normalizeNearbyResponse } from './normalize';
import type { NearbySearchInput, Place, PlacesNearbyResponse } from './types';

/**
 * Google Places のモック。APIキーなしでシステム全体を動かすための決定論的デモデータ。
 *
 * シナリオステップ (runIndex = そのサロンで過去に成功した収集回数):
 * - step 0: 架空の競合10店
 * - step 1: 新規競合「Lien hair design」出現 / 評価+0.2 / 口コミ+6 → 差分エンジンの検知対象
 * - step 2: 1店が一時閉店 (CLOSED_TEMPORARILY)
 * - step 3+: 口コミ数が少しずつ増える有界ドリフト (累積和なので後退しない)
 *
 * 同一 (salonId, runIndex) は常に同一レスポンスを返す。
 */

const BASE_NAMES: readonly { name: string; rating: number; reviews: number }[] = [
  { name: 'hair make Bloom', rating: 4.1, reviews: 86 },
  { name: 'Salon de Clair', rating: 3.8, reviews: 42 },
  { name: 'LUXE hair 三軒茶屋', rating: 4.1, reviews: 128 },
  { name: 'cut house さくら', rating: 3.5, reviews: 23 },
  { name: 'Hair Studio K', rating: 4.4, reviews: 201 },
  { name: 'barber shop 政', rating: 4.6, reviews: 67 },
  { name: 'atelier flico', rating: 4.0, reviews: 54 },
  { name: 'Regalo hair design', rating: 3.9, reviews: 31 },
  { name: 'nico hair', rating: 4.3, reviews: 95 },
  { name: "men's grooming BASE", rating: 4.2, reviews: 48 },
];

function placeAround(
  rng: () => number,
  center: NearbySearchInput,
): { latitude: number; longitude: number } {
  // 半径の 15%〜90% の位置に決定論的に配置する
  const distance = center.radiusM * (0.15 + 0.75 * rng());
  const angle = rng() * 2 * Math.PI;
  const dLat = ((distance * Math.cos(angle)) / 6371000) * (180 / Math.PI);
  const dLng =
    ((distance * Math.sin(angle)) /
      (6371000 * Math.cos((center.latitude * Math.PI) / 180))) *
    (180 / Math.PI);
  return {
    latitude: Number((center.latitude + dLat).toFixed(6)),
    longitude: Number((center.longitude + dLng).toFixed(6)),
  };
}

/** step3以降の口コミ数ドリフト。run k=3..runIndex の増分の累積和なので単調増加 */
function reviewDrift(seed: number, runIndex: number, placeIndex: number): number {
  let total = 0;
  for (let k = 3; k <= runIndex; k++) {
    const rng = mulberry32((seed ^ Math.imul(k, 2654435761) ^ placeIndex) >>> 0);
    total += Math.floor(rng() * 3);
  }
  return total;
}

export function buildMockNearbyResponse(
  salonId: string,
  runIndex: number,
  input: NearbySearchInput,
): PlacesNearbyResponse {
  const seed = fnv1a(salonId);
  const rng = mulberry32(seed);
  const step = Math.min(runIndex, 3);

  const places: Place[] = BASE_NAMES.map((base, i) => {
    const location = placeAround(rng, input);
    return {
      id: `mock-place-${seed.toString(16)}-${i}`,
      displayName: { text: base.name, languageCode: 'ja' },
      location,
      types: ['hair_salon', 'beauty_salon'],
      rating: base.rating,
      userRatingCount: base.reviews + reviewDrift(seed, runIndex, i),
      businessStatus: 'OPERATIONAL',
      formattedAddress: '東京都世田谷区 (デモデータ)',
      regularOpeningHours: { weekdayDescriptions: ['月〜土 10:00〜19:00', '日 10:00〜18:00'] },
    };
  });

  if (step >= 1) {
    // 新規競合の出現 + 既存店の評価/口コミ変化
    const newLocation = placeAround(mulberry32(seed ^ 0x9e3779b9), input);
    places.push({
      id: `mock-place-${seed.toString(16)}-new`,
      displayName: { text: 'Lien hair design', languageCode: 'ja' },
      location: newLocation,
      types: ['hair_salon'],
      rating: 4.9,
      userRatingCount: 3 + reviewDrift(seed, runIndex, 99),
      businessStatus: 'OPERATIONAL',
      formattedAddress: '東京都世田谷区 (デモデータ)',
    });
    const p2 = places[2];
    if (p2?.rating) p2.rating = Number((p2.rating + 0.2).toFixed(1));
    const p5 = places[5];
    if (p5?.userRatingCount !== undefined) p5.userRatingCount += 6;
  }

  if (step >= 2) {
    const p7 = places[7];
    if (p7) p7.businessStatus = 'CLOSED_TEMPORARILY';
  }

  return { places };
}

export class MockGooglePlacesAdapter
  implements DataSourceAdapter<NearbySearchInput, PlacesNearbyResponse>
{
  readonly sourceName = 'google_places' as const;
  readonly mode = 'mock' as const;

  constructor(
    private readonly salonId: string,
    private readonly runIndex: number,
  ) {}

  async collect(input: NearbySearchInput): Promise<PlacesNearbyResponse> {
    return buildMockNearbyResponse(this.salonId, this.runIndex, input);
  }

  normalize(raw: PlacesNearbyResponse): NormalizedCollection {
    const collection = normalizeNearbyResponse(raw);
    collection.costMetadata = { ...collection.costMetadata, nearbySearchRequests: 0, mock: 1 };
    return collection;
  }
}
