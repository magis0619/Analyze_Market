'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/server/db/client';
import { organizationMembers, organizations, salons, users } from '@/server/db/schema';
import { hashPassword, verifyPassword } from './password';
import { clearSessionCookie, setSessionCookie } from './session';

export interface AuthFormState {
  error: string | null;
}

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email('メールアドレスの形式が正しくありません'),
  password: z.string().min(8, 'パスワードは8文字以上で入力してください'),
});

export async function signupAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '入力内容を確認してください' };
  }
  const { email, password } = parsed.data;

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing.length > 0) {
    return { error: 'このメールアドレスは既に登録されています' };
  }

  const passwordHash = await hashPassword(password);
  const userId = await db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ email, passwordHash }).returning({ id: users.id });
    if (!user) throw new Error('failed to create user');
    const [org] = await tx
      .insert(organizations)
      .values({ name: `${email.split('@')[0]} のサロン` })
      .returning({ id: organizations.id });
    if (!org) throw new Error('failed to create organization');
    await tx
      .insert(organizationMembers)
      .values({ organizationId: org.id, userId: user.id, role: 'owner' });
    return user.id;
  });

  await setSessionCookie(userId);
  redirect('/onboarding');
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: 'メールアドレスまたはパスワードが正しくありません' };
  }
  const { email, password } = parsed.data;

  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email));
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: 'メールアドレスまたはパスワードが正しくありません' };
  }

  await setSessionCookie(user.id);

  // 店舗未登録ならオンボーディングへ
  const [membership] = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, user.id));
  if (membership) {
    const [salon] = await db
      .select({ id: salons.id })
      .from(salons)
      .where(eq(salons.organizationId, membership.organizationId))
      .limit(1);
    if (!salon) redirect('/onboarding');
  }
  redirect('/dashboard');
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect('/login');
}
