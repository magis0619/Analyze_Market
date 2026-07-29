import 'server-only';
import { getGbpRedirectUri } from '@/server/config/app-url';
import { HttpError, parseRetryAfter, withRetry } from '../http';
import type { GbpTokenResponse } from './types';

/** business.manage 1つで Account Management / Business Information / v4 すべてを賄う */
export const GBP_SCOPE = 'https://www.googleapis.com/auth/business.manage';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

/** リフレッシュトークンが失効・取り消された */
export class GbpAuthRevokedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GbpAuthRevokedError';
  }
}

export class GbpConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GbpConfigError';
  }
}

function clientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new GbpConfigError(
      'GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET が未設定です',
    );
  }
  return { clientId, clientSecret };
}

export function buildAuthorizeUrl(state: string): string {
  const { clientId } = clientCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getGbpRedirectUri(),
    response_type: 'code',
    scope: GBP_SCOPE,
    // refresh_token を得るために必須
    access_type: 'offline',
    // 再連携時にも refresh_token を確実に受け取る
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

async function postToken(body: URLSearchParams): Promise<GbpTokenResponse> {
  return withRetry(async () => {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text();
    if (!response.ok) {
      // invalid_grant = ユーザーが連携解除した / トークンが失効した
      if (text.includes('invalid_grant')) {
        throw new GbpAuthRevokedError('GBPの認可が取り消されています。再連携が必要です。');
      }
      throw new HttpError(
        `GBP token request failed: ${response.status} ${text.slice(0, 300)}`,
        response.status,
        parseRetryAfter(response.headers.get('retry-after')),
      );
    }
    return JSON.parse(text) as GbpTokenResponse;
  });
}

export async function exchangeAuthorizationCode(code: string): Promise<GbpTokenResponse> {
  const { clientId, clientSecret } = clientCredentials();
  return postToken(
    new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getGbpRedirectUri(),
      grant_type: 'authorization_code',
    }),
  );
}

/** 注意: レスポンスに refresh_token は通常含まれない。保存済みの値を維持すること */
export async function refreshAccessToken(refreshToken: string): Promise<GbpTokenResponse> {
  const { clientId, clientSecret } = clientCredentials();
  return postToken(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  );
}

/** 連携解除時のベストエフォート失効。失敗してもローカルの削除は続行する */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(REVOKE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.error('GBPトークンの失効に失敗しました (ローカルの削除は継続します):', error);
  }
}
