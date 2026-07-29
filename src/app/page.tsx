import { redirect } from 'next/navigation';
import { getSessionUserId } from '@/server/auth/session';

export default async function Home() {
  const userId = await getSessionUserId();
  redirect(userId ? '/dashboard' : '/login');
}
