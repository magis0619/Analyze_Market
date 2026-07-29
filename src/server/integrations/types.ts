import type { EntityType, ExternalSource } from '@/server/db/schema';

/** 正規化済みの観測対象 (entities への upsert 素材) */
export interface NormalizedEntity {
  entityType: EntityType;
  externalSource: ExternalSource;
  externalId: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  attributes: Record<string, unknown>;
}

/**
 * 正規化済みの観測値 (observations への insert 素材)。
 * externalSource/externalId は対象エンティティの参照、source は実際のデータ取得元。
 */
export interface NormalizedObservationDraft {
  externalSource: ExternalSource;
  externalId: string;
  source: ExternalSource;
  metricKey: string;
  numericValue?: number;
  textValue?: string;
  jsonValue?: Record<string, unknown>;
  sourceUpdatedAt?: Date;
  confidence?: number;
}

export interface NormalizedCollection {
  entities: NormalizedEntity[];
  observations: NormalizedObservationDraft[];
  /**
   * コスト監査用メタデータ。collection_runs.cost_metadata に保存される。
   *
   * **契約**: すべてのアダプタは `billableCalls` (課金対象となった外部API呼び出し回数、
   * 再試行を含む。モックは 0) を必ず含めること。予算enforcement (domain/collection/budget.ts)
   * はこのキーだけを見る。それ以外のキーは自由 (件数などの詳細)。
   */
  costMetadata: Record<string, number>;
}

/**
 * 外部データソースの共通アダプタ (仕様05)。
 * collect() は外部APIのワイヤ形式をそのまま返し、normalize() でドメイン型へ変換する。
 * 実装は real / mock の両方が同じ normalize を通る。
 */
export interface DataSourceAdapter<TInput, TRaw> {
  sourceName: ExternalSource;
  mode: 'real' | 'mock';
  collect(input: TInput): Promise<TRaw>;
  normalize(raw: TRaw): NormalizedCollection;
}
