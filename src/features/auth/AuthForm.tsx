'use client';

import { useActionState } from 'react';
import type { AuthFormState } from '@/server/auth/actions';

interface Props {
  action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  submitLabel: string;
}

export function AuthForm({ action, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, { error: null });

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">
          メールアドレス
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">
          パスワード (8文字以上)
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="current-password"
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? '送信中…' : submitLabel}
      </button>
    </form>
  );
}
