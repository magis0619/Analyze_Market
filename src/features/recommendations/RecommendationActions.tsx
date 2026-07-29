'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { RecommendationStatus } from '@/server/db/schema';
import { updateRecommendationAction } from '@/server/domain/recommendations/actions';

interface Props {
  recommendationId: string;
  status: RecommendationStatus;
  ownerNote: string | null;
  outcomeRating: number | null;
}

export function RecommendationActions({ recommendationId, status, ownerNote, outcomeRating }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState(ownerNote ?? '');
  const [rating, setRating] = useState<number>(outcomeRating ?? 3);
  const [showComplete, setShowComplete] = useState(false);

  const update = (input: {
    status?: 'accepted' | 'on_hold' | 'rejected' | 'completed';
    ownerNote?: string;
    outcomeRating?: number;
  }) => {
    setError(null);
    startTransition(async () => {
      const result = await updateRecommendationAction(recommendationId, input);
      if (result.error) {
        setError(result.error);
      } else {
        setShowComplete(false);
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {status === 'proposed' || status === 'on_hold' ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => update({ status: 'accepted' })}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            実施する
          </button>
        ) : null}
        {status === 'proposed' || status === 'accepted' ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => update({ status: 'on_hold' })}
            className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            保留
          </button>
        ) : null}
        {status !== 'rejected' && status !== 'completed' ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => update({ status: 'rejected' })}
            className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 disabled:opacity-50"
          >
            却下
          </button>
        ) : null}
        {status === 'accepted' ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => setShowComplete((current) => !current)}
            className="rounded border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            完了した
          </button>
        ) : null}
      </div>

      {showComplete ? (
        <div className="rounded border border-slate-200 p-4">
          <p className="mb-2 text-sm font-medium">結果の自己評価</p>
          <div className="mb-3 flex gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRating(value)}
                aria-label={`${value}点`}
                className={`text-2xl ${value <= rating ? 'text-amber-500' : 'text-slate-300'}`}
              >
                ★
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => update({ status: 'completed', outcomeRating: rating, ownerNote: note })}
            className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {pending ? '保存中…' : '完了として記録'}
          </button>
        </div>
      ) : null}

      <div>
        <label htmlFor="note" className="mb-1 block text-sm font-medium">
          実施メモ
        </label>
        <textarea
          id="note"
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="実施した内容や気づきを記録"
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => update({ ownerNote: note })}
          className="mt-2 rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          メモを保存
        </button>
      </div>
    </div>
  );
}
