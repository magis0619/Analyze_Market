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

async function isAuthenticated(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  const secret = process.env.AUTH_SECRET || 'dev-only-insecure-secret';
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
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
