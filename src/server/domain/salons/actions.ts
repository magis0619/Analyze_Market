'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/server/db/client';
import { entities, integrations, observations, salons } from '@/server/db/schema';
import { requireUser } from '@/server/auth/session';
import { runCollection } from '@/server/domain/collection/run-collection';
import {
  OWN_SALON_ENTITY_SOURCE,
  OWN_SALON_EXTERNAL_ID,
} from '@/server/integrations/own-salon/normalize';
import { getOwnedSalon, getSalonByOrganization } from './queries';

const manualReviewSchema = z.object({
  star: z.number().int().min(1).max(5),
  comment: z.string().trim().min(1).max(500),
});

const manualKpiSchema = z.object({
  rating: z.number().min(1).max(5),
  reviewCount: z.number().int().min(0),
  reviews: z.array(manualReviewSchema).max(5),
});

const createSalonSchema = z.object({
  name: z.string().trim().min(1, '店舗名を入力してください').max(100),
  address: z.string().trim().min(1, '住所を入力してください').max(200),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  googlePlaceId: z.string().trim().max(300).optional(),
  tradeAreaRadiusM: z.union([z.literal(500), z.literal(1000)]),
  salonType: z.string().trim().min(1).max(50),
  targetCustomer: z.string().trim().max(100),
  priceBand: z.string().trim().max(100),
  strengths: z.string().trim().max(500),
  dataMode: z.enum(['demo', 'manual']),
  manualKpi: manualKpiSchema.nullable(),
});

export type CreateSalonInput = z.infer<typeof createSalonSchema>;

export interface CreateSalonResult {
  error: string | null;
}

/** own_salon エンティティを取得または作成し、手入力観測を保存する */
export async function saveManualObservations(
  salonId: string,
  kpi: z.infer<typeof manualKpiSchema>,
): Promise<void> {
  const [entity] = await db
    .insert(entities)
    .values({
      salonId,
      entityType: 'own_salon',
      externalSource: OWN_SALON_ENTITY_SOURCE,
      externalId: OWN_SALON_EXTERNAL_ID,
      name: '自店舗',
    })
    .onConflictDoUpdate({
      target: [entities.salonId, entities.externalSource, entities.externalId],
      set: { isActive: true },
    })
    .returning({ id: entities.id });
  if (!entity) throw new Error('failed to upsert own salon entity');

  const now = Date.now();
  await db.insert(observations).values([
    {
      salonId,
      entityId: entity.id,
      source: 'manual' as const,
      metricKey: 'rating',
      numericValue: kpi.rating,
    },
    {
      salonId,
      entityId: entity.id,
      source: 'manual' as const,
      metricKey: 'review_count',
      numericValue: kpi.reviewCount,
    },
    ...kpi.reviews.map((review, index) => ({
      salonId,
      entityId: entity.id,
      source: 'manual' as const,
      metricKey: 'review',
      numericValue: review.star,
      jsonValue: {
        reviewId: `manual-${now}-${index}`,
        star: review.star,
        comment: review.comment,
        createdAt: new Date().toISOString(),
        replied: false,
      },
    })),
  ]);
}

export async function createSalonAction(input: CreateSalonInput): Promise<CreateSalonResult> {
  const user = await requireUser();

  const existing = await getSalonByOrganization(user.organizationId);
  if (existing) {
    redirect('/dashboard');
  }

  const parsed = createSalonSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '入力内容を確認してください' };
  }
  const data = parsed.data;

  const [salon] = await db
    .insert(salons)
    .values({
      organizationId: user.organizationId,
      name: data.name,
      address: data.address,
      latitude: data.latitude,
      longitude: data.longitude,
      googlePlaceId: data.googlePlaceId || null,
      tradeAreaRadiusM: data.tradeAreaRadiusM,
      salonProfile: {
        salonType: data.salonType,
        targetCustomer: data.targetCustomer,
        priceBand: data.priceBand,
        strengths: data.strengths,
        dataMode: data.dataMode,
      },
    })
    .returning({ id: salons.id });
  if (!salon) {
    return { error: '店舗の登録に失敗しました' };
  }

  await db.insert(integrations).values([
    { salonId: salon.id, provider: 'google_places' },
    { salonId: salon.id, provider: 'own_salon' },
  ]);

  if (data.dataMode === 'manual' && data.manualKpi) {
    await saveManualObservations(salon.id, data.manualKpi);
  }

  // 初回収集 (初回診断)。失敗してもダッシュボードへ進み、失敗状態はダッシュボードに表示される
  try {
    await runCollection(salon.id);
  } catch (error) {
    console.error('初回収集に失敗しました:', error);
  }

  redirect('/dashboard');
}

const updateSalonSchema = createSalonSchema.omit({ dataMode: true, manualKpi: true });

export interface UpdateSalonResult {
  error: string | null;
  saved: boolean;
}

export async function updateSalonAction(
  salonId: string,
  input: z.infer<typeof updateSalonSchema>,
): Promise<UpdateSalonResult> {
  const user = await requireUser();
  const salon = await getOwnedSalon(salonId, user.organizationId);
  if (!salon) return { error: '店舗が見つかりません', saved: false };

  const parsed = updateSalonSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '入力内容を確認してください', saved: false };
  }
  const data = parsed.data;

  await db
    .update(salons)
    .set({
      name: data.name,
      address: data.address,
      latitude: data.latitude,
      longitude: data.longitude,
      googlePlaceId: data.googlePlaceId || null,
      tradeAreaRadiusM: data.tradeAreaRadiusM,
      salonProfile: {
        ...salon.salonProfile,
        salonType: data.salonType,
        targetCustomer: data.targetCustomer,
        priceBand: data.priceBand,
        strengths: data.strengths,
      },
    })
    .where(eq(salons.id, salonId));

  revalidatePath('/settings');
  revalidatePath('/dashboard');
  return { error: null, saved: true };
}

export interface SetDataModeResult {
  error: string | null;
  saved: boolean;
}

/** 自店舗データモードの切替 + 手入力KPIの保存 (設定画面から使用) */
export async function saveOwnSalonDataAction(
  salonId: string,
  dataMode: 'demo' | 'manual',
  manualKpi: z.infer<typeof manualKpiSchema> | null,
): Promise<SetDataModeResult> {
  const user = await requireUser();
  const salon = await getOwnedSalon(salonId, user.organizationId);
  if (!salon) return { error: '店舗が見つかりません', saved: false };

  if (dataMode === 'manual' && manualKpi) {
    const parsed = manualKpiSchema.safeParse(manualKpi);
    if (!parsed.success) {
      return { error: '評価・口コミの入力内容を確認してください', saved: false };
    }
    await saveManualObservations(salonId, parsed.data);
  }

  await db
    .update(salons)
    .set({ salonProfile: { ...salon.salonProfile, dataMode } })
    .where(eq(salons.id, salonId));

  revalidatePath('/settings');
  revalidatePath('/dashboard');
  return { error: null, saved: true };
}
