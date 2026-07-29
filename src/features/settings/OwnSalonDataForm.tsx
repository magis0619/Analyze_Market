'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveOwnSalonDataAction } from '@/server/domain/salons/actions';

interface Props {
  salonId: string;
  currentMode: 'demo' | 'manual';
  currentRating: number | null;
  currentReviewCount: number | null;
}

interface ReviewForm {
  star: string;
  comment: string;
}

const inputClass =
  'w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none';

export function OwnSalonDataForm({ salonId, currentMode, currentRating, currentReviewCount }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [mode, setMode] = useState<'demo' | 'manual'>(currentMode);
  const [rating, setRating] = useState(currentRating !== null ? String(currentRating) : '4.0');
  const [reviewCount, setReviewCount] = useState(
    currentReviewCount !== null ? String(currentReviewCount) : '0',
  );
  const [reviews, setReviews] = useState<ReviewForm[]>([]);

  const submit = () => {
    setMessage(null);
    if (mode === 'manual') {
      const ratingValue = Number(rating);
      const countValue = Number(reviewCount);
      if (!Number.isFinite(ratingValue) || ratingValue < 1 || ratingValue > 5) {
        setMessage('評価は1〜5で入力してください');
        setIsError(true);
        return;
      }
      if (!Number.isInteger(countValue) || countValue < 0) {
        setMessage('口コミ数を正しく入力してください');
        setIsError(true);
        return;
      }
      for (const review of reviews) {
        if (!review.comment.trim()) {
          setMessage('口コミ本文を入力してください');
          setIsError(true);
          return;
        }
      }
    }
    startTransition(async () => {
      const result = await saveOwnSalonDataAction(
        salonId,
        mode,
        mode === 'manual'
          ? {
              rating: Number(rating),
              reviewCount: Number(reviewCount),
              reviews: reviews.map((review) => ({
                star: Number(review.star),
                comment: review.comment.trim(),
              })),
            }
          : null,
      );
      setMessage(
        result.error ??
          (mode === 'manual'
            ? '保存しました。次回の収集で変化として検知されます。'
            : '保存しました。'),
      );
      setIsError(result.error !== null);
      if (!result.error) {
        setReviews([]);
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-4">
      {message ? (
        <p
          role="status"
          className={`rounded border p-3 text-sm ${
            isError
              ? 'border-red-300 bg-red-50 text-red-800'
              : 'border-emerald-300 bg-emerald-50 text-emerald-800'
          }`}
        >
          {message}
        </p>
      ) : null}
      <div className="flex gap-3">
        {(
          [
            ['demo', 'デモデータ'],
            ['manual', '手入力'],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className={`flex cursor-pointer items-center gap-2 rounded border px-4 py-2 text-sm ${
              mode === value ? 'border-slate-900 bg-slate-50 font-medium' : 'border-slate-200'
            }`}
          >
            <input type="radio" checked={mode === value} onChange={() => setMode(value)} />
            {label}
          </label>
        ))}
      </div>

      {mode === 'manual' ? (
        <div className="space-y-3 rounded border border-slate-200 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">現在の評価 (1〜5)</label>
              <input
                className={inputClass}
                inputMode="decimal"
                value={rating}
                onChange={(e) => setRating(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">口コミ数</label>
              <input
                className={inputClass}
                inputMode="numeric"
                value={reviewCount}
                onChange={(e) => setReviewCount(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-slate-500">新しく届いた口コミ (任意、最大5件)</p>
            {reviews.map((review, index) => (
              <div key={index} className="flex gap-2">
                <select
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                  value={review.star}
                  onChange={(e) =>
                    setReviews((current) =>
                      current.map((r, i) => (i === index ? { ...r, star: e.target.value } : r)),
                    )
                  }
                >
                  {[1, 2, 3, 4, 5].map((star) => (
                    <option key={star} value={String(star)}>
                      ★{star}
                    </option>
                  ))}
                </select>
                <input
                  className={inputClass}
                  placeholder="口コミ本文"
                  value={review.comment}
                  onChange={(e) =>
                    setReviews((current) =>
                      current.map((r, i) => (i === index ? { ...r, comment: e.target.value } : r)),
                    )
                  }
                />
                <button
                  type="button"
                  className="text-sm text-slate-400 hover:text-red-600"
                  onClick={() => setReviews((current) => current.filter((_, i) => i !== index))}
                >
                  削除
                </button>
              </div>
            ))}
            {reviews.length < 5 ? (
              <button
                type="button"
                className="text-sm text-slate-600 underline"
                onClick={() => setReviews((current) => [...current, { star: '5', comment: '' }])}
              >
                + 口コミを追加
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          デモモードでは収集のたびに架空の評価・口コミが変化します。
        </p>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={submit}
        className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? '保存中…' : '保存'}
      </button>
    </div>
  );
}
