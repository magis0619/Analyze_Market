/**
 * Google Business Profile API のワイヤ形式。
 *
 * 重要: 口コミと返信状態を返すのは **レガシーの My Business API v4** のみ。
 * 新しい Account Management / Business Information API は口コミを返さない。
 */

/** Account Management API v1: GET /v1/accounts */
export interface GbpAccount {
  /** "accounts/123" 形式 */
  name: string;
  accountName?: string;
  type?: string;
}

export interface GbpAccountsResponse {
  accounts?: GbpAccount[];
  nextPageToken?: string;
}

/** Business Information API v1: GET /v1/{parent}/locations */
export interface GbpLocation {
  /** "locations/456" 形式 (v4 の "accounts/123/locations/456" とは異なる) */
  name: string;
  title?: string;
  storefrontAddress?: {
    addressLines?: string[];
    locality?: string;
    administrativeArea?: string;
  };
}

export interface GbpLocationsResponse {
  locations?: GbpLocation[];
  nextPageToken?: string;
}

export type GbpStarRating =
  | 'STAR_RATING_UNSPECIFIED'
  | 'ONE'
  | 'TWO'
  | 'THREE'
  | 'FOUR'
  | 'FIVE';

/** My Business API v4: GET /v4/accounts/{a}/locations/{l}/reviews */
export interface GbpReview {
  reviewId: string;
  name?: string;
  reviewer?: { displayName?: string; isAnonymous?: boolean };
  starRating: GbpStarRating;
  /** 星のみの口コミも存在するため省略されうる */
  comment?: string;
  createTime: string;
  updateTime?: string;
  /** 存在しない = 未返信 */
  reviewReply?: { comment?: string; updateTime?: string };
}

export interface GbpReviewsResponse {
  reviews?: GbpReview[];
  /** 店舗全体の平均評価 (このページ内の平均ではない) */
  averageRating?: number;
  /** 店舗全体の口コミ総数 */
  totalReviewCount?: number;
  nextPageToken?: string;
}

/** integrations.encryptedCredentials に暗号化して保存する内容 */
export interface GbpCredentials {
  refreshToken: string;
  accessToken: string;
  /** ISO8601 */
  accessTokenExpiresAt: string;
  scope?: string;
  /** "accounts/123"。店舗選択が済むまで null */
  accountName: string | null;
  /** "456" (v1の "locations/456" から取り出した部分)。店舗選択が済むまで null */
  locationId: string | null;
  locationTitle: string | null;
}

export interface GbpTokenResponse {
  access_token: string;
  expires_in: number;
  /** リフレッシュ時のレスポンスには通常含まれない */
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}
