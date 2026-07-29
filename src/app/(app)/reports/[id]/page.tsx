import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { getSalonByOrganization } from '@/server/domain/salons/queries';
import { getReportDetail } from '@/server/queries/reports';
import {
  DIFFICULTY_LABELS,
  RECOMMENDATION_STATUS_LABELS,
  RISK_LEVEL_LABELS,
  SEVERITY_BADGE_CLASSES,
  SEVERITY_LABELS,
  formatDate,
  formatDateTime,
} from '@/features/shared/labels';

export const metadata = { title: 'レポート詳細 | Salon Area Coach AI' };

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const salon = await getSalonByOrganization(user.organizationId);
  if (!salon) redirect('/onboarding');

  const detail = await getReportDetail(salon.id, id);
  if (!detail) notFound();

  const { report, events, recommendations } = detail;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/reports" className="text-xs text-slate-500 underline">
          ← レポート一覧
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">
            {formatDate(report.periodStart)} 〜 {formatDate(report.periodEnd)}
          </h1>
          <span className="rounded-full border border-slate-300 px-2 py-0.5 text-xs">
            {RISK_LEVEL_LABELS[report.riskLevel] ?? report.riskLevel}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-500">
            {report.model === 'rule-based-fallback' ? 'ルールベース生成' : `AI生成 (${report.model})`}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-400">生成: {formatDateTime(report.generatedAt)}</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-500">要約</h2>
        <p className="text-sm leading-relaxed">{report.summary}</p>
        {report.dataQualityNote ? (
          <p className="mt-2 text-xs text-slate-500">📎 {report.dataQualityNote}</p>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">提案</h2>
        {recommendations.length > 0 ? (
          <ul className="space-y-3">
            {recommendations.map((rec) => (
              <li key={rec.id} className="rounded border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {rec.priority}. {rec.title}
                  </p>
                  <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-500">
                    {RECOMMENDATION_STATUS_LABELS[rec.status]}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">{rec.action}</p>
                <p className="mt-1 text-xs text-slate-400">
                  期限 {formatDate(rec.dueDate)} · 難易度{' '}
                  {DIFFICULTY_LABELS[rec.difficulty] ?? rec.difficulty}
                </p>
                <Link
                  href={`/recommendations/${rec.id}`}
                  className="mt-2 inline-block text-xs text-slate-600 underline"
                >
                  詳細・実施記録 →
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">この期間の提案はありません (観測不足)。</p>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">変化タイムラインと根拠</h2>
        {events.length > 0 ? (
          <ul className="space-y-3">
            {events.map((event) => (
              <li key={event.id} className="rounded border border-slate-200 p-3">
                <div className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold ${SEVERITY_BADGE_CLASSES[event.severity]}`}
                  >
                    {SEVERITY_LABELS[event.severity]}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{event.title}</p>
                    <p className="mt-0.5 text-xs text-slate-600">{event.description}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      検知: {formatDateTime(event.detectedAt)}
                    </p>
                  </div>
                </div>
                {event.evidenceObservations.length > 0 ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-slate-500">
                      元データ ({event.evidenceObservations.length}件の観測)
                    </summary>
                    <table className="mt-2 w-full text-xs">
                      <thead>
                        <tr className="text-left text-slate-400">
                          <th className="py-1 pr-2 font-medium">対象</th>
                          <th className="py-1 pr-2 font-medium">指標</th>
                          <th className="py-1 pr-2 font-medium">値</th>
                          <th className="py-1 pr-2 font-medium">出典</th>
                          <th className="py-1 font-medium">観測日時</th>
                        </tr>
                      </thead>
                      <tbody>
                        {event.evidenceObservations.map((obs) => (
                          <tr key={obs.id} className="border-t border-slate-100">
                            <td className="py-1 pr-2">{obs.entityName ?? '—'}</td>
                            <td className="py-1 pr-2">{obs.metricKey}</td>
                            <td className="py-1 pr-2">
                              {obs.numericValue ?? obs.textValue ?? '—'}
                            </td>
                            <td className="py-1 pr-2">{obs.source}</td>
                            <td className="py-1">{formatDateTime(obs.observedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">この期間に検知された変化はありません。</p>
        )}
      </section>
    </div>
  );
}
