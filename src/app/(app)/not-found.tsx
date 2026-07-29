import Link from 'next/link';

export default function AppNotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="mb-2 text-lg font-bold">ページが見つかりません</p>
      <p className="mb-6 text-sm text-slate-500">
        お探しのデータは存在しないか、削除された可能性があります。
      </p>
      <Link
        href="/dashboard"
        className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        ダッシュボードへ戻る
      </Link>
    </div>
  );
}
