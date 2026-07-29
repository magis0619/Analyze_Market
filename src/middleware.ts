// Edge で動くため jose のみに依存する (bcrypt や DB を import しない)
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_COOKIE = 'session';
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/competitors',
  '/reports',
  '/recommendations',
  '/settings',
  '/onboarding',
];

/** 開発時のみ使うフォールバック鍵。session.ts と同じ値 */
const DEV_FALLBACK_SECRET = 'dev-only-insecure-secret';

async function isAuthenticated(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;

  const configured = process.env.AUTH_SECRET;
  if (!configured && process.env.NODE_ENV === 'production') {
    // 本番で開発用の固定鍵にフォールバックすると、誰でも偽造したCookieで
    // 認証を通せてしまう。ここは fail closed にする。
    // (Edge middleware で throw すると全リクエストが500になるため、
    //  未認証扱い = ログイン画面へのリダイレクトに倒す)
    console.error('AUTH_SECRET が未設定です。全リクエストを未認証として扱います。');
    return false;
  }

  try {
    await jwtVerify(token, new TextEncoder().encode(configured || DEV_FALLBACK_SECRET));
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authed = await isAuthenticated(request);

  if (PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    if (!authed) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }

  if ((pathname === '/login' || pathname === '/signup') && authed) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/competitors/:path*',
    '/reports/:path*',
    '/recommendations/:path*',
    '/settings/:path*',
    '/onboarding/:path*',
    '/login',
    '/signup',
  ],
};
