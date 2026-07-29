'use client';

import { useState, useTransition } from 'react';
import { startCollectionAction } from '@/server/domain/collection/actions';

export function CollectNowButton({
  salonId,
  blockedReason = null,
}: {
  salonId: string;
  /** 予算・実行間隔で収集できない場合の理由。UXとしての無効化で、関門はサーバ側 */
  blockedReason?: string | null;
}) {
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
      {(message ?? blockedReason) ? (
        <p className={`text-xs ${isError ? 'text-red-600' : 'text-slate-500'}`}>
          {message ?? blockedReason}
        </p>
      ) : null}
      <button
        type="button"
        onClick={run}
        title={blockedReason ?? undefined}
        disabled={pending || blockedReason !== null}
        className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? '収集中…' : '今すぐ収集'}
      </button>
    </div>
  );
}
