'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/server/db/client';
import { recommendations, type RecommendationStatus } from '@/server/db/schema';
import { requireUser } from '@/server/auth/session';
import { getOwnedSalon } from '@/server/domain/salons/queries';

/** 許可されるステータス遷移 (US-005) */
const VALID_TRANSITIONS: Record<RecommendationStatus, RecommendationStatus[]> = {
  proposed: ['accepted', 'on_hold', 'rejected'],
  on_hold: ['accepted', 'rejected'],
  accepted: ['completed', 'on_hold', 'rejected'],
  completed: [],
  rejected: [],
};

const updateSchema = z.object({
  status: z.enum(['accepted', 'on_hold', 'rejected', 'completed']).optional(),
  ownerNote: z.string().trim().max(1000).optional(),
  outcomeRating: z.number().int().min(1).max(5).optional(),
});

export interface UpdateRecommendationResult {
  error: string | null;
}

export async function updateRecommendationAction(
  recommendationId: string,
  input: z.infer<typeof updateSchema>,
): Promise<UpdateRecommendationResult> {
  const user = await requireUser();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: '入力内容を確認してください' };
  }

  const [rec] = await db
    .select()
    .from(recommendations)
    .where(eq(recommendations.id, recommendationId))
    .limit(1);
  if (!rec) return { error: '提案が見つかりません' };
  const salon = await getOwnedSalon(rec.salonId, user.organizationId);
  if (!salon) return { error: '提案が見つかりません' };

  const { status, ownerNote, outcomeRating } = parsed.data;

  if (status && !VALID_TRANSITIONS[rec.status].includes(status)) {
    return { error: `「${rec.status}」から「${status}」への変更はできません` };
  }
  if (status === 'completed' && outcomeRating === undefined) {
    return { error: '完了時は結果の自己評価 (1〜5) を選択してください' };
  }

  await db
    .update(recommendations)
    .set({
      ...(status ? { status } : {}),
      ...(status === 'completed'
        ? { completedAt: sql`now()`, outcomeRating: outcomeRating ?? null }
        : {}),
      ...(ownerNote !== undefined ? { ownerNote: ownerNote || null } : {}),
    })
    .where(and(eq(recommendations.id, recommendationId)));

  revalidatePath(`/recommendations/${recommendationId}`);
  revalidatePath('/dashboard');
  revalidatePath('/reports');
  return { error: null };
}
