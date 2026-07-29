'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/session';
import { getOwnedSalon } from '@/server/domain/salons/queries';
import { runCollection, type CollectionResult } from './run-collection';

/** 「今すぐ収集」。所有権を検証してから収集パイプラインを同期実行する */
export async function startCollectionAction(salonId: string): Promise<CollectionResult> {
  const user = await requireUser();
  const salon = await getOwnedSalon(salonId, user.organizationId);
  if (!salon) {
    return { ok: false, message: '店舗が見つかりません', newEventCount: 0 };
  }

  const result = await runCollection(salon.id);

  revalidatePath('/dashboard');
  revalidatePath('/competitors');
  revalidatePath('/reports');
  return result;
}
