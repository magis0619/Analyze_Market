import {
  boolean,
  doublePrecision,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { salons } from './salons';

export type EntityType = 'own_salon' | 'competitor' | 'facility' | 'region';
/**
 * external_source の値。entities では観測対象の識別体系 ('own_salon' は自店舗の固定キー)、
 * observations の source では実際のデータ取得元 ('own_salon_mock' / 'manual' など) を表す。
 */
export type ExternalSource =
  | 'google_places'
  | 'own_salon'
  | 'own_salon_mock'
  | 'manual'
  | 'osm'
  | 'resas';

/** 観測対象の共通マスタ (自店舗・競合・施設・地域) */
export const entities = pgTable(
  'entities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    salonId: uuid('salon_id')
      .notNull()
      .references(() => salons.id),
    entityType: text('entity_type').$type<EntityType>().notNull(),
    externalSource: text('external_source').$type<ExternalSource>().notNull(),
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    attributes: jsonb('attributes').$type<Record<string, unknown>>().notNull().default({}),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    isActive: boolean('is_active').notNull().default(true),
    isExcluded: boolean('is_excluded').notNull().default(false),
    isPriority: boolean('is_priority').notNull().default(false),
  },
  (t) => [
    uniqueIndex('entities_salon_source_external_uq').on(t.salonId, t.externalSource, t.externalId),
    index('entities_salon_type_active_idx').on(t.salonId, t.entityType, t.isActive),
  ],
);

export const observations = pgTable(
  'observations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    salonId: uuid('salon_id')
      .notNull()
      .references(() => salons.id),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entities.id),
    source: text('source').$type<ExternalSource>().notNull(),
    metricKey: text('metric_key').notNull(),
    numericValue: doublePrecision('numeric_value'),
    textValue: text('text_value'),
    jsonValue: jsonb('json_value').$type<Record<string, unknown>>(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
    sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }),
    confidence: doublePrecision('confidence').notNull().default(1),
  },
  (t) => [
    index('observations_salon_metric_observed_idx').on(
      t.salonId,
      t.metricKey,
      t.observedAt.desc(),
    ),
    index('observations_entity_metric_observed_idx').on(
      t.entityId,
      t.metricKey,
      t.observedAt.desc(),
    ),
  ],
);

export const collectionRuns = pgTable(
  'collection_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    salonId: uuid('salon_id')
      .notNull()
      .references(() => salons.id),
    source: text('source').notNull(),
    status: text('status', { enum: ['running', 'success', 'partial', 'failed'] }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    errorSummary: text('error_summary'),
    costMetadata: jsonb('cost_metadata').$type<Record<string, number>>(),
  },
  (t) => [index('collection_runs_salon_started_idx').on(t.salonId, t.startedAt.desc())],
);

export type ChangeEventType =
  | 'new_competitor'
  | 'competitor_closed'
  | 'rating_change'
  | 'review_count_change'
  | 'own_low_rating_review'
  | 'own_rating_change';

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export const changeEvents = pgTable(
  'change_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    salonId: uuid('salon_id')
      .notNull()
      .references(() => salons.id),
    entityId: uuid('entity_id').references(() => entities.id),
    eventType: text('event_type').$type<ChangeEventType>().notNull(),
    severity: text('severity').$type<Severity>().notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    evidenceObservationIds: uuid('evidence_observation_ids').array().notNull(),
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
    status: text('status', { enum: ['new', 'read', 'dismissed'] })
      .notNull()
      .default('new'),
  },
  (t) => [index('change_events_salon_detected_idx').on(t.salonId, t.detectedAt.desc())],
);
