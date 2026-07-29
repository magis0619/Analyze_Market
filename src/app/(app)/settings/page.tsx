import { and, desc, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { collectionRuns, entities, observations } from '@/server/db/schema';
import { requireUser } from '@/server/auth/session';
import { getSalonByOrganization } from '@/server/domain/salons/queries';
import { SalonSettingsForm } from '@/features/settings/SalonSettingsForm';
import { OwnSalonDataForm } from '@/features/settings/OwnSalonDataForm';
import { formatDateTime } from '@/features/shared/labels';
import { getGbpConnectionSummary } from '@/server/domain/integrations/queries';
import { GbpIntegrationCard } from '@/features/settings/GbpIntegrationCard';
import { SOURCE_LABELS } from '@/server/domain/collection/sources';

export const metadata = { title: '設定 | Salon Area Coach AI' };

const RUN_STATUS_LABELS: Record<string, string> = {
  running: '実行中',
  success: '成功',
  partial: '一部失敗',
  failed: '失敗',
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ gbp?: string }>;
}) {
  const { gbp } = await searchParams;
  const user = await requireUser();
  const salon = await getSalonByOrganization(user.organizationId);
  if (!salon) redirect('/onboarding');

  // 自店舗の最新KPI (手入力フォームの初期値)
  const [ownEntity] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(and(eq(entities.salonId, salon.id), eq(entities.entityType, 'own_salon')))
    .limit(1);
  let currentRating: number | null = null;
  let currentReviewCount: number | null = null;
  if (ownEntity) {
    for (const metric of ['rating', 'review_count'] as const) {
      const [row] = await db
        .select({ value: observations.numericValue })
        .from(observations)
        .where(and(eq(observations.entityId, ownEntity.id), eq(observations.metricKey, metric)))
        .orderBy(desc(observations.observedAt))
        .limit(1);
      if (metric === 'rating') currentRating = row?.value ?? null;
      else currentReviewCount = row?.value ?? null;
    }
  }

  const gbpConnection = await getGbpConnectionSummary(salon.id);

  const runs = await db
    .select()
    .from(collectionRuns)
    .where(eq(collectionRuns.salonId, salon.id))
    .orderBy(desc(collectionRuns.startedAt))
    .limit(20);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-bold">設定</h1>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-500">店舗情報</h2>
        <SalonSettingsForm
          salonId={salon.id}
          initial={{
            name: salon.name,
            address: salon.address,
            latitude: salon.latitude,
            longitude: salon.longitude,
            googlePlaceId: salon.googlePlaceId,
            tradeAreaRadiusM: salon.tradeAreaRadiusM,
            salonType: salon.salonProfile.salonType,
            targetCustomer: salon.salonProfile.targetCustomer,
            priceBand: salon.salonProfile.priceBand,
            strengths: salon.salonProfile.strengths,
          }}
        />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">
          Googleビジネスプロフィール連携
        </h2>
        <GbpIntegrationCard salonId={salon.id} summary={gbpConnection} statusParam={gbp} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-500">自店舗データ</h2>
        <p className="mb-4 text-xs text-slate-500">
          収集時に自店舗の評価・口コミをどこから取得するかを選びます。
        </p>
        <OwnSalonDataForm
          salonId={salon.id}
          currentMode={salon.salonProfile.dataMode}
          currentRating={currentRating}
          currentReviewCount={currentReviewCount}
          gbpReady={gbpConnection.ready}
        />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">収集履歴</h2>
        {runs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="px-2 py-1.5 font-medium">開始</th>
                  <th className="px-2 py-1.5 font-medium">ソース</th>
                  <th className="px-2 py-1.5 font-medium">結果</th>
                  <th className="px-2 py-1.5 font-medium">詳細</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b border-slate-100 text-xs last:border-0">
                    <td className="px-2 py-1.5 whitespace-nowrap">{formatDateTime(run.startedAt)}</td>
                    <td className="px-2 py-1.5">{SOURCE_LABELS[run.source] ?? run.source}</td>
                    <td className="px-2 py-1.5">
                      <span
                        className={
                          run.status === 'success'
                            ? 'text-emerald-700'
                            : run.status === 'running'
                              ? 'text-slate-500'
                              : 'text-red-700'
                        }
                      >
                        {RUN_STATUS_LABELS[run.status] ?? run.status}
                      </span>
                    </td>
                    <td className="max-w-[240px] truncate px-2 py-1.5 text-slate-500">
                      {run.errorSummary ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">まだ収集履歴がありません。</p>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">アカウント</h2>
        <p className="text-sm">
          メールアドレス: <span className="font-medium">{user.email}</span>
        </p>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <button
            type="button"
            disabled
            title="今後対応予定 (BACKLOG.md 参照)"
            className="cursor-not-allowed rounded border border-slate-200 px-4 py-2 text-sm text-slate-300"
          >
            全データを削除して退会 (今後対応予定)
          </button>
        </div>
      </section>
    </div>
  );
}
