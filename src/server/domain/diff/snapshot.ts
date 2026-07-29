import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { entities, observations } from '@/server/db/schema';
import { distanceMeters } from '@/server/domain/geo';
import { emptySnapshot, metricKeyOf, type DiffEntity, type Snapshot } from './types';

const NUMERIC_METRICS = ['rating', 'review_count'] as const;

export interface DiffInputs {
  entities: DiffEntity[];
  prev: Snapshot;
  curr: Snapshot;
}

/**
 * 差分エンジンへの入力を DB から構築する。
 * - prev: cutoff (前回差分実行時刻) 以前の最新観測。cutoff が null なら空 (初回)
 * - curr: 全期間の最新観測。presence は cutoff 以降に観測があるかで判定する
 *   (収集で返ってこなくなった競合を「消失」として検知するため)
 */
export async function loadDiffInputs(
  salonId: string,
  salonLocation: { latitude: number; longitude: number },
  cutoff: Date | null,
): Promise<DiffInputs> {
  const entityRows = await db
    .select()
    .from(entities)
    .where(eq(entities.salonId, salonId));

  const diffEntities: DiffEntity[] = entityRows.map((row) => ({
    entityId: row.id,
    entityType: row.entityType,
    name: row.name,
    isExcluded: row.isExcluded,
    isPriority: row.isPriority,
    distanceM:
      row.latitude !== null && row.longitude !== null
        ? distanceMeters(salonLocation, { latitude: row.latitude, longitude: row.longitude })
        : null,
  }));

  const prev = emptySnapshot();
  const curr = emptySnapshot();

  const obsRows = await db
    .select({
      id: observations.id,
      entityId: observations.entityId,
      metricKey: observations.metricKey,
      numericValue: observations.numericValue,
      textValue: observations.textValue,
      jsonValue: observations.jsonValue,
      observedAt: observations.observedAt,
    })
    .from(observations)
    .where(
      and(
        eq(observations.salonId, salonId),
        inArray(
          observations.metricKey,
          [...NUMERIC_METRICS, 'business_status', 'review'].map(String),
        ),
      ),
    )
    .orderBy(asc(observations.observedAt));

  const entityIds = new Set(entityRows.map((row) => row.id));

  // 観測は時系列昇順なので、後から来たものが「最新」として上書きされる
  for (const row of obsRows) {
    if (!entityIds.has(row.entityId)) continue;

    const inPrev = cutoff !== null && row.observedAt <= cutoff;
    const inCurrWindow = cutoff === null || row.observedAt > cutoff;

    if (row.metricKey === 'review') {
      const json = row.jsonValue as
        | { reviewId?: string; star?: number; replied?: boolean; comment?: string }
        | null;
      if (!json?.reviewId) continue;
      const point = {
        observationId: row.id,
        star: typeof json.star === 'number' ? json.star : (row.numericValue ?? 0),
        replied: json.replied === true,
        comment: typeof json.comment === 'string' ? json.comment : '',
      };
      if (inPrev) prev.reviews.set(json.reviewId, point);
      curr.reviews.set(json.reviewId, point);
      continue;
    }

    if (row.metricKey === 'business_status') {
      const point = { status: row.textValue ?? 'OPERATIONAL', observationId: row.id };
      if (inPrev) {
        prev.statuses.set(row.entityId, point);
        prev.presentEntityIds.add(row.entityId);
      }
      curr.statuses.set(row.entityId, point);
      if (inCurrWindow) curr.presentEntityIds.add(row.entityId);
      continue;
    }

    if (row.numericValue === null) continue;
    const point = {
      value: row.numericValue,
      observationId: row.id,
      observedAt: row.observedAt,
    };
    const key = metricKeyOf(row.entityId, row.metricKey);
    if (inPrev) {
      prev.metrics.set(key, point);
      prev.presentEntityIds.add(row.entityId);
    }
    curr.metrics.set(key, point);
    if (inCurrWindow) curr.presentEntityIds.add(row.entityId);
  }

  return { entities: diffEntities, prev, curr };
}
