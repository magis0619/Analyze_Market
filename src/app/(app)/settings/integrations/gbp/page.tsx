import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { getSalonByOrganization } from '@/server/domain/salons/queries';
import { loadGbpCredentials } from '@/server/integrations/gbp/token-store';
import { listSelectableLocations } from '@/server/integrations/gbp/locations';
import { GbpLocationPicker } from '@/features/settings/GbpLocationPicker';

export const metadata = { title: 'GBP店舗選択 | Salon Area Coach AI' };

export default async function GbpLocationSelectPage() {
  const user = await requireUser();
  const salon = await getSalonByOrganization(user.organizationId);
  if (!salon) redirect('/onboarding');

  const credentials = await loadGbpCredentials(salon.id);
  if (!credentials) redirect('/settings?gbp=not_connected');

  let locations: Awaited<ReturnType<typeof listSelectableLocations>> = [];
  let loadError: string | null = null;
  try {
    locations = await listSelectableLocations(salon.id, credentials);
  } catch (error) {
    // API割当の承認がまだ下りていない場合もここに来る。
    // 何が起きているか分かるよう、原因の候補まで書く。
    console.error('GBP店舗一覧の取得に失敗しました:', error);
    loadError =
      '店舗一覧を取得できませんでした。Business Profile APIのアクセス申請が承認済みか、連携が有効かをご確認ください。';
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/settings" className="text-xs text-slate-500 underline">
          ← 設定
        </Link>
        <h1 className="mt-2 text-xl font-bold">連携する店舗を選択</h1>
        <p className="mt-1 text-sm text-slate-500">
          この店舗の自店舗データ (評価・口コミ・返信状況) の取得元になります。
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        {loadError ? (
          <div className="space-y-3">
            <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              {loadError}
            </p>
            <a
              href="/api/integrations/gbp/authorize"
              className="inline-block rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              再連携する
            </a>
          </div>
        ) : (
          <GbpLocationPicker
            salonId={salon.id}
            locations={locations}
            currentLocationTitle={credentials.locationTitle}
          />
        )}
      </div>
    </div>
  );
}
