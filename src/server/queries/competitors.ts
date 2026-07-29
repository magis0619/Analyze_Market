import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { collectionRuns, entities, observations } from '@/server/db/schema';
import { distanceMeters } from '@/server/domain/geo';

export interface CompetitorItem {
  entityId: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  distanceM: number | null;
  rating: number | null;
  ratingPrev: number | null;
  reviewCount: number | null;
  reviewCountPrev: number | null;
  businessStatus: string | null;
  isExcluded: boolean;
  isPriority: boolean;
  isNew: boolean;
}

/**
 * 競合一覧。各競合の最新/前回の評価・口コミ数と営業状態を含む。
 * isNew は「直前の収集以降に初めて観測された」ことを表す。
 */
export async function getCompetitors(
  salonId: string,
  salonLocation: { latitude: number; longitude: number },
): Promise<CompetitorItem[]> {
  const rows = await db
    .select()
    .from(entities)
    .where(
      and(
        eq(entities.salonId, salonId),
        eq(entities.entityType, 'competitor'),
        eq(entities.isActive, true),
      ),
    );
  if (rows.length === 0) return [];

  // 「新規」判定の基準: 直近から2番目に成功した google_places 収集の完了時刻
  const runRows = await db
    .select({ completedAt: collectionRuns.completedAt })
    .from(collectionRuns)
    .where(
      and(
        eq(collectionRuns.salonId, salonId),
        eq(collectionRuns.source, 'google_places'),
        eq(collectionRuns.status, 'success'),
      ),
    )
    .orderBy(desc(collectionRuns.completedAt))
    .limit(2);
  const newSince = runRows.length >= 2 ? (runRows[1]?.completedAt ?? null) : null;

  const ids = rows.map((row) => row.id);
  const obsRows = await db
    .select({
      entityId: observations.entityId,
      metricKey: observations.metricKey,
      numericValue: observations.numericValue,
      textValue: observations.textValue,
      observedAt: observations.observedAt,
    })
    .from(observations)
    .where(
      and(
        inArray(observations.entityId, ids),
        inArray(observations.metricKey, ['rating', 'review_count', 'business_status']),
      ),
    )
    .orderBy(desc(observations.observedAt));

  // entity×metric ごとに最新と前回の値を保持する
  const latest = new Map<string, number | string>();
  const previous = new Map<string, number | string>();
  for (const row of obsRows) {
    const key = `${row.entityId}:${row.metricKey}`;
    const value = row.metricKey === 'business_status' ? row.textValue : row.numericValue;
    if (value === null) continue;
    if (!latest.has(key)) {
      latest.set(key, value);
    } else if (!previous.has(key)) {
      previous.set(key, value);
    }
  }

  const numberOf = (map: Map<string, number | string>, key: string): number | null => {
    const value = map.get(key);
    return typeof value === 'number' ? value : null;
  };

  return rows.map((row) => ({
    entityId: row.id,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    distanceM:
      row.latitude !== null && row.longitude !== null
        ? distanceMeters(salonLocation, { latitude: row.latitude, longitude: row.longitude })
        : null,
    rating: numberOf(latest, `${row.id}:rating`),
    ratingPrev: numberOf(previous, `${row.id}:rating`),
    reviewCount: numberOf(latest, `${row.id}:review_count`),
    reviewCountPrev: numberOf(previous, `${row.id}:review_count`),
    businessStatus: (latest.get(`${row.id}:business_status`) as string | undefined) ?? null,
    isExcluded: row.isExcluded,
    isPriority: row.isPriority,
    isNew: newSince !== null && row.firstSeenAt > newSince,
  }));
}
