import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { getSalonByOrganization } from '@/server/domain/salons/queries';
import { OnboardingWizard } from '@/features/onboarding/OnboardingWizard';

export const metadata = { title: '店舗登録 | Salon Area Coach AI' };

export default async function OnboardingPage() {
  const user = await requireUser();
  const salon = await getSalonByOrganization(user.organizationId);
  if (salon) redirect('/dashboard');

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-1 text-xl font-bold">店舗登録</h1>
      <p className="mb-6 text-sm text-slate-500">
        店舗情報を登録すると、商圏内の競合スナップショットと初回診断を生成します。
      </p>
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <OnboardingWizard />
      </div>
    </main>
  );
}
