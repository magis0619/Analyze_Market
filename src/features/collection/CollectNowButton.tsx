'use client';

import { useState, useTransition } from 'react';
import { startCollectionAction } from '@/server/domain/collection/actions';

export function CollectNowButton({ salonId }: { salonId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const run = () => {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await startCollectionAction(salonId);
        setMessage(result.message);
        setIsError(!result.ok);
      } catch {
        setMessage('収集に失敗しました。時間をおいて再度お試しください。');
        setIsError(true);
      }
    });
  };

  return (
    <div className="flex items-center gap-3">
      {message ? (
        <p className={`text-xs ${isError ? 'text-red-600' : 'text-slate-500'}`}>{message}</p>
      ) : null}
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? '収集中…' : '今すぐ収集'}
      </button>
    </div>
  );
}
