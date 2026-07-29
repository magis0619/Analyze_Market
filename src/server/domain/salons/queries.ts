import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { salons } from '@/server/db/schema';

export type SalonRow = typeof salons.$inferSelect;

/** 組織に紐づく店舗を取得する (MVPは1組織1店舗) */
export async function getSalonByOrganization(organizationId: string): Promise<SalonRow | null> {
  const [salon] = await db
    .select()
    .from(salons)
    .where(eq(salons.organizationId, organizationId))
    .limit(1);
  return salon ?? null;
}

/** 店舗の所有権を検証して取得する */
export async function getOwnedSalon(
  salonId: string,
  organizationId: string,
): Promise<SalonRow | null> {
  const [salon] = await db.select().from(salons).where(eq(salons.id, salonId)).limit(1);
  if (!salon || salon.organizationId !== organizationId) return null;
  return salon;
}
