import 'server-only';
import { listAccounts, listLocations, type GbpCallStats } from './client';
import { isGbpFixtureMode } from './adapter';
import { GbpAuthRevokedError, refreshAccessToken } from './oauth';
import { markGbpRevoked, saveGbpCredentials } from './token-store';
import type { GbpCredentials } from './types';

export interface SelectableLocation {
  accountName: string;
  /** v1形式 "locations/456" のまま。IDの切り出しはサーバアクションで行う */
  v1LocationName: string;
  title: string;
  address: string;
}

/** API承認待ちの間も店舗選択UIを動かせるようにする */
const FIXTURE_LOCATIONS: SelectableLocation[] = [
  {
    accountName: 'accounts/000000000000000000000',
    v1LocationName: 'locations/000000000000000001',
    title: 'ヘアサロン ルミエール 三軒茶屋店 (フィクスチャ)',
    address: '東京都世田谷区太子堂2-99-9',
  },
  {
    accountName: 'accounts/000000000000000000000',
    v1LocationName: 'locations/000000000000000002',
    title: 'ヘアサロン ルミエール 下北沢店 (フィクスチャ)',
    address: '東京都世田谷区北沢2-88-8',
  },
];

function formatAddress(location: {
  storefrontAddress?: { addressLines?: string[]; locality?: string; administrativeArea?: string };
}): string {
  const address = location.storefrontAddress;
  if (!address) return '';
  return [address.administrativeArea, address.locality, ...(address.addressLines ?? [])]
    .filter(Boolean)
    .join(' ');
}

/** 期限が近ければ更新して保存し、有効なアクセストークンを返す */
async function freshAccessToken(
  salonId: string,
  credentials: GbpCredentials,
  stats: GbpCallStats,
): Promise<string> {
  const expiresAt = Date.parse(credentials.accessTokenExpiresAt);
  if (Number.isFinite(expiresAt) && expiresAt - Date.now() > 120_000) {
    return credentials.accessToken;
  }
  try {
    const refreshed = await refreshAccessToken(credentials.refreshToken);
    stats.billableCalls += 1;
    await saveGbpCredentials(salonId, {
      ...credentials,
      accessToken: refreshed.access_token,
      accessTokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      refreshToken: refreshed.refresh_token ?? credentials.refreshToken,
    });
    return refreshed.access_token;
  } catch (error) {
    if (error instanceof GbpAuthRevokedError) await markGbpRevoked(salonId);
    throw error;
  }
}

/**
 * 連携アカウント配下の全店舗を列挙する (店舗選択画面用)。
 * GBP_FIXTURE_MODE=1 のときは固定の候補を返し、API承認待ちでも選択UIを検証できる。
 */
export async function listSelectableLocations(
  salonId: string,
  credentials: GbpCredentials,
): Promise<SelectableLocation[]> {
  if (isGbpFixtureMode()) return FIXTURE_LOCATIONS;

  const stats: GbpCallStats = { billableCalls: 0 };
  const accessToken = await freshAccessToken(salonId, credentials, stats);

  const accountsResponse = await listAccounts(accessToken, stats);
  const results: SelectableLocation[] = [];

  for (const account of accountsResponse.accounts ?? []) {
    const locationsResponse = await listLocations(accessToken, account.name, stats);
    for (const location of locationsResponse.locations ?? []) {
      results.push({
        accountName: account.name,
        v1LocationName: location.name,
        title: location.title ?? location.name,
        address: formatAddress(location),
      });
    }
  }
  return results;
}
