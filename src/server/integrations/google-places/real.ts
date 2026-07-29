import type { DataSourceAdapter, NormalizedCollection } from '../types';
import { HttpError, parseRetryAfter, withRetry } from '../http';
import { normalizeNearbyResponse } from './normalize';
import type { NearbySearchInput, PlacesNearbyResponse } from './types';

const NEARBY_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchNearby';

/**
 * FieldMask は課金SKUに直結するためコード定数で管理する (仕様04)。
 *
 * Nearby Search **Pro** SKU に収まるフィールドのみを指定している:
 *   id / displayName / location / types / businessStatus / formattedAddress
 * `rating` と `userRatingCount` は差分エンジンが必須とするため含める。
 *
 * 意図的に含めないもの:
 *   - `regularOpeningHours`: 呼び出し全体を Enterprise SKU に引き上げるが、
 *     値は entities.attributes に入るだけで差分エンジンもUIも読んでいない。
 * フィールドを追加する際は、それがどのSKUを意味するかを必ず確認すること。
 */
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.types',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus',
  'places.formattedAddress',
].join(',');

const INCLUDED_TYPES = ['hair_salon', 'beauty_salon'];
/** Google側の上限。searchNearby にページングはないため、これが取得件数の天井 */
const MAX_RESULT_COUNT = 20;

/**
 * 距離順を明示する。
 * 既定の POPULARITY だと上位20件の顔ぶれが呼び出しごとに入れ替わり、
 * 差分エンジンが不在を competitor_closed、出現を new_competitor と誤検知して
 * 毎回HIGH severityの偽イベントを量産する。
 */
const RANK_PREFERENCE = 'DISTANCE';

const DEFAULT_TIMEOUT_MS = 10_000;

function timeoutMs(): number {
  const configured = Number(process.env.PLACES_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}

export class RealGooglePlacesAdapter
  implements DataSourceAdapter<NearbySearchInput, PlacesNearbyResponse>
{
  readonly sourceName = 'google_places' as const;
  readonly mode = 'real' as const;

  /** withRetry の試行回数。normalize 時に costMetadata へ反映する */
  private billableCalls = 0;

  constructor(private readonly apiKey: string) {}

  async collect(input: NearbySearchInput): Promise<PlacesNearbyResponse> {
    this.billableCalls = 0;
    return withRetry(() => this.requestOnce(input), {
      onAttempt: () => {
        this.billableCalls += 1;
      },
    });
  }

  private async requestOnce(input: NearbySearchInput): Promise<PlacesNearbyResponse> {
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
        rankPreference: RANK_PREFERENCE,
        locationRestriction: {
          circle: {
            center: { latitude: input.latitude, longitude: input.longitude },
            radius: input.radiusM,
          },
        },
        languageCode: 'ja',
      }),
      signal: AbortSignal.timeout(timeoutMs()),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new HttpError(
        `Places Nearby Search failed: ${response.status} ${body.slice(0, 300)}`,
        response.status,
        parseRetryAfter(response.headers.get('retry-after')),
      );
    }
    return (await response.json()) as PlacesNearbyResponse;
  }

  normalize(raw: PlacesNearbyResponse): NormalizedCollection {
    const collection = normalizeNearbyResponse(raw);
    const returned = raw.places?.length ?? 0;
    collection.costMetadata = {
      ...collection.costMetadata,
      billableCalls: this.billableCalls,
      // 取得上限に達している = 商圏内に20件超が存在し、境界の店舗が
      // 収集ごとに出入りしうる。呼び出し側が dataNote として明示する
      resultSetSaturated: returned >= MAX_RESULT_COUNT ? 1 : 0,
    };
    return collection;
  }
}

export const __testing = { FIELD_MASK, MAX_RESULT_COUNT, RANK_PREFERENCE };
