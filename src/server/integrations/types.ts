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

/** 正規化済みの観測値 (observations への insert 素材)。entity は externalId で参照する */
export interface NormalizedObservationDraft {
  externalSource: ExternalSource;
  externalId: string;
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
  /** API呼び出し回数などコスト監査用 */
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
