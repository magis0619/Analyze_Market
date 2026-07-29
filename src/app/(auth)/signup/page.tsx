import Link from 'next/link';
import { signupAction } from '@/server/auth/actions';
import { AuthForm } from '@/features/auth/AuthForm';

export const metadata = { title: '新規登録 | Salon Area Coach AI' };

export default function SignupPage() {
  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">新規登録</h2>
      <AuthForm action={signupAction} submitLabel="アカウントを作成" />
      <p className="mt-4 text-center text-sm text-slate-500">
        既にアカウントをお持ちの方は{' '}
        <Link href="/login" className="text-slate-900 underline">
          ログイン
        </Link>
      </p>
    </div>
  );
}
