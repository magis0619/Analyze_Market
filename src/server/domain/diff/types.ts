import type { ChangeEventType, EntityType, Severity } from '@/server/db/schema';

/** 差分計算対象のエンティティ (entities テーブル由来のマスタ情報) */
export interface DiffEntity {
  entityId: string;
  entityType: EntityType;
  name: string;
  isExcluded: boolean;
  isPriority: boolean;
  /** 自店舗からの距離 (m)。競合のみ。説明文に使う */
  distanceM: number | null;
}

export interface MetricPoint {
  value: number;
  observationId: string;
  observedAt: Date;
}

export interface StatusPoint {
  status: string;
  observationId: string;
}

export interface ReviewPoint {
  observationId: string;
  star: number;
  replied: boolean;
  comment: string;
}

/**
 * ある時点のスナップショット。
 * - metrics: `${entityId}:${metricKey}` → 最新の数値観測
 * - statuses: entityId → 最新の business_status
 * - reviews: reviewId → 口コミ観測 (自店舗)
 * - presentEntityIds: この時点で観測が存在したエンティティ
 */
export interface Snapshot {
  metrics: Map<string, MetricPoint>;
  statuses: Map<string, StatusPoint>;
  reviews: Map<string, ReviewPoint>;
  presentEntityIds: Set<string>;
}

export function emptySnapshot(): Snapshot {
  return {
    metrics: new Map(),
    statuses: new Map(),
    reviews: new Map(),
    presentEntityIds: new Set(),
  };
}

export function metricKeyOf(entityId: string, metricKey: string): string {
  return `${entityId}:${metricKey}`;
}

/** change_events へ insert する前のドラフト */
export interface ChangeEventDraft {
  entityId: string | null;
  eventType: ChangeEventType;
  severity: Severity;
  title: string;
  description: string;
  evidenceObservationIds: string[];
}
