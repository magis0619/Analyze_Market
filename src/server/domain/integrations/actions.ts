'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { salons } from '@/server/db/schema';
import { requireUser } from '@/server/auth/session';
import { getOwnedSalon } from '@/server/domain/salons/queries';
import { parseLocationName } from '@/server/integrations/gbp/ids';
import { revokeToken } from '@/server/integrations/gbp/oauth';
import {
  clearGbpCredentials,
  loadGbpCredentials,
  saveGbpCredentials,
} from '@/server/integrations/gbp/token-store';

export interface GbpActionResult {
  error: string | null;
}

/**
 * OAuth後に対象のGBP店舗を選ぶ。
 * accountName と locationId は**別々に**保存する (v1とv4でパス形式が違うため)。
 */
export async function selectGbpLocationAction(
  salonId: string,
  accountName: string,
  v1LocationName: string,
  locationTitle: string,
): Promise<GbpActionResult> {
  const user = await requireUser();
  const salon = await getOwnedSalon(salonId, user.organizationId);
  if (!salon) return { error: '店舗が見つかりません' };

  const credentials = await loadGbpCredentials(salonId);
  if (!credentials) return { error: 'GBP連携が見つかりません。再度連携してください。' };

  let locationId: string;
  try {
    locationId = parseLocationName(v1LocationName);
  } catch {
    return { error: '店舗IDの形式が不正です' };
  }

  await saveGbpCredentials(salonId, {
    ...credentials,
    accountName,
    locationId,
    locationTitle,
  });

  // 店舗が確定した時点で収集ソースをGBPに切り替える
  await db
    .update(salons)
    .set({ salonProfile: { ...salon.salonProfile, dataMode: 'gbp' } })
    .where(eq(salons.id, salonId));

  revalidatePath('/settings');
  revalidatePath('/dashboard');
  return { error: null };
}

/**
 * 連携解除。
 * dataMode は 'manual' に倒す ('demo' には戻さない) —
 * 実店舗のデータを黙って架空データに置き換える方が害が大きいため。
 */
export async function disconnectGbpAction(salonId: string): Promise<GbpActionResult> {
  const user = await requireUser();
  const salon = await getOwnedSalon(salonId, user.organizationId);
  if (!salon) return { error: '店舗が見つかりません' };

  const credentials = await loadGbpCredentials(salonId);
  if (credentials?.refreshToken) {
    // Google側の失効はベストエフォート (失敗してもローカルは消す)
    await revokeToken(credentials.refreshToken);
  }
  await clearGbpCredentials(salonId);

  if (salon.salonProfile.dataMode === 'gbp') {
    await db
      .update(salons)
      .set({ salonProfile: { ...salon.salonProfile, dataMode: 'manual' } })
      .where(eq(salons.id, salonId));
  }

  revalidatePath('/settings');
  revalidatePath('/dashboard');
  return { error: null };
}
