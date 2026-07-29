import 'server-only';
import { HttpError, parseRetryAfter, withRetry } from '../http';
import { toV4LocationPath } from './ids';
import type {
  GbpAccountsResponse,
  GbpLocationsResponse,
  GbpReviewsResponse,
} from './types';

const ACCOUNT_MANAGEMENT_BASE = 'https://mybusinessaccountmanagement.googleapis.com/v1';
const BUSINESS_INFORMATION_BASE = 'https://mybusinessbusinessinformation.googleapis.com/v1';
/** 口コミと返信状態はレガシー v4 のみが返す */
const MY_BUSINESS_V4_BASE = 'https://mybusiness.googleapis.com/v4';

const TIMEOUT_MS = 15_000;
const REVIEW_PAGE_SIZE = 50;

export interface GbpCallStats {
  billableCalls: number;
}

async function getJson<T>(url: string, accessToken: string, stats: GbpCallStats): Promise<T> {
  return withRetry(
    async () => {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new HttpError(
          `GBP API failed: ${response.status} ${body.slice(0, 300)}`,
          response.status,
          parseRetryAfter(response.headers.get('retry-after')),
        );
      }
      return (await response.json()) as T;
    },
    {
      onAttempt: () => {
        stats.billableCalls += 1;
      },
    },
  );
}

export async function listAccounts(
  accessToken: string,
  stats: GbpCallStats,
): Promise<GbpAccountsResponse> {
  return getJson<GbpAccountsResponse>(`${ACCOUNT_MANAGEMENT_BASE}/accounts`, accessToken, stats);
}

export async function listLocations(
  accessToken: string,
  accountName: string,
  stats: GbpCallStats,
): Promise<GbpLocationsResponse> {
  // readMask は必須。指定しないと 400 になる
  const params = new URLSearchParams({
    readMask: 'name,title,storefrontAddress',
    pageSize: '100',
  });
  return getJson<GbpLocationsResponse>(
    `${BUSINESS_INFORMATION_BASE}/${accountName}/locations?${params.toString()}`,
    accessToken,
    stats,
  );
}

/**
 * 口コミを1ページだけ取得する (v4)。
 * totalReviewCount / averageRating は店舗全体の値なのでKPIは正しく、
 * 口コミの「窓」だけが有界になる。差分エンジンは新規観測にしか反応しないため十分。
 */
export async function listReviews(
  accessToken: string,
  accountName: string,
  locationId: string,
  stats: GbpCallStats,
): Promise<GbpReviewsResponse> {
  const path = toV4LocationPath(accountName, locationId);
  const params = new URLSearchParams({
    pageSize: String(REVIEW_PAGE_SIZE),
    orderBy: 'updateTime desc',
  });
  return getJson<GbpReviewsResponse>(
    `${MY_BUSINESS_V4_BASE}/${path}/reviews?${params.toString()}`,
    accessToken,
    stats,
  );
}
