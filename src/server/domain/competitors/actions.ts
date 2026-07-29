'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { entities } from '@/server/db/schema';
import { requireUser } from '@/server/auth/session';
import { getOwnedSalon } from '@/server/domain/salons/queries';

type EntityRow = typeof entities.$inferSelect;

async function getOwnedCompetitor(entityId: string): Promise<EntityRow | null> {
  const user = await requireUser();
  const [row] = await db.select().from(entities).where(eq(entities.id, entityId)).limit(1);
  if (!row || row.entityType !== 'competitor') return null;
  const salon = await getOwnedSalon(row.salonId, user.organizationId);
  return salon ? row : null;
}

/** 「競合から除外」のトグル (US-002)。除外時は重要競合フラグも外す */
export async function toggleExcludedAction(entityId: string): Promise<void> {
  const row = await getOwnedCompetitor(entityId);
  if (!row) return;
  await db
    .update(entities)
    .set({ isExcluded: !row.isExcluded, isPriority: false })
    .where(eq(entities.id, entityId));
  revalidatePath('/competitors');
  revalidatePath('/dashboard');
}

/** 「重要競合に設定」のトグル (US-002) */
export async function togglePriorityAction(entityId: string): Promise<void> {
  const row = await getOwnedCompetitor(entityId);
  if (!row || row.isExcluded) return;
  await db
    .update(entities)
    .set({ isPriority: !row.isPriority })
    .where(eq(entities.id, entityId));
  revalidatePath('/competitors');
  revalidatePath('/dashboard');
}
