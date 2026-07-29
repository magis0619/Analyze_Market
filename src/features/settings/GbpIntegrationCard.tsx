'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { disconnectGbpAction } from '@/server/domain/integrations/actions';
import type { GbpConnectionSummary } from '@/server/domain/integrations/queries';
import { formatDateTime } from '@/features/shared/labels';

interface Props {
  salonId: string;
  summary: GbpConnectionSummary;
  /** クエリ ?gbp=... で渡ってくる連携結果 */
  statusParam?: string;
}

const STATUS_MESSAGES: Record<string, { text: string; error: boolean }> = {
  denied: { text: 'Google側で連携が拒否されました。', error: true },
  state_mismatch: {
    text: '連携の検証に失敗しました。お手数ですが最初からやり直してください。',
    error: true,
  },
  no_code: { text: '認可コードを受け取れませんでした。', error: true },
  no_refresh_token: {
    text: '再連携用のトークンを取得できませんでした。Googleアカウントの連携を一度解除してからお試しください。',
    error: true,
  },
  exchange_failed: { text: 'トークンの取得に失敗しました。', error: true },
  not_configured: {
    text: 'GOOGLE_OAUTH_CLIENT_ID / SECRET が未設定です。',
    error: true,
  },
  connected: { text: '連携しました。', error: false },
};

export function GbpIntegrationCard({ salonId, summary, statusParam }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const message = statusParam ? STATUS_MESSAGES[statusParam] : undefined;

  const disconnect = () => {
    if (!confirm('GBP連携を解除しますか？自店舗データは手入力モードに切り替わります。')) return;
    setError(null);
    startTransition(async () => {
      const result = await disconnectGbpAction(salonId);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {message ? (
        <p
          role="status"
          className={`rounded border p-3 text-sm ${
            message.error
              ? 'border-red-300 bg-red-50 text-red-800'
              : 'border-emerald-300 bg-emerald-50 text-emerald-800'
          }`}
        >
          {message.text}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {summary.status === 'error' ? (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">連携が切れました。再連携してください。</p>
          <p className="mt-1 text-xs">
            自店舗データは前回取得した値のまま表示されています。
          </p>
        </div>
      ) : null}

      {!summary.connected ? (
        <>
          <p className="text-sm text-slate-600">
            Googleビジネスプロフィールと連携すると、自店舗の評価・口コミ・返信状況を自動で取得できます。
          </p>
          <a
            href="/api/integrations/gbp/authorize"
            className="inline-block rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Googleビジネスプロフィールと連携
          </a>
        </>
      ) : summary.needsLocation ? (
        <>
          <p className="text-sm text-slate-600">
            連携済みですが、対象の店舗が未選択です。
          </p>
          <Link
            href="/settings/integrations/gbp"
            className="inline-block rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            店舗を選択
          </Link>
        </>
      ) : (
        <>
          <dl className="space-y-1 text-sm">
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-slate-500">連携店舗</dt>
              <dd className="font-medium">{summary.locationTitle ?? '—'}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-slate-500">最終同期</dt>
              <dd>{formatDateTime(summary.lastSyncedAt)}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <a
              href="/api/integrations/gbp/authorize"
              className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              再連携
            </a>
            <Link
              href="/settings/integrations/gbp"
              className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              店舗を変更
            </Link>
            <button
              type="button"
              disabled={pending}
              onClick={disconnect}
              className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            >
              {pending ? '解除中…' : '連携を解除'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
