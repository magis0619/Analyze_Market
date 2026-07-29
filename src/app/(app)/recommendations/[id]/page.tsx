import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { getSalonByOrganization } from '@/server/domain/salons/queries';
import { getRecommendationDetail } from '@/server/queries/reports';
import { RecommendationActions } from '@/features/recommendations/RecommendationActions';
import {
  DIFFICULTY_LABELS,
  RECOMMENDATION_STATUS_LABELS,
  SEVERITY_BADGE_CLASSES,
  SEVERITY_LABELS,
  formatDate,
  formatDateTime,
} from '@/features/shared/labels';

export const metadata = { title: '提案詳細 | Salon Area Coach AI' };

export default async function RecommendationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const salon = await getSalonByOrganization(user.organizationId);
  if (!salon) redirect('/onboarding');

  const detail = await getRecommendationDetail(salon.id, id);
  if (!detail) notFound();

  const { recommendation: rec, report, evidenceEvents } = detail;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        {report ? (
          <Link href={`/reports/${report.id}`} className="text-xs text-slate-500 underline">
            ← レポート ({formatDate(report.periodStart)} 〜 {formatDate(report.periodEnd)})
          </Link>
        ) : (
          <Link href="/dashboard" className="text-xs text-slate-500 underline">
            ← ダッシュボード
          </Link>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">{rec.title}</h1>
          <span className="rounded-full border border-slate-300 px-2 py-0.5 text-xs">
            {RECOMMENDATION_STATUS_LABELS[rec.status]}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          期限 {formatDate(rec.dueDate)} · 難易度 {DIFFICULTY_LABELS[rec.difficulty] ?? rec.difficulty}
          {rec.completedAt ? ` · 完了 ${formatDateTime(rec.completedAt)}` : ''}
          {rec.outcomeRating ? ` · 自己評価 ${'★'.repeat(rec.outcomeRating)}` : ''}
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-500">実行内容</h2>
        <p className="text-sm leading-relaxed">{rec.action}</p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-500">なぜ今やるのか</h2>
        <p className="text-sm leading-relaxed">{rec.rationale}</p>
        <p className="mt-2 text-xs text-slate-500">
          期待効果: {rec.expectedEffect} (効果の方向性であり、成果を保証するものではありません)
        </p>
      </section>

      {rec.steps.length > 0 ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-slate-500">実施手順</h2>
          <ol className="list-inside list-decimal space-y-1 text-sm">
            {rec.steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">根拠</h2>
        {evidenceEvents.length > 0 ? (
          <ul className="space-y-3">
            {evidenceEvents.map((event) => (
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
                    <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                      {event.evidenceObservations.map((obs) => (
                        <li key={obs.id}>
                          {obs.entityName ?? '—'} / {obs.metricKey}:{' '}
                          {obs.numericValue ?? obs.textValue ?? '—'} ({obs.source},{' '}
                          {formatDateTime(obs.observedAt)})
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-amber-700">
            観測不足のため根拠となる変化イベントがありません。
          </p>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">実施ステータス</h2>
        <RecommendationActions
          recommendationId={rec.id}
          status={rec.status}
          ownerNote={rec.ownerNote}
          outcomeRating={rec.outcomeRating}
        />
        {rec.ownerNote ? (
          <p className="mt-3 rounded bg-slate-50 p-3 text-sm text-slate-600">
            📝 {rec.ownerNote}
          </p>
        ) : null}
      </section>
    </div>
  );
}
