import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { getSalonByOrganization } from '@/server/domain/salons/queries';
import { getDashboardData } from '@/server/queries/dashboard';
import { CollectNowButton } from '@/features/collection/CollectNowButton';
import { getPlacesModeLabel } from '@/server/integrations/modes';
import { checkBudget } from '@/server/domain/collection/budget-gate';
import { BUCKET_LABELS } from '@/server/domain/collection/budget';
import { SOURCE_LABELS } from '@/server/domain/collection/sources';
import {
  DIFFICULTY_LABELS,
  OWN_SALON_MODE_LABELS,
  RECOMMENDATION_STATUS_LABELS,
  RISK_LEVEL_LABELS,
  SEVERITY_BADGE_CLASSES,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
  formatDate,
  formatDateTime,
  trendLabel,
} from '@/features/shared/labels';

export const metadata = { title: 'ダッシュボード | Salon Area Coach AI' };


function KpiDelta({
  current,
  previous,
  invertGood = false,
  unit = '',
}: {
  current: { value: number } | null;
  previous: { value: number } | null;
  invertGood?: boolean;
  unit?: string;
}) {
  if (!current) return <p className="text-lg font-bold text-slate-400">観測不足</p>;
  const delta = previous ? current.value - previous.value : null;
  const label = trendLabel(delta === null ? null : invertGood ? -delta : delta);
  return (
    <div>
      <p className="text-2xl font-bold">
        {Number.isInteger(current.value) ? current.value : current.value.toFixed(1)}
        {unit}
      </p>
      <p className="text-xs text-slate-500">
        {previous
          ? `前回 ${Number.isInteger(previous.value) ? previous.value : previous.value.toFixed(1)}${unit} · ${label}`
          : '前回データなし (観測不足)'}
      </p>
    </div>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const salon = await getSalonByOrganization(user.organizationId);
  if (!salon) redirect('/onboarding');

  const data = await getDashboardData(salon.id, salon.salonProfile.dataMode);
  const budget = await checkBudget(salon.id, salon.salonProfile.dataMode);
  const topEvents = [...data.events]
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        b.detectedAt.getTime() - a.detectedAt.getTime(),
    )
    .slice(0, 10);
  const topRecommendations = data.recommendations.slice(0, 3);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">今週の経営判断</h1>
        <CollectNowButton salonId={salon.id} blockedReason={budget.reason} />
      </div>

      {/* 上限に達したバケットがある場合の予告。全滅ならボタン側にも文言が出る */}
      {budget.verdict.blocked.length > 0 ? (
        <div
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p className="font-medium">
            API利用上限に達しています: {budget.verdict.blocked.map((b) => BUCKET_LABELS[b]).join(' / ')}
          </p>
          <p className="mt-1 text-xs">
            該当データは今回の収集をスキップし、前回値を表示しています。上限は日本時間の0時にリセットされます
            (設定 &gt; API利用状況)。
          </p>
        </div>
      ) : null}

      {/* 1. 今週の総評 */}
      {/* 実AI生成が期待されているのにフォールバックされた = 実API経路が壊れている。
          中立的なバッジで済ませると「壊れているのに正常に見える」ため警告として出す */}
      {data.aiDegraded ? (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800"
        >
          <p className="font-medium">AI生成に失敗したため簡易生成に切り替わっています。</p>
          <p className="mt-1 text-xs">
            設定 &gt; 収集履歴 で「AIコーチ生成」の失敗理由を確認してください。
          </p>
        </div>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-500">今週の総評</h2>
          {data.report ? (
            <>
              <span className="rounded-full border border-slate-300 px-2 py-0.5 text-xs">
                {RISK_LEVEL_LABELS[data.report.riskLevel] ?? data.report.riskLevel}
              </span>
              {data.report.model === 'rule-based-fallback' ? (
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    data.aiDegraded
                      ? 'border-red-300 bg-red-50 text-red-700'
                      : 'border-slate-200 bg-slate-50 text-slate-500'
                  }`}
                >
                  ルールベース生成
                </span>
              ) : (
                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                  AI生成
                </span>
              )}
            </>
          ) : null}
        </div>
        {data.report ? (
          <>
            <p className="text-sm leading-relaxed">{data.report.summary}</p>
            {data.report.dataQualityNote ? (
              <p className="mt-2 text-xs text-slate-500">📎 {data.report.dataQualityNote}</p>
            ) : null}
            <p className="mt-2 text-xs text-slate-400">
              生成: {formatDateTime(data.report.generatedAt)} ·{' '}
              <Link href={`/reports/${data.report.id}`} className="underline">
                レポート詳細
              </Link>
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-500">
            まだレポートがありません。「今すぐ収集」を実行してください。
          </p>
        )}
      </section>

      {/* 2. 今週やること */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">今週やること</h2>
        {topRecommendations.length > 0 ? (
          <ol className="space-y-3">
            {topRecommendations.map((rec) => (
              <li key={rec.id} className="rounded border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {rec.priority}. {rec.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">{rec.action}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      期限 {formatDate(rec.dueDate)} · 難易度{' '}
                      {DIFFICULTY_LABELS[rec.difficulty] ?? rec.difficulty} ·{' '}
                      {RECOMMENDATION_STATUS_LABELS[rec.status]}
                    </p>
                  </div>
                  <Link
                    href={`/recommendations/${rec.id}`}
                    className="shrink-0 rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                  >
                    {rec.status === 'proposed' ? '実施する' : '詳細'}
                  </Link>
                </div>
                {rec.evidence.length > 0 ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-slate-500">
                      根拠 ({rec.evidence.length}件)
                    </summary>
                    <ul className="mt-1 list-inside list-disc text-xs text-slate-600">
                      {rec.evidence.map((event) => (
                        <li key={event.id}>{event.title}</li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  <p className="mt-2 text-xs text-amber-700">観測不足のため根拠が限定的です</p>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-slate-500">
            {data.report
              ? '観測不足のため、今週の提案はありません。次回の収集で変化を検知すると提案が生成されます。'
              : 'レポート生成後に表示されます。'}
          </p>
        )}
      </section>

      {/* 3. 重要な変化 */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">重要な変化</h2>
        {topEvents.length > 0 ? (
          <ul className="space-y-2">
            {topEvents.map((event) => (
              <li key={event.id} className="flex items-start gap-2 text-sm">
                <span
                  className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold ${SEVERITY_BADGE_CLASSES[event.severity]}`}
                >
                  {SEVERITY_LABELS[event.severity]}
                </span>
                <span className="min-w-0">
                  {event.title}
                  <span className="ml-2 text-xs text-slate-400">
                    {formatDateTime(event.detectedAt)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">
            まだ変化はありません。2回目以降の収集で前回との差分を検知します。
          </p>
        )}
      </section>

      {/* 4-5. 自店舗KPI / 競合状況 */}
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">自店舗KPI</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500">評価</p>
              <KpiDelta current={data.kpi.rating.current} previous={data.kpi.rating.previous} />
            </div>
            <div>
              <p className="text-xs text-slate-500">口コミ数</p>
              <KpiDelta
                current={data.kpi.reviewCount.current}
                previous={data.kpi.reviewCount.previous}
                unit="件"
              />
            </div>
          </div>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">競合状況</h2>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-2xl font-bold">{data.competitorStats.activeCount}</p>
              <p className="text-xs text-slate-500">競合数</p>
            </div>
            <div>
              <p className="text-2xl font-bold">
                {data.competitorStats.averageRating?.toFixed(1) ?? '—'}
              </p>
              <p className="text-xs text-slate-500">平均評価</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{data.competitorStats.priorityCount}</p>
              <p className="text-xs text-slate-500">重要競合</p>
            </div>
          </div>
          <p className="mt-3 text-right text-xs">
            <Link href="/competitors" className="text-slate-600 underline">
              競合一覧・地図を見る →
            </Link>
          </p>
        </section>
      </div>

      {/* 6. データ鮮度 */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">データ鮮度・連携状態</h2>
        <ul className="space-y-2 text-sm">
          {data.freshness.map((item) => (
            <li key={item.source} className="flex flex-wrap items-center gap-2">
              <span className="w-36 shrink-0 text-slate-600">
                {SOURCE_LABELS[item.source] ?? item.source}
              </span>
              {item.source === 'google_places' ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-500">
                  {getPlacesModeLabel()}
                </span>
              ) : null}
              {item.source === 'own_salon' || item.source === 'gbp' ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-500">
                  {OWN_SALON_MODE_LABELS[salon.salonProfile.dataMode]}
                </span>
              ) : null}
              <span className="text-xs text-slate-400">
                最終更新: {formatDateTime(item.completedAt)}
              </span>
              {item.status === 'failed' || item.status === 'partial' ? (
                <span className="text-xs text-red-600">
                  取得に失敗しました。前回のデータを表示しています。
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <p className="text-center text-xs text-slate-400">
        地図データ © OpenStreetMap contributors · AI提案は経営成果を保証するものではありません
      </p>
    </div>
  );
}
