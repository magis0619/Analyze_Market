// 認証セッションの単一シーム。Supabase Auth 等へ移行する場合はこのモジュールを差し替える。
import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { organizationMembers, users } from '@/server/db/schema';

export const SESSION_COOKIE = 'session';
const SESSION_DAYS = 30;

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('AUTH_SECRET is not set');
    }
    console.warn('AUTH_SECRET が未設定のため開発用の固定シークレットを使用します');
    return new TextEncoder().encode('dev-only-insecure-secret');
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function setSessionCookie(userId: string): Promise<void> {
  const token = await createSessionToken(userId);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getSessionUserId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  organizationId: string;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      organizationId: organizationMembers.organizationId,
    })
    .from(users)
    .innerJoin(organizationMembers, eq(organizationMembers.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}
