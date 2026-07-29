'use client';

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="mb-2 text-lg font-bold">エラーが発生しました</p>
      <p className="mb-6 text-sm text-slate-500">
        データの取得に失敗しました。時間をおいて再度お試しください。
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        再試行
      </button>
    </div>
  );
}
