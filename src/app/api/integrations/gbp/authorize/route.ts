import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/server/auth/session';
import { getSalonByOrganization } from '@/server/domain/salons/queries';
import { buildAuthorizeUrl, GbpConfigError } from '@/server/integrations/gbp/oauth';
import { getAppUrl } from '@/server/config/app-url';

// middleware の matcher は /api/* を含まないため、このルートは自前で認証する
export const dynamic = 'force-dynamic';

export const GBP_STATE_COOKIE = 'gbp_oauth_state';
const STATE_MAX_AGE_SECONDS = 600;

export async function GET() {
  const appUrl = getAppUrl();

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL('/login', appUrl));
  }
  const salon = await getSalonByOrganization(user.organizationId);
  if (!salon) {
    return NextResponse.redirect(new URL('/onboarding', appUrl));
  }

  let authorizeUrl: string;
  try {
    // CSRF対策。コールバックで定数時間比較する
    const state = randomBytes(32).toString('base64url');
    authorizeUrl = buildAuthorizeUrl(state);

    const jar = await cookies();
    jar.set(GBP_STATE_COOKIE, state, {
      httpOnly: true,
      // Google からはトップレベルGETで戻るため lax で通る
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/integrations/gbp',
      maxAge: STATE_MAX_AGE_SECONDS,
    });
  } catch (error) {
    if (error instanceof GbpConfigError) {
      return NextResponse.redirect(new URL('/settings?gbp=not_configured', appUrl));
    }
    throw error;
  }

  return NextResponse.redirect(authorizeUrl);
}
