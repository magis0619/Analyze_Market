import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { getSalonByOrganization } from '@/server/domain/salons/queries';
import { getCompetitors } from '@/server/queries/competitors';
import { CompetitorsMap } from '@/features/competitors/CompetitorsMap';
import { CompetitorsTable } from '@/features/competitors/CompetitorsTable';
import { CollectNowButton } from '@/features/collection/CollectNowButton';

export const metadata = { title: '競合 | Salon Area Coach AI' };

export default async function CompetitorsPage() {
  const user = await requireUser();
  const salon = await getSalonByOrganization(user.organizationId);
  if (!salon) redirect('/onboarding');

  const competitors = await getCompetitors(salon.id, {
    latitude: salon.latitude,
    longitude: salon.longitude,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">競合</h1>
          <p className="text-sm text-slate-500">
            商圏半径 {salon.tradeAreaRadiusM === 500 ? '500m' : '1km'} 内の美容院スナップショット
          </p>
        </div>
        <CollectNowButton salonId={salon.id} />
      </div>

      <CompetitorsMap
        salon={{
          name: salon.name,
          latitude: salon.latitude,
          longitude: salon.longitude,
          radiusM: salon.tradeAreaRadiusM,
        }}
        competitors={competitors}
      />

      <CompetitorsTable competitors={competitors} />

      <p className="text-center text-xs text-slate-400">地図データ © OpenStreetMap contributors</p>
    </div>
  );
}
