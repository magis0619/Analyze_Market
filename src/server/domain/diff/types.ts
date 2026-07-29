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
  /** 口コミの投稿日時。未返信経過日数の判定に使う */
  createdAt: Date;
}

/**
 * 差分検知の時刻基準と、今回のデータ取得状況。
 * 差分エンジンは状態を持たないため、「7日経過」のような時間依存の判定を
 * 1回だけ発火させるには前回実行時刻 (since) が必要になる。
 */
export interface DiffClock {
  now: Date;
  /** 前回パイプライン完了時刻。初回は null */
  since: Date | null;
  /**
   * 今回の実行で競合データ (Places) を取得できたか。
   *
   * false のときは「不在」を閉店と解釈してはいけない。取得できなかっただけで
   * 全競合が curr から消えるため、API障害・予算上限・タイムアウトのたびに
   * 商圏内の全店舗へ competitor_closed が量産され、それがAIコーチの根拠になる。
   */
  competitorDataFresh: boolean;
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
