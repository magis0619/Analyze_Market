import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/server/auth/session';
import { getSalonByOrganization } from '@/server/domain/salons/queries';
import { exchangeAuthorizationCode } from '@/server/integrations/gbp/oauth';
import { saveGbpCredentials } from '@/server/integrations/gbp/token-store';
import { getAppUrl } from '@/server/config/app-url';
import { GBP_STATE_COOKIE } from '../authorize/route';

export const dynamic = 'force-dynamic';

/** 長さ検査を先に行う (timingSafeEqual は長さ不一致で throw するため) */
function statesMatch(expected: string | undefined, actual: string): boolean {
  if (!expected || expected.length !== actual.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

export async function GET(request: NextRequest) {
  const appUrl = getAppUrl();
  const settingsUrl = (status: string) => new URL(`/settings?gbp=${status}`, appUrl);

  // state は CSRF 対策であって本人確認ではない。ユーザーは必ず再認証する
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL('/login', appUrl));
  }

  const jar = await cookies();
  const expectedState = jar.get(GBP_STATE_COOKIE)?.value;
  // 単回使用。成否によらず必ず削除する
  jar.delete(GBP_STATE_COOKIE);

  const params = request.nextUrl.searchParams;
  if (params.get('error')) {
    return NextResponse.redirect(settingsUrl('denied'));
  }

  const state = params.get('state') ?? '';
  const code = params.get('code') ?? '';
  if (!statesMatch(expectedState, state)) {
    return NextResponse.redirect(settingsUrl('state_mismatch'));
  }
  if (!code) {
    return NextResponse.redirect(settingsUrl('no_code'));
  }

  const salon = await getSalonByOrganization(user.organizationId);
  if (!salon) {
    return NextResponse.redirect(new URL('/onboarding', appUrl));
  }

  try {
    const tokens = await exchangeAuthorizationCode(code);
    if (!tokens.refresh_token) {
      // access_type=offline & prompt=consent を送っているので通常は届く。
      // 届かない場合は再連携でやり直してもらう (アクセストークンだけでは
      // 1時間後に収集が止まり、原因が分かりにくい状態になる)
      return NextResponse.redirect(settingsUrl('no_refresh_token'));
    }

    await saveGbpCredentials(salon.id, {
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scope: tokens.scope,
      // 店舗選択はこの後の画面で行う
      accountName: null,
      locationId: null,
      locationTitle: null,
    });
  } catch (error) {
    console.error('GBPトークン交換に失敗しました:', error);
    return NextResponse.redirect(settingsUrl('exchange_failed'));
  }

  return NextResponse.redirect(new URL('/settings/integrations/gbp', appUrl));
}
