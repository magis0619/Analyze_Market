import Link from 'next/link';
import { loginAction } from '@/server/auth/actions';
import { AuthForm } from '@/features/auth/AuthForm';

export const metadata = { title: 'ログイン | Salon Area Coach AI' };

export default function LoginPage() {
  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">ログイン</h2>
      <AuthForm action={loginAction} submitLabel="ログイン" />
      <p className="mt-4 text-center text-sm text-slate-500">
        アカウントをお持ちでない方は{' '}
        <Link href="/signup" className="text-slate-900 underline">
          新規登録
        </Link>
      </p>
    </div>
  );
}
