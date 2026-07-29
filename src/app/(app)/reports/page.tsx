import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { getSalonByOrganization } from '@/server/domain/salons/queries';
import { listReports } from '@/server/queries/reports';
import { RISK_LEVEL_LABELS, formatDate, formatDateTime } from '@/features/shared/labels';

export const metadata = { title: 'レポート | Salon Area Coach AI' };

export default async function ReportsPage() {
  const user = await requireUser();
  const salon = await getSalonByOrganization(user.organizationId);
  if (!salon) redirect('/onboarding');

  const reports = await listReports(salon.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-bold">レポート</h1>
      {reports.length > 0 ? (
        <ul className="space-y-3">
          {reports.map((report) => (
            <li key={report.id}>
              <Link
                href={`/reports/${report.id}`}
                className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-400"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">
                    {formatDate(report.periodStart)} 〜 {formatDate(report.periodEnd)}
                  </span>
                  <span className="rounded-full border border-slate-300 px-2 py-0.5 text-xs">
                    {RISK_LEVEL_LABELS[report.riskLevel] ?? report.riskLevel}
                  </span>
                  <span className="text-xs text-slate-400">
                    提案 {report.recommendationCount}件 ·{' '}
                    {report.model === 'rule-based-fallback' ? 'ルールベース生成' : 'AI生成'}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-slate-600">{report.summary}</p>
                <p className="mt-1 text-xs text-slate-400">
                  生成: {formatDateTime(report.generatedAt)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          まだレポートがありません。ダッシュボードの「今すぐ収集」を実行してください。
        </p>
      )}
    </div>
  );
}
